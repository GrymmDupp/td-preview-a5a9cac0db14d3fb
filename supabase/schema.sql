-- Twisted Deeds public site: Supabase schema (Postgres 15+).
-- Paste into Supabase Dashboard -> SQL Editor -> New query -> Run. Safe to re-run.
--
-- ACCESS MODEL (exactly this, nothing else):
--   * Every file (listing) has a FREE PREVIEW (the public feed: name, place, price/status, original
--     listing link, basic facts, short summary, lore teaser, placeholder/sample photos).
--   * A ONE-TIME PAYMENT unlocks the FULL FILE for one account, permanently, on every device.
--     The unlock is a row in public.unlocks (written only by the Stripe webhook, service role).
--   * Full-file content lives in public.listing_full and is readable ONLY when the caller has an
--     unlock row for that listing (or is a moderator). It is never sent to a locked browser.
--   * DATA: anyone signed in can submit info, photos, lore and links (public.submissions).
--     Approved submissions become part of that listing's full file.
--   * SOCIAL is exactly two things: comments on a listing (public.comments) and ONE general
--     community board (public.board_posts; posts + replies via parent_id; no sub-boards).
--   * MODERATION: every submission, comment, board post and reply starts 'pending' and is
--     public only after a moderator approves it. Authors always see their own pending items.
--     Anything can be reported (public.reports).
--   * No tiers, levels, badges, ranks, reputation, member directory, follows, votes, likes,
--     reactions, shares or activity feed.
--   * PRICING: $9 one-time per file. Optional memberships change ONLY the unlock price:
--       Monthly  $7/month (Stripe subscription): unlocks $7 while active.
--       Lifetime $49 one-time, never expires:    unlocks $5 forever.
--     Unlocked files stay unlocked forever; a lapsed membership only changes future prices.
--     Memberships are readable only by their owner. The one badge ("Lifetime") is rendered on
--     the owner's own account page only. Price is resolved server-side by the create-checkout
--     Edge Function from public.memberships (see effective_plan()).
-- Roles ('user' | 'moderator' | 'admin') are permissions only and are never shown publicly.

create extension if not exists citext;

do $$ begin
  create type moderation_status as enum ('pending', 'approved', 'rejected', 'removed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- accounts
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  handle     citext unique not null check (handle ~ '^[a-z0-9][a-z0-9-]{1,23}$'),
  role       text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  is_example boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('moderator', 'admin'));
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, handle)
  values (new.id, 'reader-' || substr(replace(new.id::text, '-', ''), 1, 8))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.guard_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null in the SQL editor / service role, which may set roles.
  if new.role is distinct from old.role and auth.uid() is not null and not exists
     (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Only an admin can change roles';
  end if;
  return new;
end $$;
drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------------------------------------------------------------- unlocks (one-time, per account, permanent)
create table if not exists public.unlocks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  listing_id   text not null,
  unlocked_at  timestamptz not null default now(),
  payment_ref  text not null unique,          -- Stripe Checkout Session id (cs_...) or payment_intent
  price_tier   text not null default 'standard' check (price_tier in ('standard', 'monthly', 'lifetime')),  -- $9 / $7 / $5
  amount_paid  numeric(8,2),                -- dollars actually charged (9.00, 7.00 or 5.00)
  amount_cents int,
  currency     text default 'usd',
  unique (user_id, listing_id)
);
alter table public.unlocks add column if not exists price_tier text not null default 'standard';
alter table public.unlocks drop constraint if exists unlocks_price_tier_check;
alter table public.unlocks add constraint unlocks_price_tier_check check (price_tier in ('standard', 'monthly', 'lifetime'));
alter table public.unlocks add column if not exists amount_paid numeric(8,2);

-- ---------------------------------------------------------------- memberships (optional; price only)
-- plan 'monthly': Stripe subscription; status mirrors Stripe (active | past_due | canceled | ended).
--   'canceled' = cancel_at_period_end: still effective until current_period_end.
-- plan 'lifetime': one-time payment; status 'active', current_period_end null, never expires.
-- Written ONLY by the stripe-webhook function (service role).
drop table if exists public.lifetime_memberships cascade;   -- earlier draft
create table if not exists public.memberships (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  plan                   text not null check (plan in ('monthly', 'lifetime')),
  status                 text not null default 'active' check (status in ('active', 'past_due', 'canceled', 'ended')),
  current_period_end     timestamptz,                 -- monthly only
  purchased_at           timestamptz not null default now(),
  amount                 numeric(8,2) not null,       -- 7.00 per month or 49.00 once
  currency               text default 'usd',
  stripe_customer_id     text,
  stripe_subscription_id text unique,                 -- monthly
  stripe_checkout_id     text unique,                 -- lifetime (or the first monthly checkout)
  updated_at             timestamptz not null default now(),
  constraint lifetime_no_period check (plan <> 'lifetime' or current_period_end is null)
);
create unique index if not exists one_lifetime_per_user on public.memberships (user_id) where plan = 'lifetime';
create index if not exists memberships_user_idx on public.memberships (user_id);

