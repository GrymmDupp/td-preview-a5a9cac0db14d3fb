// Supabase Edge Function: create-checkout  (STUB, not deployed)
// One endpoint for every payment flow. The PRICE IS RESOLVED HERE, server-side; the page never
// sends a price.
//   { product: 'unlock', listing_id }   unlock ONE listing's full file, permanently, for this account
//        effective_plan = 'standard' -> STRIPE_PRICE_UNLOCK_STANDARD  $9.00 one-time
//        effective_plan = 'monthly'  -> STRIPE_PRICE_UNLOCK_MONTHLY   $7.00 one-time
//        effective_plan = 'lifetime' -> STRIPE_PRICE_UNLOCK_LIFETIME  $5.00 one-time
//   { product: 'monthly'  }             STRIPE_PRICE_MONTHLY   $7.00 / month (subscription)
//   { product: 'lifetime' }             STRIPE_PRICE_LIFETIME  $49.00 one-time
//   { product: 'portal'   }             Stripe Billing Portal (cancel / resume / card update)
// Unlock and membership rows are written only by stripe-webhook after Stripe confirms payment.
//
// Deploy later:  supabase functions deploy create-checkout
// Secrets:       supabase secrets set STRIPE_SECRET_KEY=sk_live_... SITE_URL=https://... \
//                  STRIPE_PRICE_UNLOCK_STANDARD=price_... STRIPE_PRICE_UNLOCK_MONTHLY=price_... \
//                  STRIPE_PRICE_UNLOCK_LIFETIME=price_... STRIPE_PRICE_MONTHLY=price_... STRIPE_PRICE_LIFETIME=price_...
//                (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are provided automatically)
import Stripe from 'npm:stripe@16';
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k)!;
const stripe = new Stripe(env('STRIPE_SECRET_KEY'), { apiVersion: '2024-06-20' });
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const cors = { 'Access-Control-Allow-Origin': Deno.env.get('SITE_URL') ?? '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };
const ID = /^[a-z0-9-]{1,80}$/;
const UNLOCK_PRICE: Record<string, string> = {
  standard: 'STRIPE_PRICE_UNLOCK_STANDARD', monthly: 'STRIPE_PRICE_UNLOCK_MONTHLY', lifetime: 'STRIPE_PRICE_UNLOCK_LIFETIME' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const supa = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return new Response('Sign in first', { status: 401, headers: cors });

  const { product, listing_id, return_listing_id } = await req.json().catch(() => ({}));
  const site = env('SITE_URL');
  const back = return_listing_id && ID.test(return_listing_id) ? return_listing_id : '';
  // Effective plan read with the service role, so the client can't influence the price.
  const { data: plan } = await admin.rpc('effective_plan', { uid: user.id });
  const json = (o: unknown) => Response.json(o, { headers: cors });

  // Reuse one Stripe customer per account (stored on memberships rows when known).
  const { data: prior } = await admin.from('memberships').select('stripe_customer_id').eq('user_id', user.id).not('stripe_customer_id', 'is', null).limit(1).maybeSingle();
  const customer = prior?.stripe_customer_id ?? undefined;

  if (product === 'portal') {
    if (!customer) return new Response('No membership', { status: 404, headers: cors });
    const p = await stripe.billingPortal.sessions.create({ customer, return_url: `${site}/#/account` });
    return json({ url: p.url });
  }

  let params: Stripe.Checkout.SessionCreateParams;
  const base = { client_reference_id: user.id, ...(customer ? { customer } : { customer_email: user.email ?? undefined }) };
  if (product === 'unlock') {
    if (!listing_id || !ID.test(listing_id)) return new Response('Bad listing', { status: 400, headers: cors });
    const { data: existing } = await admin.from('unlocks').select('id').eq('user_id', user.id).eq('listing_id', listing_id).maybeSingle();
    if (existing) return json({ already: true });                                  // never charge twice
    const { data: full } = await admin.from('listing_full').select('listing_id').eq('listing_id', listing_id).maybeSingle();
    if (!full) return new Response('This file is not available to unlock yet', { status: 409, headers: cors });
    const tier = plan ?? 'standard';
    const metadata = { kind: 'unlock', user_id: user.id, listing_id, price_tier: tier };
    params = { ...base, mode: 'payment', line_items: [{ price: env(UNLOCK_PRICE[tier]), quantity: 1 }], metadata,
      payment_intent_data: { metadata }, success_url: `${site}/#/l/${listing_id}?unlocked=1`, cancel_url: `${site}/#/l/${listing_id}` };
  } else if (product === 'lifetime') {
    if (plan === 'lifetime') return json({ already: true });
    const metadata = { kind: 'lifetime', user_id: user.id };
    params = { ...base, mode: 'payment', line_items: [{ price: env('STRIPE_PRICE_LIFETIME'), quantity: 1 }], metadata,
      payment_intent_data: { metadata }, customer_creation: customer ? undefined : 'always',
      success_url: back ? `${site}/#/l/${back}?at=file` : `${site}/#/account`, cancel_url: back ? `${site}/#/l/${back}` : `${site}/#/account` };
  } else if (product === 'monthly') {
    if (plan === 'lifetime' || plan === 'monthly') return json({ already: true });
    const metadata = { kind: 'monthly', user_id: user.id };
    params = { ...base, mode: 'subscription', line_items: [{ price: env('STRIPE_PRICE_MONTHLY'), quantity: 1 }], metadata,
      subscription_data: { metadata },
      success_url: back ? `${site}/#/l/${back}?at=file` : `${site}/#/account`, cancel_url: back ? `${site}/#/l/${back}` : `${site}/#/account` };
  } else return new Response('Unknown product', { status: 400, headers: cors });

  const session = await stripe.checkout.sessions.create(params);
  return json({ url: session.url });
});
