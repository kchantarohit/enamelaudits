-- Enamel Audits schema.
-- Tables live in the `private` schema (never exposed by the Data API).
-- The app talks to the database only through the SECURITY DEFINER functions
-- below, each of which requires the server-side APP_SECRET. Only the SHA-256
-- hash of that secret is stored here.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_secret (
  id int primary key default 1 check (id = 1),
  secret_sha256 text not null
);

create table if not exists private.audits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  url text not null,
  final_url text,
  domain text not null,
  email text,
  business_name text,
  score int not null,
  grade text not null,
  result jsonb not null,
  source text not null default 'web',
  ip_hash text,
  parent_id uuid references private.audits(id) on delete set null,
  paid boolean not null default false,
  paid_at timestamptz,
  stripe_session_id text unique,
  amount_cents int,
  customer_email text,
  rescans_used int not null default 0
);
create index if not exists audits_ip_created_idx on private.audits (ip_hash, created_at desc);
create index if not exists audits_domain_idx on private.audits (domain, created_at desc);

create table if not exists private.subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  website text not null,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  plan text not null default 'monitoring',
  status text not null default 'active',
  next_run_at timestamptz not null default now(),
  last_audit_id uuid references private.audits(id) on delete set null,
  last_score int
);
create index if not exists subscriptions_due_idx on private.subscriptions (status, next_run_at);

create table if not exists private.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

alter table private.audits enable row level security;
alter table private.subscriptions enable row level security;
alter table private.stripe_events enable row level security;
alter table private.app_secret enable row level security;

