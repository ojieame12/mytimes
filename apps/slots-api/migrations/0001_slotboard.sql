create extension if not exists pgcrypto;
create schema if not exists slotboard;

create table if not exists slotboard.booking_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  organizer_name text not null,
  organizer_email text not null,
  avatar_style text not null default 'notionists',
  avatar_seed text,
  timezone text not null,
  timezone_locked_at timestamptz,
  meeting_duration_minutes int not null,
  allow_multiple_bookings boolean not null default false,
  availability_config jsonb not null default '{}'::jsonb,
  public_token_hash text not null unique,
  admin_token_hash text not null unique,
  status text not null default 'active',
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_events_status_check check (status in ('active', 'archived', 'deleted')),
  constraint booking_events_duration_check check (meeting_duration_minutes in (15, 30, 45, 60, 90)),
  constraint booking_events_avatar_style_check check (avatar_style in ('notionists', 'open-peeps', 'lorelei', 'big-smile'))
);

create table if not exists slotboard.time_slots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references slotboard.booking_events(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source_date date,
  source_start_time time,
  source_end_time time,
  capacity int not null default 1,
  status text not null default 'open',
  close_after_booking boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, id),
  constraint time_slots_status_check check (status in ('open', 'closed')),
  constraint time_slots_capacity_check check (capacity > 0),
  constraint time_slots_time_check check (ends_at > starts_at)
);

create table if not exists slotboard.bookings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  slot_id uuid not null,
  participant_name text not null,
  participant_email text not null,
  participant_timezone text,
  participant_locale text,
  participant_offset_at_booking text,
  dedupe_email text,
  notes text not null default '',
  manage_token_hash text not null unique,
  booked_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by text,
  cancelled_reason text,
  ics_sequence int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, slot_id) references slotboard.time_slots(event_id, id) on delete cascade,
  constraint bookings_cancelled_by_check check (
    cancelled_by is null or cancelled_by in ('participant', 'organizer')
  ),
  constraint bookings_cancelled_consistency_check check (
    (cancelled_at is null and cancelled_by is null) or
    (cancelled_at is not null and cancelled_by is not null)
  )
);

create table if not exists slotboard.email_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references slotboard.booking_events(id) on delete cascade,
  booking_id uuid references slotboard.bookings(id) on delete set null,
  email_type text not null,
  recipient_email text not null,
  provider text not null,
  provider_message_id text,
  status text not null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_delivery_logs_status_check check (status in ('queued', 'sent', 'bounced', 'failed'))
);

create table if not exists slotboard.email_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  provider_message_id text,
  payload_hash text not null,
  delivery_log_id uuid references slotboard.email_delivery_logs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_webhook_events_provider_check check (provider in ('resend', 'postmark', 'unknown')),
  unique (provider, provider_event_id)
);

create table if not exists slotboard.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  event_type text not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists slotboard.rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  route_key text not null,
  actor_key text not null,
  created_at timestamptz not null default now()
);

create table if not exists slotboard.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  route_key text not null,
  actor_key_hash text not null,
  idempotency_key_hash text not null,
  request_hash text not null,
  status text not null default 'processing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint idempotency_keys_status_check check (status in ('processing', 'succeeded')),
  unique (route_key, actor_key_hash, idempotency_key_hash)
);

create table if not exists slotboard.activity_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references slotboard.booking_events(id) on delete cascade,
  type text not null,
  actor_type text not null,
  actor_label text,
  slot_id uuid references slotboard.time_slots(id) on delete set null,
  booking_id uuid references slotboard.bookings(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_events_type_check check (
    type in (
      'event_created',
      'event_updated',
      'event_archived',
      'event_deleted',
      'slot_closed',
      'slot_reopened',
      'booking_created',
      'booking_cancelled',
      'public_link_rotated',
      'admin_link_rotated',
      'manage_link_rotated'
    )
  ),
  constraint activity_events_actor_type_check check (
    actor_type in ('system', 'organizer', 'participant')
  )
);