-- The caller's effective plan for pricing: 'lifetime' > 'monthly' (period not over) > 'standard'.
create or replace function public.effective_plan(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select 'lifetime' from public.memberships where user_id = uid and plan = 'lifetime' and status = 'active' limit 1),
    (select 'monthly'  from public.memberships where user_id = uid and plan = 'monthly'
       and status in ('active', 'past_due', 'canceled') and current_period_end > now() limit 1),
    'standard');
$$;
revoke execute on function public.effective_plan(uuid) from public, anon, authenticated;   -- Edge Functions only

-- ---------------------------------------------------------------- full-file content (locked layer)
-- Loaded by supabase/import_full_files.py (service role) from _build/listings_full.json.
-- Not in the public feed since feed v6 / schema 3 (see README §8).
create table if not exists public.listing_full (
  listing_id      text primary key,
  story           text not null default '',
  history         text not null default '',
  timeline        jsonb not null default '[]'::jsonb,   -- [{year, text}]
  lore            text not null default '',
  citations       text not null default '',
  sources         jsonb not null default '[]'::jsonb,   -- [{url, label}]
  ownership_chain text not null default '',
  story_fields    jsonb not null default '{}'::jsonb,   -- Strong Story: architectural_notes, vacancy_years, folklore_type, failure_reason, significance
  dossier_md      text not null default '',
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------- SOCIAL (a): listing comments
-- Flat with one level of replies (parent_id). Public once approved. No votes or reactions.
create table if not exists public.comments (
  id           uuid primary key default gen_random_uuid(),
  listing_id   text not null,
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body         text not null check (char_length(body) between 2 and 3000),
  parent_id    uuid references public.comments(id) on delete cascade,
  status       moderation_status not null default 'pending',
  mod_note     text,
  moderated_by uuid references public.profiles(id),
  moderated_at timestamptz,
  is_example   boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists comments_listing_idx on public.comments (listing_id, status, created_at);

-- ---------------------------------------------------------------- SOCIAL (b): the ONE general board
-- Top-level posts have a title and parent_id null; replies have parent_id = a top-level post.
create table if not exists public.board_posts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  parent_id    uuid references public.board_posts(id) on delete cascade,
  title        text not null default '' check (char_length(title) <= 140),
  body         text not null check (char_length(body) between 2 and 6000),
  status       moderation_status not null default 'pending',
  mod_note     text,
  moderated_by uuid references public.profiles(id),
  moderated_at timestamptz,
  is_example   boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint post_has_title check (parent_id is not null or char_length(title) >= 3)
);
create index if not exists board_posts_idx on public.board_posts (parent_id, status, created_at);

-- Replies are one level deep; a comment reply inherits its parent's listing.
create or replace function public.guard_thread() returns trigger
language plpgsql security definer set search_path = public as $$
declare par_parent uuid; par_listing text;
begin
  if new.parent_id is null then return new; end if;
  if tg_table_name = 'comments' then
    select parent_id, listing_id into par_parent, par_listing from public.comments where id = new.parent_id;
    new.listing_id := par_listing;
  else
    select parent_id into par_parent from public.board_posts where id = new.parent_id;
    new.title := '';
  end if;
  if par_parent is not null then raise exception 'Replies go one level deep'; end if;
  return new;
end $$;
drop trigger if exists comments_thread on public.comments;
create trigger comments_thread before insert on public.comments for each row execute function public.guard_thread();
drop trigger if exists board_posts_thread on public.board_posts;
create trigger board_posts_thread before insert on public.board_posts for each row execute function public.guard_thread();

-- ---------------------------------------------------------------- submissions (info, photo, lore, link)
-- Approved submissions become part of that listing's FULL FILE. A moderator may mark an approved
-- photo the submitter took themselves as a free-preview sample (is_sample).
create table if not exists public.submissions (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('info', 'photo', 'lore', 'link')),
  listing_id       text,                                     -- null = a new property suggestion (kind 'link')
  author_id        uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  payload          jsonb not null default '{}'::jsonb,       -- title, text, url, caption, credit, era, sources ...
  storage_path     text,                                     -- object in bucket 'contributions'
  rights_confirmed boolean not null default false,
  is_sample        boolean not null default false,
  status           moderation_status not null default 'pending',
  mod_note         text,
  moderated_by     uuid references public.profiles(id),
  moderated_at     timestamptz,
  is_example       boolean not null default false,
  created_at       timestamptz not null default now(),
  constraint photo_needs_rights check (kind <> 'photo' or rights_confirmed),
  constraint sample_is_photo check (not is_sample or kind = 'photo')
);
create index if not exists submissions_status_idx on public.submissions (status, created_at);
create index if not exists submissions_listing_idx on public.submissions (listing_id, status);
-- approved_at: when a moderator approved it (set by log_moderation). Drives the per-listing
-- "Updated" marker / "Recently updated" line (approved submissions in the last 7 days).
alter table public.submissions add column if not exists approved_at timestamptz;
create index if not exists submissions_recent_approved_idx on public.submissions (approved_at desc, listing_id)
  where status = 'approved' and listing_id is not null;

