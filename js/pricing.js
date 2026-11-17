// Twisted Deeds pricing: ONE config file. Every price, founder rate and Stripe Payment Link lives here;
// the Patronage page, the unlock page, the research-pack page and the account page all read it.
//
// To open a product for sale: create its Payment Link in Stripe (see _build/STRIPE_LINKS_TODO.md), paste the
// public URL into `link` (or `founder.link`), and redeploy. While `link` is empty the app shows a quiet
// "Opening soon" state instead of a button. Payment Link URLs are public, not secrets.
//
// The full-file unlock is the one product that is live (verify-unlock unlocks it automatically). Its price in the
// browser is only a display: the server decides and records the amount (rpc request_unlock), and the live
// switches (founder_remaining etc.) are merged in by js/backend/supabase.js via setServerPricing().
export const PRICING = {
  currency: 'USD',
  products: {
    unlock:        { name: 'Full file unlock',        price: 7,    link: 'https://buy.stripe.com/00weVc4I1bCra8v84S1Jm07', kind: 'one-time', per: 'one file, yours for good',
                     founder: { price: 5,  limit: 100, link: 'https://buy.stripe.com/4gM8wO5M56i76Wj5WK1Jm06', note: 'first 100 unlocks' } },
    member_year:   { name: 'Membership, annual',      price: 49,   link: '', kind: 'recurring', interval: 'year',  per: 'a year',
                     founder: { price: 39, limit: 100, link: '', note: 'first 100 members, kept while they stay' } },
    member_month:  { name: 'Membership, monthly',     price: 5.99, link: '', kind: 'recurring', interval: 'month', per: 'a month' },
    lifetime:      { name: 'Lifetime membership',     price: 99,   link: '', kind: 'one-time', per: 'once, never renews',
                     founder: { price: 79, limit: 50,  link: '', note: 'first 50 only' } },
    pack_record:   { name: 'Research pack: Record',   price: 49,   link: '', kind: 'one-time', days: 5,  per: '5 business days' },
    pack_dossier:  { name: 'Research pack: Dossier',  price: 149,  link: '', kind: 'one-time', days: 10, per: '10 business days' },
    // Members get 20% off the packs. Payment Links cannot discount by account, so members have their own two links.
    pack_record_member:  { name: 'Research pack: Record (member)',  price: 39,    link: '', kind: 'one-time', days: 5 },
    pack_dossier_member: { name: 'Research pack: Dossier (member)', price: 119,  link: '', kind: 'one-time', days: 10 },
    rush:          { name: 'Rush add-on (72 hours)',  price: 40,   link: '', kind: 'one-time', per: 'added to either pack' },
    gift:          { name: 'Gift membership, one year', price: 49, link: '', kind: 'one-time', per: 'one year, does not renew' },
    drive_jackson: { name: 'City drive pack: Jackson, Michigan', price: 9, link: '', kind: 'one-time', per: 'free for members' },
  },
  // Member extras (shown on the Patronage page)
  memberPerks: [
    'Every full file included, nothing more to buy',
    'All city drive packs',
    '20% off research packs',
    'Offline reading of opened books',
    'Early and extended cuts of new videos',
    'The Member seal in your cabinet',
  ],
  packDiscount: 0.2,
};

const live = { founderRemaining: null, unlockLink: '', unlockStandard: null, unlockFounder: null, founderLimit: null };

// Merge the server's public switches (rpc pricing_settings). Never trusted for charging, only for display.
export function setServerPricing(d) {
  if (!d) return;
  const u = PRICING.products.unlock;
  if (Number.isFinite(Number(d.unlock_standard_price)) && d.unlock_standard_price != null) u.price = Number(d.unlock_standard_price);
  if (Number.isFinite(Number(d.unlock_founder_price)) && d.unlock_founder_price != null) u.founder.price = Number(d.unlock_founder_price);
  if (d.founder_limit != null) u.founder.limit = Number(d.founder_limit);
  if (d.founder_remaining != null) live.founderRemaining = Number(d.founder_remaining);
  else if (d.trial === false) live.founderRemaining = 0;                 // old server in 'planned' mode: no founder price
  else if (d.trial_unlock_price != null && d.unlock_standard_price == null) { u.founder.price = Number(d.trial_unlock_price); }   // old server: trial price
  if (d.unlock_payment_link) u.founder.link = d.unlock_payment_link;
}

export const money = (n) => `$${Number(n).toFixed(Number.isInteger(Number(n)) ? 0 : 2)}`;
export const product = (id) => PRICING.products[id];
export const founderRemaining = (id = 'unlock') => (id === 'unlock' ? live.founderRemaining : null);
// Is the founder price on offer right now? (Only the unlock can know; for the rest it is a launch promise.)
export const founderOn = (id = 'unlock') => {
  const p = PRICING.products[id]; if (!p?.founder) return false;
  const rem = founderRemaining(id);
  return rem == null ? true : rem > 0;
};
// The price a new buyer sees right now.
export const priceNow = (id) => { const p = PRICING.products[id]; return founderOn(id) ? p.founder.price : p.price; };
// The Payment Link a buyer would use right now ('' when not created yet).
export const linkNow = (id) => { const p = PRICING.products[id]; return (founderOn(id) ? p.founder.link : p.link) || ''; };
// The link to use for a server-decided amount (the unlock request records 5 or 7; the link must match it).
export const linkForAmount = (id, amount) => {
  const p = PRICING.products[id]; if (!p) return '';
  if (p.founder && Number(amount) === Number(p.founder.price)) return p.founder.link || '';
  return Number(amount) === Number(p.price) ? (p.link || '') : '';
};
export const isOpen = (id) => !!linkNow(id);
export const unlockPriceNow = () => priceNow('unlock');
export const unlockOpen = () => isOpen('unlock');

// Add the buyer's reference and email to a Payment Link URL (client_reference_id: letters, digits, - and _ only).
export function withReference(link, ref, email) {
  if (!link) return '';
  const u = new URL(link);
  if (ref) u.searchParams.set('client_reference_id', ref);
  if (email) u.searchParams.set('prefilled_email', email);
  return u.toString();
}
