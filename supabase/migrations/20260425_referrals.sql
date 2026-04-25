-- Referral system for customer-to-customer check-ins.
-- Adds reusable referral codes and awards +2 to both users on successful referred first check-in.

alter table if exists customers
  add column if not exists referral_code text,
  add column if not exists referred_by_customer_id uuid references customers(id),
  add column if not exists referral_bonus_awarded_at timestamptz;

create unique index if not exists customers_referral_code_uniq
  on customers(referral_code)
  where referral_code is not null;

update customers
set referral_code = 'FD' || upper(substr(replace(id::text, '-', ''), 1, 8))
where referral_code is null;

create or replace function public.checkin_with_rewards(
  p_event_id text,
  p_phone_normalized text,
  p_name text default null,
  p_email text default null,
  p_referral_code text default null
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
  v_referral_code text;
  v_referrer_id uuid;
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

  update customers
  set referral_code = 'FD' || upper(substr(replace(id::text, '-', ''), 1, 8))
  where id = v_customer_id and referral_code is null;

  select referral_code into v_referral_code
  from customers
  where id = v_customer_id;

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
      'bonuses_earned', to_jsonb(v_bonuses),
      'referral_code', v_referral_code
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

  if p_referral_code is not null and length(trim(p_referral_code)) > 0 and v_total_visits = 1 then
    select id
      into v_referrer_id
    from customers
    where upper(referral_code) = upper(trim(p_referral_code))
    limit 1;

    if v_referrer_id is not null and v_referrer_id <> v_customer_id then
      if not exists (
        select 1
        from points_ledger
        where customer_id = v_customer_id
          and reason = 'referral_bonus_receiver'
          and coalesce(metadata->>'referrer_id', '') = v_referrer_id::text
      ) then
        v_points_earned := v_points_earned + 2;
        v_bonuses := array_append(v_bonuses, 'referral_bonus');

        insert into points_ledger (customer_id, event_id, delta, reason, metadata)
        values (
          v_customer_id,
          p_event_id,
          2,
          'referral_bonus_receiver',
          jsonb_build_object('referrer_id', v_referrer_id, 'referral_code', upper(trim(p_referral_code)))
        );

        insert into points_ledger (customer_id, event_id, delta, reason, metadata)
        values (
          v_referrer_id,
          p_event_id,
          2,
          'referral_bonus_referrer',
          jsonb_build_object('referred_customer_id', v_customer_id)
        );

        update customers
        set
          referred_by_customer_id = coalesce(referred_by_customer_id, v_referrer_id),
          referral_bonus_awarded_at = coalesce(referral_bonus_awarded_at, now())
        where id = v_customer_id;
      end if;
    end if;
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
    'bonuses_earned', to_jsonb(v_bonuses),
    'referral_code', v_referral_code
  );
end;
$$;
