-- Stabilized rewards/redemption schema + RPCs for live-event correctness.
-- Safe to run multiple times (idempotent DDL via IF NOT EXISTS / OR REPLACE).

create extension if not exists pgcrypto;

-- 1) Customers keyed by normalized phone
alter table if exists customers
  add column if not exists phone_normalized text,
  add column if not exists display_name text,
  add column if not exists email text;

-- Use a plain unique index so ON CONFLICT(phone_normalized) is valid.
create unique index if not exists customers_phone_normalized_uniq
  on customers(phone_normalized);

-- 2) Check-ins (one per customer/event)
create table if not exists check_ins (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  event_id text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists check_ins_customer_event_uniq
  on check_ins(customer_id, event_id);

-- 3) Rewards ledger and redemptions
create table if not exists points_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  event_id text,
  delta integer not null,
  reason text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists points_ledger_customer_idx on points_ledger(customer_id);

create table if not exists reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  event_id text,
  reward_id text not null,
  points_cost integer not null,
  status text not null default 'pending',
  host_note text,
  customer_note text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists reward_redemptions_status_idx on reward_redemptions(status);
create unique index if not exists reward_redemptions_pending_uniq
  on reward_redemptions(customer_id, reward_id, event_id)
  where status = 'pending';

-- 4) customer_rewards_summary: always returns current totals
create or replace function public.customer_rewards_summary(p_customer_id uuid)
returns table(total_points integer, total_visits integer)
language sql
stable
set search_path = public
as $$
  select
    coalesce((select sum(delta)::int from points_ledger where customer_id = p_customer_id), 0) as total_points,
    coalesce((select count(*)::int from check_ins where customer_id = p_customer_id), 0) as total_visits;
$$;

-- 5) checkin_with_rewards: duplicate-safe + milestone-safe
create or replace function public.checkin_with_rewards(
  p_event_id text,
  p_phone_normalized text,
  p_name text default null,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_inserted_checkin_id uuid;
  v_total_visits int;
  v_points_earned int := 0;
  v_bonuses text[] := array[]::text[];
  v_total_points int;
begin
  if p_phone_normalized is null or length(trim(p_phone_normalized)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'PHONE_REQUIRED');
  end if;

  insert into customers (phone_normalized, display_name, email)
  values (p_phone_normalized, p_name, p_email)
  on conflict (phone_normalized)
  do update set
    display_name = coalesce(excluded.display_name, customers.display_name),
    email = coalesce(excluded.email, customers.email)
  returning id into v_customer_id;

  insert into check_ins (customer_id, event_id)
  values (v_customer_id, p_event_id)
  on conflict (customer_id, event_id) do nothing
  returning id into v_inserted_checkin_id;

  if v_inserted_checkin_id is null then
    select coalesce(sum(delta)::int, 0) into v_total_points from points_ledger where customer_id = v_customer_id;
    select count(*)::int into v_total_visits from check_ins where customer_id = v_customer_id;

    return jsonb_build_object(
      'ok', true,
      'duplicate_checkin', true,
      'customer_id', v_customer_id,
      'points_earned', 0,
      'total_points', v_total_points,
      'total_visits', v_total_visits,
      'bonuses_earned', to_jsonb(v_bonuses)
    );
  end if;

  v_points_earned := 1;

  insert into points_ledger (customer_id, event_id, delta, reason)
  values (v_customer_id, p_event_id, 1, 'checkin_base');

  select count(*)::int into v_total_visits from check_ins where customer_id = v_customer_id;

  if v_total_visits = 1 then
    v_points_earned := v_points_earned + 2;
    v_bonuses := array_append(v_bonuses, 'first_visit_bonus');
    insert into points_ledger (customer_id, event_id, delta, reason)
    values (v_customer_id, p_event_id, 2, 'first_visit_bonus');
  end if;

  if v_total_visits > 0 and mod(v_total_visits, 10) = 0 then
    v_points_earned := v_points_earned + 2;
    v_bonuses := array_append(v_bonuses, 'milestone_visit_bonus');
    insert into points_ledger (customer_id, event_id, delta, reason)
    values (v_customer_id, p_event_id, 2, 'milestone_visit_bonus');
  end if;

  select coalesce(sum(delta)::int, 0) into v_total_points from points_ledger where customer_id = v_customer_id;

  return jsonb_build_object(
    'ok', true,
    'duplicate_checkin', false,
    'customer_id', v_customer_id,
    'checkin_id', v_inserted_checkin_id,
    'points_earned', v_points_earned,
    'total_points', v_total_points,
    'total_visits', v_total_visits,
    'bonuses_earned', to_jsonb(v_bonuses)
  );
end;
$$;

-- 6) approve_reward_redemption: atomic, cannot deduct twice
create or replace function public.approve_reward_redemption(
  p_redemption_id uuid,
  p_approved_by text default 'host'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redemption reward_redemptions%rowtype;
  v_total_points int;
begin
  select * into v_redemption
  from reward_redemptions
  where id = p_redemption_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  if v_redemption.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'NOT_PENDING', 'status', v_redemption.status);
  end if;

  select coalesce(sum(delta)::int, 0)
    into v_total_points
  from points_ledger
  where customer_id = v_redemption.customer_id;

  if v_total_points < v_redemption.points_cost then
    return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_POINTS', 'status', 'pending');
  end if;

  insert into points_ledger (customer_id, event_id, delta, reason, metadata)
  values (
    v_redemption.customer_id,
    v_redemption.event_id,
    -1 * v_redemption.points_cost,
    'reward_redemption_approved',
    jsonb_build_object('redemption_id', v_redemption.id, 'reward_id', v_redemption.reward_id)
  );

  update reward_redemptions
  set
    status = 'approved',
    approved_by = p_approved_by,
    approved_at = now()
  where id = v_redemption.id;

  return jsonb_build_object(
    'ok', true,
    'status', 'approved',
    'points_deducted', v_redemption.points_cost
  );
end;
$$;
