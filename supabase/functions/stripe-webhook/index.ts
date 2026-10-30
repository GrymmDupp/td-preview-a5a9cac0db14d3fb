// Supabase Edge Function: stripe-webhook  (STUB, not deployed)
// Verifies Stripe's signature and writes with the service role. The ONLY writer of
// public.unlocks and public.memberships.
//
// Deploy later:  supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets:       supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_...
// Stripe Dashboard -> Developers -> Webhooks -> endpoint https://<project>.supabase.co/functions/v1/stripe-webhook
//   events: checkout.session.completed, checkout.session.async_payment_succeeded,
//           customer.subscription.created, customer.subscription.updated, customer.subscription.deleted,
//           invoice.paid, invoice.payment_failed, charge.refunded
//
// Subscription lifecycle (Monthly $7/mo) -> memberships row:
//   created / invoice.paid (renewed)     status 'active', current_period_end = Stripe's period end
//   updated with cancel_at_period_end    status 'canceled' (still effective until period end)
//   invoice.payment_failed               status 'past_due' (still effective until period end; Stripe retries)
//   deleted (period over or cancel now)  status 'ended'
// Ending a membership NEVER touches public.unlocks: files unlocked stay unlocked forever.
import Stripe from 'npm:stripe@16';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const iso = (t?: number | null) => (t ? new Date(t * 1000).toISOString() : null);
const ok = () => new Response('ok', { status: 200 });
const fail = (m: string) => new Response(m, { status: 500 });   // 500 -> Stripe retries

async function syncSubscription(sub: Stripe.Subscription, overrideStatus?: string) {
  const user_id = sub.metadata?.user_id;
  if (!user_id) return null;
  const status = overrideStatus ?? (sub.status === 'canceled' ? 'ended'
    : sub.cancel_at_period_end ? 'canceled' : sub.status === 'past_due' || sub.status === 'unpaid' ? 'past_due' : 'active');
  const { error } = await admin.from('memberships').upsert({
    user_id, plan: 'monthly', status, current_period_end: iso(sub.current_period_end),
    amount: (sub.items.data[0]?.price.unit_amount ?? 700) / 100, currency: sub.currency,
    stripe_customer_id: String(sub.customer), stripe_subscription_id: sub.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'stripe_subscription_id' });
  return error;
}

Deno.serve(async (req) => {
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), req.headers.get('stripe-signature')!, Deno.env.get('STRIPE_WEBHOOK_SECRET')!);
  } catch (e) { return new Response(`Bad signature: ${(e as Error).message}`, { status: 400 }); }

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const s = event.data.object as Stripe.Checkout.Session;
      const user_id = s.metadata?.user_id ?? s.client_reference_id;
      if (!user_id) return ok();
      if (s.metadata?.kind === 'monthly') {                   // subscription: row comes from customer.subscription.*
        if (s.subscription) { const err = await syncSubscription(await stripe.subscriptions.retrieve(String(s.subscription))); if (err) return fail(err.message); }
        return ok();
      }
      if (s.payment_status !== 'paid') return ok();
      const amount = (s.amount_total ?? 0) / 100;
      if (s.metadata?.kind === 'lifetime') {
        // Lifetime replaces Monthly: end the subscription now (no further charges). Unlocks are untouched.
        const { data: subs } = await admin.from('memberships').select('stripe_subscription_id').eq('user_id', user_id).eq('plan', 'monthly').neq('status', 'ended');
        for (const m of subs ?? []) if (m.stripe_subscription_id) await stripe.subscriptions.cancel(m.stripe_subscription_id).catch(() => {});
        const { error } = await admin.from('memberships').upsert({ user_id, plan: 'lifetime', status: 'active', amount, currency: s.currency,
          stripe_customer_id: s.customer ? String(s.customer) : null, stripe_checkout_id: s.id }, { onConflict: 'stripe_checkout_id', ignoreDuplicates: true });
        if (error) return fail(error.message);
      } else {
        const listing_id = s.metadata?.listing_id;
        if (!listing_id) return ok();
        const tier = ['monthly', 'lifetime'].includes(s.metadata?.price_tier ?? '') ? s.metadata!.price_tier : 'standard';
        const { error } = await admin.from('unlocks').upsert({ user_id, listing_id, payment_ref: s.id, price_tier: tier,
          amount_paid: amount, amount_cents: s.amount_total, currency: s.currency }, { onConflict: 'user_id,listing_id', ignoreDuplicates: true });
        if (error) return fail(error.message);
      }
      return ok();
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': { const err = await syncSubscription(event.data.object as Stripe.Subscription); return err ? fail(err.message) : ok(); }
    case 'customer.subscription.deleted': { const err = await syncSubscription(event.data.object as Stripe.Subscription, 'ended'); return err ? fail(err.message) : ok(); }
    case 'invoice.paid':
    case 'invoice.payment_failed': {                          // renewal succeeded / failed
      const inv = event.data.object as Stripe.Invoice;
      if (!inv.subscription) return ok();
      const sub = await stripe.subscriptions.retrieve(String(inv.subscription));
      const err = await syncSubscription(sub, event.type === 'invoice.payment_failed' ? 'past_due' : undefined);
      return err ? fail(err.message) : ok();
    }
    // Refund policy is Grymm's call (e.g. delete the unlock row on charge.refunded). Not automated here.
    default: return ok();
  }
});