create table if not exists slotboard.product_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references slotboard.booking_events(id) on delete set null,
  booking_id uuid references slotboard.bookings(id) on delete set null,
  name text not null,
  actor_type text not null default 'anonymous',
  actor_key_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_events_actor_type_check check (
    actor_type in ('anonymous', 'organizer', 'participant')
  )
);

alter table slotboard.activity_events
  drop constraint if exists activity_events_type_check;

alter table slotboard.activity_events
  add constraint activity_events_type_check check (
    type in (
      'event_created',
      'event_updated',
      'event_archived',
      'event_deleted',
      'slot_closed',
      'slot_reopened',
      'booking_created',
      'booking_cancelled',
      'public_link_rotated',
      'admin_link_rotated',
      'manage_link_rotated'
    )
  );

create table if not exists slotboard.auth_users (
  id text primary key,
  name text not null,
  email text not null unique,
  email_verified boolean not null default false,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists slotboard.auth_sessions (
  id text primary key,
  expires_at timestamptz not null,
  token text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  user_id text not null references slotboard.auth_users(id) on delete cascade
);

create table if not exists slotboard.auth_accounts (
  id text primary key,
  account_id text not null,
  provider_id text not null,
  user_id text not null references slotboard.auth_users(id) on delete cascade,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists slotboard.auth_verifications (
  id text primary key,
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table slotboard.booking_events
  add column if not exists owner_user_id text references slotboard.auth_users(id) on delete set null;

alter table slotboard.booking_events
  add column if not exists plan_key text not null default 'free',
  add column if not exists payment_status text not null default 'not_required',
  add column if not exists paid_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists booking_limit int not null default 15,
  add column if not exists slot_limit int not null default 30,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_customer_id text;

alter table slotboard.booking_events
  add column if not exists timezone_locked_at timestamptz;

alter table slotboard.booking_events
  add column if not exists avatar_style text not null default 'notionists',
  add column if not exists avatar_seed text;

alter table slotboard.booking_events
  drop constraint if exists booking_events_avatar_style_check;

alter table slotboard.booking_events
  add constraint booking_events_avatar_style_check check (avatar_style in ('notionists', 'open-peeps', 'lorelei', 'big-smile'));

alter table slotboard.time_slots
  add column if not exists source_date date,
  add column if not exists source_start_time time,
  add column if not exists source_end_time time;

alter table slotboard.bookings
  add column if not exists participant_timezone text,
  add column if not exists participant_locale text,
  add column if not exists participant_offset_at_booking text;

update slotboard.booking_events e
set timezone_locked_at = coalesce(e.timezone_locked_at, e.created_at)
where e.timezone_locked_at is null
  and exists (
    select 1
    from slotboard.time_slots s
    where s.event_id = e.id
  );

update slotboard.time_slots s
set source_date = coalesce(s.source_date, (s.starts_at at time zone e.timezone)::date),
    source_start_time = coalesce(s.source_start_time, (s.starts_at at time zone e.timezone)::time),
    source_end_time = coalesce(s.source_end_time, (s.ends_at at time zone e.timezone)::time)
from slotboard.booking_events e
where s.event_id = e.id
  and (
    s.source_date is null or
    s.source_start_time is null or
    s.source_end_time is null
  );

create unique index if not exists bookings_one_active_per_slot
  on slotboard.bookings(slot_id)
  where cancelled_at is null;

create unique index if not exists bookings_one_active_email_per_event
  on slotboard.bookings(event_id, dedupe_email)
  where cancelled_at is null and dedupe_email is not null;

create index if not exists booking_events_public_token_hash_idx
  on slotboard.booking_events(public_token_hash);

create index if not exists booking_events_admin_token_hash_idx
  on slotboard.booking_events(admin_token_hash);

create index if not exists booking_events_retention_idx
  on slotboard.booking_events(status, archived_at, deleted_at);

create index if not exists time_slots_event_starts_idx
  on slotboard.time_slots(event_id, starts_at);

create index if not exists time_slots_event_ends_idx
  on slotboard.time_slots(event_id, ends_at);

create index if not exists bookings_event_slot_idx
  on slotboard.bookings(event_id, slot_id);

create index if not exists bookings_manage_token_hash_idx
  on slotboard.bookings(manage_token_hash);

create index if not exists email_delivery_logs_event_idx
  on slotboard.email_delivery_logs(event_id);

create index if not exists email_webhook_events_message_idx
  on slotboard.email_webhook_events(provider, provider_message_id);

create index if not exists stripe_webhook_events_processed_idx
  on slotboard.stripe_webhook_events(processed_at);

create index if not exists rate_limit_events_route_actor_created_idx
  on slotboard.rate_limit_events(route_key, actor_key, created_at desc);

create index if not exists idempotency_keys_created_idx
  on slotboard.idempotency_keys(created_at);

create index if not exists activity_events_event_created_idx
  on slotboard.activity_events(event_id, created_at desc);

create index if not exists activity_events_booking_idx
  on slotboard.activity_events(booking_id);

create index if not exists activity_events_slot_idx
  on slotboard.activity_events(slot_id);

create index if not exists product_events_event_created_idx
  on slotboard.product_events(event_id, created_at desc);

create index if not exists product_events_name_created_idx
  on slotboard.product_events(name, created_at desc);

create index if not exists product_events_booking_idx
  on slotboard.product_events(booking_id);

create index if not exists auth_sessions_user_id_idx
  on slotboard.auth_sessions(user_id);

create index if not exists auth_accounts_user_id_idx
  on slotboard.auth_accounts(user_id);

create index if not exists auth_verifications_identifier_idx
  on slotboard.auth_verifications(identifier);

create index if not exists booking_events_owner_user_id_idx
  on slotboard.booking_events(owner_user_id);

create index if not exists booking_events_plan_payment_idx
  on slotboard.booking_events(plan_key, payment_status);

create unique index if not exists booking_events_stripe_checkout_session_id_idx
  on slotboard.booking_events(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create table if not exists slotboard.billing_customers (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  owner_user_id text references slotboard.auth_users(id) on delete set null,
  provider text not null default 'stripe',
  provider_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_customers_provider_check check (provider in ('stripe'))
);

create table if not exists slotboard.event_purchases (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references slotboard.booking_events(id) on delete cascade,
  owner_email text not null,
  provider text not null default 'stripe',
  provider_checkout_session_id text not null unique,
  provider_payment_intent_id text,
  provider_customer_id text,
  product_key text not null,
  amount int not null,
  currency text not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_purchases_provider_check check (provider in ('stripe')),
  constraint event_purchases_product_key_check check (product_key in ('event_pass')),
  constraint event_purchases_status_check check (status in ('pending', 'paid', 'failed', 'refunded'))
);

update slotboard.booking_events
set plan_key = 'free',
    paid_at = null,
    booking_limit = 15,
    slot_limit = 30
where plan_key = 'event_pass'
  and payment_status <> 'paid';

create table if not exists slotboard.subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  owner_user_id text references slotboard.auth_users(id) on delete set null,
  provider text not null default 'stripe',
  provider_customer_id text not null,
  provider_subscription_id text not null unique,
  plan_key text not null,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_provider_check check (provider in ('stripe')),
  constraint subscriptions_plan_key_check check (plan_key in ('company_standby'))
);

create index if not exists billing_customers_owner_email_idx
  on slotboard.billing_customers(owner_email);

create index if not exists event_purchases_event_idx
  on slotboard.event_purchases(event_id);

create index if not exists event_purchases_owner_email_idx
  on slotboard.event_purchases(owner_email);

create index if not exists subscriptions_owner_user_id_idx
  on slotboard.subscriptions(owner_user_id);

create index if not exists subscriptions_owner_email_idx
  on slotboard.subscriptions(owner_email);

create table if not exists slotboard.my_boards_links (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists my_boards_links_owner_email_idx
  on slotboard.my_boards_links(owner_email);

create index if not exists my_boards_links_expires_at_idx
  on slotboard.my_boards_links(expires_at);

create table if not exists slotboard.custom_domains (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  owner_user_id text references slotboard.auth_users(id) on delete set null,
  hostname text not null,
  status text not null default 'pending_dns',
  verification_token text not null,
  txt_record_name text not null,
  txt_record_value text not null,
  cname_target text not null,
  requested_at timestamptz not null default now(),
  verified_at timestamptz,
  activated_at timestamptz,
  last_checked_at timestamptz,
  last_check_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_domains_status_check check (status in ('pending_dns', 'verified_dns', 'active', 'rejected'))
);

create unique index if not exists custom_domains_hostname_lower_idx
  on slotboard.custom_domains(lower(hostname));

create unique index if not exists custom_domains_owner_user_unique_idx
  on slotboard.custom_domains(owner_user_id)
  where owner_user_id is not null;

create index if not exists custom_domains_owner_email_idx
  on slotboard.custom_domains(owner_email);

create or replace function slotboard.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists booking_events_touch_updated_at on slotboard.booking_events;
create trigger booking_events_touch_updated_at
before update on slotboard.booking_events
for each row execute function slotboard.touch_updated_at();

drop trigger if exists time_slots_touch_updated_at on slotboard.time_slots;
create trigger time_slots_touch_updated_at
before update on slotboard.time_slots
for each row execute function slotboard.touch_updated_at();

drop trigger if exists bookings_touch_updated_at on slotboard.bookings;
create trigger bookings_touch_updated_at
before update on slotboard.bookings
for each row execute function slotboard.touch_updated_at();

drop trigger if exists email_delivery_logs_touch_updated_at on slotboard.email_delivery_logs;
create trigger email_delivery_logs_touch_updated_at
before update on slotboard.email_delivery_logs
for each row execute function slotboard.touch_updated_at();

drop trigger if exists email_webhook_events_touch_updated_at on slotboard.email_webhook_events;
create trigger email_webhook_events_touch_updated_at
before update on slotboard.email_webhook_events
for each row execute function slotboard.touch_updated_at();

drop trigger if exists stripe_webhook_events_touch_updated_at on slotboard.stripe_webhook_events;
create trigger stripe_webhook_events_touch_updated_at
before update on slotboard.stripe_webhook_events
for each row execute function slotboard.touch_updated_at();

drop trigger if exists idempotency_keys_touch_updated_at on slotboard.idempotency_keys;
create trigger idempotency_keys_touch_updated_at
before update on slotboard.idempotency_keys
for each row execute function slotboard.touch_updated_at();

drop trigger if exists activity_events_touch_updated_at on slotboard.activity_events;
create trigger activity_events_touch_updated_at
before update on slotboard.activity_events
for each row execute function slotboard.touch_updated_at();

drop trigger if exists product_events_touch_updated_at on slotboard.product_events;
create trigger product_events_touch_updated_at
before update on slotboard.product_events
for each row execute function slotboard.touch_updated_at();

drop trigger if exists billing_customers_touch_updated_at on slotboard.billing_customers;
create trigger billing_customers_touch_updated_at
before update on slotboard.billing_customers
for each row execute function slotboard.touch_updated_at();

drop trigger if exists event_purchases_touch_updated_at on slotboard.event_purchases;
create trigger event_purchases_touch_updated_at
before update on slotboard.event_purchases
for each row execute function slotboard.touch_updated_at();

drop trigger if exists subscriptions_touch_updated_at on slotboard.subscriptions;
create trigger subscriptions_touch_updated_at
before update on slotboard.subscriptions
for each row execute function slotboard.touch_updated_at();

drop trigger if exists my_boards_links_touch_updated_at on slotboard.my_boards_links;
create trigger my_boards_links_touch_updated_at
before update on slotboard.my_boards_links
for each row execute function slotboard.touch_updated_at();

drop trigger if exists custom_domains_touch_updated_at on slotboard.custom_domains;
create trigger custom_domains_touch_updated_at
before update on slotboard.custom_domains
for each row execute function slotboard.touch_updated_at();