-- Secret check -------------------------------------------------------------
create or replace function private.assert_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_secret is null or not exists (
    select 1 from private.app_secret
    where secret_sha256 = encode(extensions.digest(p_secret, 'sha256'), 'hex')
  ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
end;
$$;

-- Audits -------------------------------------------------------------------
create or replace function public.ea_create_audit(p_secret text, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  perform private.assert_secret(p_secret);
  insert into private.audits (url, final_url, domain, email, business_name, score, grade, result, source, ip_hash, parent_id, paid, paid_at, stripe_session_id, amount_cents, customer_email)
  values (
    p_data->>'url',
    p_data->>'final_url',
    p_data->>'domain',
    nullif(p_data->>'email', ''),
    nullif(p_data->>'business_name', ''),
    (p_data->>'score')::int,
    p_data->>'grade',
    p_data->'result',
    coalesce(p_data->>'source', 'web'),
    p_data->>'ip_hash',
    nullif(p_data->>'parent_id', '')::uuid,
    coalesce((p_data->>'paid')::boolean, false),
    case when coalesce((p_data->>'paid')::boolean, false) then now() else null end,
    nullif(p_data->>'stripe_session_id', ''),
    nullif(p_data->>'amount_cents', '')::int,
    nullif(p_data->>'customer_email', '')
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.ea_get_audit(p_secret text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v jsonb;
begin
  perform private.assert_secret(p_secret);
  select to_jsonb(a) into v from private.audits a where a.id = p_id;
  return v;
end;
$$;

create or replace function public.ea_count_recent_audits(p_secret text, p_ip_hash text, p_minutes int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  perform private.assert_secret(p_secret);
  select count(*) into n from private.audits
  where ip_hash = p_ip_hash and created_at > now() - make_interval(mins => p_minutes);
  return n;
end;
$$;

create or replace function public.ea_mark_paid(p_secret text, p_id uuid, p_session_id text, p_amount_cents int, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v jsonb;
begin
  perform private.assert_secret(p_secret);
  update private.audits
     set paid = true,
         paid_at = coalesce(paid_at, now()),
         stripe_session_id = coalesce(stripe_session_id, p_session_id),
         amount_cents = coalesce(amount_cents, p_amount_cents),
         customer_email = coalesce(customer_email, nullif(p_email, '')),
         email = coalesce(email, nullif(p_email, ''))
   where id = p_id
  returning to_jsonb(audits.*) into v;
  return v;
end;
$$;

create or replace function public.ea_find_by_session(p_secret text, p_session_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v uuid;
begin
  perform private.assert_secret(p_secret);
  select id into v from private.audits where stripe_session_id = p_session_id limit 1;
  return v;
end;
$$;

create or replace function public.ea_use_rescan(p_secret text, p_id uuid, p_max int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  perform private.assert_secret(p_secret);
  update private.audits
     set rescans_used = rescans_used + 1
   where id = p_id and paid and rescans_used < p_max
  returning rescans_used into n;
  return n is not null;
end;
$$;

-- Stripe idempotency ---------------------------------------------------------
create or replace function public.ea_record_event(p_secret text, p_event_id text, p_type text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_secret(p_secret);
  insert into private.stripe_events (id, type) values (p_event_id, p_type)
  on conflict (id) do nothing;
  return found;
end;
$$;

create or replace function public.ea_forget_event(p_secret text, p_event_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_secret(p_secret);
  delete from private.stripe_events where id = p_event_id;
end;
$$;

-- Subscriptions (monthly monitoring) ----------------------------------------
create or replace function public.ea_upsert_subscription(p_secret text, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  perform private.assert_secret(p_secret);
  insert into private.subscriptions (email, website, stripe_customer_id, stripe_subscription_id, plan, status, next_run_at)
  values (
    p_data->>'email',
    p_data->>'website',
    p_data->>'stripe_customer_id',
    p_data->>'stripe_subscription_id',
    coalesce(p_data->>'plan', 'monitoring'),
    coalesce(p_data->>'status', 'active'),
    coalesce((p_data->>'next_run_at')::timestamptz, now())
  )
  on conflict (stripe_subscription_id) do update
    set status = excluded.status,
        email = coalesce(excluded.email, private.subscriptions.email)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.ea_set_subscription_status(p_secret text, p_stripe_subscription_id text, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_secret(p_secret);
  update private.subscriptions set status = p_status where stripe_subscription_id = p_stripe_subscription_id;
end;
$$;

create or replace function public.ea_due_subscriptions(p_secret text, p_limit int)
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_secret(p_secret);
  return query
    select to_jsonb(s) from private.subscriptions s
    where s.status in ('active', 'trialing') and s.next_run_at <= now()
    order by s.next_run_at
    limit p_limit;
end;
$$;

create or replace function public.ea_subscription_ran(p_secret text, p_id uuid, p_audit_id uuid, p_score int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_secret(p_secret);
  update private.subscriptions
     set last_audit_id = p_audit_id,
         last_score = p_score,
         next_run_at = now() + interval '30 days'
   where id = p_id;
end;
$$;

-- Aggregate stats (real numbers for marketing posts) -----------------------
create or replace function public.ea_stats(p_secret text, p_days int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v jsonb;
begin
  perform private.assert_secret(p_secret);
  with recent as (
    select * from private.audits
    where created_at > now() - make_interval(days => p_days) and parent_id is null
  ), checks as (
    select c->>'id' as check_id, c->>'status' as status
    from recent, jsonb_array_elements(recent.result->'checks') c
  )
  select jsonb_build_object(
    'audits', (select count(*) from recent),
    'distinct_domains', (select count(distinct domain) from recent),
    'avg_score', (select round(avg(score)) from recent),
    'paid', (select count(*) from recent where paid),
    'revenue_cents', (select coalesce(sum(amount_cents), 0) from recent where paid),
    'fail_rates', (
      select coalesce(jsonb_object_agg(check_id, rate), '{}'::jsonb) from (
        select check_id, round(100.0 * count(*) filter (where status = 'fail') / nullif(count(*), 0)) as rate
        from checks group by check_id
      ) t
    )
  ) into v;
  return v;
end;
$$;

-- Lock down execution: only roles that hold the anon/publishable or secret key
-- can call these, and every call still has to present the APP_SECRET.
revoke all on function private.assert_secret(text) from public, anon, authenticated;
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'ea\_%'
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated, service_role', f.sig);
  end loop;
end $$;