-- ---------------------------------------------------------------- reports
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('comment', 'board_post', 'submission', 'listing')),
  target_id   text not null,
  reason      text not null check (reason in ('doxxing', 'harassment', 'trespass', 'false', 'copyright', 'spam', 'off-topic', 'other')),
  details     text not null default '' check (char_length(details) <= 1000),
  reporter_id uuid default auth.uid() references public.profiles(id) on delete set null,
  status      text not null default 'open' check (status in ('open', 'dismissed', 'removed')),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- moderation log (audit trail)
create table if not exists public.moderation_events (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  row_id      uuid not null,
  from_status moderation_status,
  to_status   moderation_status not null,
  note        text,
  actor_id    uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create or replace function public.log_moderation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_moderator() then
    if new.status is distinct from old.status then raise exception 'Only moderators can change status'; end if;
    if tg_table_name = 'submissions' then
      -- separate IF: comments/board_posts have no is_sample column
      if (to_jsonb(new) ->> 'is_sample') is distinct from (to_jsonb(old) ->> 'is_sample') then
        raise exception 'Only moderators can set sample photos';
      end if;
    end if;
  end if;
  if new.status is distinct from old.status then
    new.moderated_by := auth.uid(); new.moderated_at := now();
    if tg_table_name = 'submissions' and new.status = 'approved' then
      new := jsonb_populate_record(new, jsonb_build_object('approved_at', now()));
    end if;
    insert into public.moderation_events (table_name, row_id, from_status, to_status, note)
    values (tg_table_name, new.id, old.status, new.status, new.mod_note);
  end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['comments', 'board_posts', 'submissions'] loop
    execute format('drop trigger if exists %I_moderation on public.%I', t, t);
    execute format('create trigger %I_moderation before update on public.%I for each row execute function public.log_moderation()', t, t);
  end loop;
end $$;

-- What a locked file contains, as counts only (shown on the preview: "3 community photos in the full file").
create or replace function public.file_counts(lid text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'photo', count(*) filter (where kind = 'photo'), 'lore', count(*) filter (where kind = 'lore'),
    'info',  count(*) filter (where kind = 'info'),  'link', count(*) filter (where kind = 'link'))
  from public.submissions where listing_id = lid and status = 'approved';
$$;

-- Recent approvals per listing (the "Updated" signal). Facts only: listing id, which kinds were
-- added, and when. No payload, author or file, so it is safe for anonymous preview viewers; the
-- content itself stays behind submissions RLS (unlock holders only).
create or replace function public.recent_listing_updates(days int default 7)
returns table (listing_id text, kinds text[], n bigint, last_approved_at timestamptz)
language sql stable security definer set search_path = public as $$
  select listing_id, array_agg(distinct kind order by kind), count(*), max(approved_at)
  from public.submissions
  where status = 'approved' and listing_id is not null
    and approved_at >= now() - make_interval(days => least(greatest(coalesce(days, 7), 1), 31))
  group by listing_id;
$$;
grant execute on function public.recent_listing_updates(int) to anon, authenticated;

-- ---------------------------------------------------------------- notification preferences (opt-in, not live yet)
-- One row per user. Only "tell me about new Twisted Deeds (Tier 1)". No marketing flags. Nothing
-- reads this until the digest function in NOTIFICATIONS.md is deployed; default is opted out.
create table if not exists public.notification_prefs (
  user_id    uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  opted_in   boolean not null default false,
  tier1_only boolean not null default true check (tier1_only),
  last_sent_at timestamptz,                 -- written by the digest function (max one per day)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
drop policy if exists notify_own_read on public.notification_prefs;
create policy notify_own_read on public.notification_prefs for select to authenticated using (user_id = auth.uid());
drop policy if exists notify_own_insert on public.notification_prefs;
create policy notify_own_insert on public.notification_prefs for insert to authenticated with check (user_id = auth.uid() and last_sent_at is null);
drop policy if exists notify_own_update on public.notification_prefs;
create policy notify_own_update on public.notification_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notify_own_delete on public.notification_prefs;
create policy notify_own_delete on public.notification_prefs for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------- row-level security
alter table public.profiles          enable row level security;
alter table public.unlocks           enable row level security;
alter table public.memberships       enable row level security;
alter table public.listing_full      enable row level security;
alter table public.comments          enable row level security;
alter table public.board_posts       enable row level security;
alter table public.submissions       enable row level security;
alter table public.reports           enable row level security;
alter table public.moderation_events enable row level security;

-- Clean up objects from earlier drafts: engagement/status mechanics are not part of the model.
drop view  if exists public.post_scores;
drop table if exists public.votes cascade;
drop table if exists public.badges cascade;
drop table if exists public.member_badges cascade;
drop table if exists public.follows cascade;
drop table if exists public.feed_events cascade;
drop table if exists public.replies cascade;
drop table if exists public.posts cascade;
drop function if exists public.follower_count(text);

-- profiles: handles are shown next to approved posts; you edit only your own
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (true);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- unlocks: ONLY the owner can read; no client can insert/update/delete (service role = webhook only)
drop policy if exists unlocks_read_own on public.unlocks;
create policy unlocks_read_own on public.unlocks for select to authenticated using (user_id = auth.uid());

-- memberships: ONLY the owner can read; no client writes (service role = webhook only).
drop policy if exists memberships_read_own on public.memberships;
create policy memberships_read_own on public.memberships for select to authenticated using (user_id = auth.uid());

-- listing_full: readable only with an unlock row for that listing (or by moderators). No client writes.
drop policy if exists listing_full_read on public.listing_full;
create policy listing_full_read on public.listing_full for select to authenticated
  using (public.has_unlock(listing_id) or public.is_moderator());

-- comments + board: approved is public; authors see their own; moderators see all.
-- Insert only as yourself and only as 'pending'. Only moderators change status (trigger + policy).
do $$ declare t text; begin
  foreach t in array array['comments', 'board_posts'] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format($p$create policy %I_read on public.%I for select using (status = 'approved' or user_id = auth.uid() or public.is_moderator())$p$, t, t);
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format($p$create policy %I_insert on public.%I for insert to authenticated with check (user_id = auth.uid() and status = 'pending')$p$, t, t);
    execute format('drop policy if exists %I_moderate on public.%I', t, t);
    execute format('create policy %I_moderate on public.%I for update to authenticated using (public.is_moderator()) with check (public.is_moderator())', t, t);
    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format($p$create policy %I_delete on public.%I for delete to authenticated using (user_id = auth.uid() or public.is_moderator())$p$, t, t);
  end loop;
end $$;
drop policy if exists submissions_insert on public.submissions;
create policy submissions_insert on public.submissions for insert to authenticated with check (author_id = auth.uid() and status = 'pending' and not is_sample and approved_at is null);
drop policy if exists submissions_moderate on public.submissions;
create policy submissions_moderate on public.submissions for update to authenticated using (public.is_moderator()) with check (public.is_moderator());
drop policy if exists submissions_delete_own_pending on public.submissions;
create policy submissions_delete_own_pending on public.submissions for delete to authenticated using ((author_id = auth.uid() and status = 'pending') or public.is_moderator());
-- submissions are FULL-FILE content: readable by the author, moderators, unlock holders of that
-- listing, or anyone for an approved free-preview sample photo.
drop policy if exists submissions_read on public.submissions;
create policy submissions_read on public.submissions for select using (
  author_id = auth.uid() or public.is_moderator()
  or (status = 'approved' and (is_sample or public.has_unlock(listing_id))));

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated with check (reporter_id = auth.uid() and status = 'open');
drop policy if exists reports_mod on public.reports;
create policy reports_mod on public.reports for select using (public.is_moderator());
drop policy if exists reports_resolve on public.reports;
create policy reports_resolve on public.reports for update to authenticated using (public.is_moderator());

drop policy if exists modlog_read on public.moderation_events;
create policy modlog_read on public.moderation_events for select using (public.is_moderator());

-- ---------------------------------------------------------------- storage (photos & documents)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contributions', 'contributions', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists contrib_upload on storage.objects;
create policy contrib_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'contributions' and (storage.foldername(name))[1] = auth.uid()::text);
-- Read: the uploader, moderators, an approved sample photo, or an unlock holder for that listing.
drop policy if exists contrib_read on storage.objects;
create policy contrib_read on storage.objects for select using (
  bucket_id = 'contributions' and (
    owner = auth.uid() or public.is_moderator() or exists (
      select 1 from public.submissions s where s.storage_path = storage.objects.name and s.status = 'approved'
        and (s.is_sample or public.has_unlock(s.listing_id)))));

-- Approved comment counts per listing (shown on cards). Counts only; no per-user numbers anywhere.
create or replace function public.comment_counts() returns table (listing_id text, n bigint)
language sql stable security definer set search_path = public as $$
  select listing_id, count(*) from public.comments where status = 'approved' group by listing_id;
$$;

-- ---------------------------------------------------------------- after first sign-in, make Grymm admin:
-- update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'GRYMM_EMAIL_HERE');
