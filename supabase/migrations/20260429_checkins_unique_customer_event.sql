-- Fix duplicate check-in behavior so only the same customer is blocked per event.
-- Some environments may have an accidental uniqueness rule on event_id alone.

-- 1) Remove any unique index/constraint that enforces one check-in per event globally.
do $$
declare
  idx record;
  con record;
begin
  for idx in
    select schemaname, indexname
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'check_ins'
      and indexdef ilike '%unique%'
      and indexdef ilike '%(event_id)%'
      and indexdef not ilike '%(customer_id, event_id)%'
  loop
    execute format('drop index if exists %I.%I', idx.schemaname, idx.indexname);
  end loop;

  for con in
    select conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'check_ins'
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) ilike '%(event_id)%'
      and pg_get_constraintdef(c.oid) not ilike '%(customer_id, event_id)%'
  loop
    execute format('alter table public.check_ins drop constraint if exists %I', con.conname);
  end loop;
end;
$$;

-- 2) Enforce correct uniqueness scope: one check-in per customer per event.
create unique index if not exists check_ins_customer_event_uniq
  on public.check_ins(customer_id, event_id);
