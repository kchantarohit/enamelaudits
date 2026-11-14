-- Cold outreach queue + suppression list.
-- One row per clinic: unique by email AND by domain, so a clinic can never be
-- emailed twice. Rows move queued -> sending -> sent | skipped | failed.
-- A row stuck in "sending" (crashed run) is parked as "failed", never re-sent
-- automatically, because the email may already have gone out.

create table if not exists private.outreach_contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email text not null,
  domain text not null,
  website text not null,
  name text,
  first_name text,
  city text,
  source text,
  status text not null default 'queued',
  attempts int not null default 0,
  audit_id uuid,
  score int,
  grade text,
  issue_count int,
  report_url text,
  message_id text,
  sent_at timestamptz,
  last_error text
);
create unique index if not exists outreach_contacts_email_key on private.outreach_contacts (lower(email));
create unique index if not exists outreach_contacts_domain_key on private.outreach_contacts (lower(domain));
create index if not exists outreach_contacts_status_idx on private.outreach_contacts (status, created_at);
create index if not exists outreach_contacts_sent_idx on private.outreach_contacts (sent_at);

create table if not exists private.outreach_suppressions (
  value text primary key,
  reason text,
  created_at timestamptz not null default now()
);

alter table private.outreach_contacts enable row level security;
alter table private.outreach_suppressions enable row level security;

create or replace function public.ea_outreach_enqueue(p_secret text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_email text; v_domain text; v_ins int := 0; v_skip int := 0;
begin
  perform private.assert_secret(p_secret);
  for r in select * from jsonb_array_elements(p_rows) loop
    v_email := lower(trim(coalesce(r->>'email', '')));
    v_domain := lower(trim(coalesce(r->>'domain', '')));
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or v_domain = '' then v_skip := v_skip + 1; continue; end if;
    if exists (select 1 from private.outreach_suppressions s where s.value in (v_email, v_domain)) then v_skip := v_skip + 1; continue; end if;
    insert into private.outreach_contacts (email, domain, website, name, first_name, city, source)
    values (v_email, v_domain, coalesce(nullif(r->>'website', ''), 'https://' || v_domain),
            nullif(r->>'name', ''), nullif(r->>'first_name', ''), nullif(r->>'city', ''), coalesce(nullif(r->>'source', ''), 'csv'))
    on conflict do nothing;
    if found then v_ins := v_ins + 1; else v_skip := v_skip + 1; end if;
  end loop;
  return jsonb_build_object('inserted', v_ins, 'skipped', v_skip);
end; $$;

-- Read-only preview of the next queued contacts (used by dry runs).
create or replace function public.ea_outreach_peek(p_secret text, p_limit int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.assert_secret(p_secret);
  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb) into v
  from (select * from private.outreach_contacts where status = 'queued' order by created_at limit greatest(0, p_limit)) c;
  return v;
end; $$;

-- Claim the next batch, enforcing a rolling 24-hour cap across all runs.
create or replace function public.ea_outreach_next(p_secret text, p_limit int, p_daily_cap int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sent int; v_n int; v_rows jsonb;
begin
  perform private.assert_secret(p_secret);
  update private.outreach_contacts
     set status = 'failed', last_error = 'Stuck in sending: check the Sent folder before re-queueing', updated_at = now()
   where status = 'sending' and updated_at < now() - interval '2 hours';
  select count(*) into v_sent from private.outreach_contacts where sent_at > now() - interval '24 hours';
  v_n := greatest(0, least(p_limit, p_daily_cap - v_sent));
  with picked as (
    select c.id from private.outreach_contacts c
    where c.status = 'queued'
      and not exists (select 1 from private.outreach_suppressions s where s.value in (lower(c.email), lower(c.domain)))
    order by c.created_at
    limit v_n
    for update skip locked
  ), upd as (
    update private.outreach_contacts c
       set status = 'sending', attempts = c.attempts + 1, updated_at = now()
      from picked where c.id = picked.id
    returning c.*
  )
  select coalesce(jsonb_agg(to_jsonb(upd)), '[]'::jsonb) into v_rows from upd;
  return jsonb_build_object('contacts', v_rows, 'sent_24h', v_sent, 'remaining_24h', greatest(0, p_daily_cap - v_sent - jsonb_array_length(v_rows)));
end; $$;

create or replace function public.ea_outreach_result(p_secret text, p_id uuid, p_status text, p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_secret(p_secret);
  if p_status = 'sent' then
    update private.outreach_contacts set status = 'sent', sent_at = now(),
      audit_id = nullif(p_data->>'audit_id', '')::uuid, score = (p_data->>'score')::int, grade = p_data->>'grade',
      issue_count = (p_data->>'issue_count')::int, report_url = p_data->>'report_url', message_id = p_data->>'message_id',
      last_error = null, updated_at = now()
    where id = p_id and status = 'sending';
  elsif p_status = 'skipped' then
    update private.outreach_contacts set status = 'skipped',
      audit_id = nullif(p_data->>'audit_id', '')::uuid, score = (p_data->>'score')::int, grade = p_data->>'grade',
      issue_count = (p_data->>'issue_count')::int, report_url = p_data->>'report_url',
      last_error = left(p_data->>'error', 500), updated_at = now()
    where id = p_id and status = 'sending';
  elsif p_status = 'failed' then
    -- Only for errors where the email was definitely NOT accepted by Gmail.
    update private.outreach_contacts
       set status = case when attempts >= 3 then 'failed' else 'queued' end,
           last_error = left(p_data->>'error', 500), updated_at = now()
     where id = p_id and status = 'sending';
  else
    raise exception 'invalid status %', p_status;
  end if;
end; $$;

create or replace function public.ea_outreach_suppress(p_secret text, p_value text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v text := lower(trim(p_value));
begin
  perform private.assert_secret(p_secret);
  if v is null or v = '' then return; end if;
  insert into private.outreach_suppressions (value, reason) values (v, p_reason) on conflict (value) do nothing;
  update private.outreach_contacts set status = 'suppressed', updated_at = now()
   where (lower(email) = v or lower(domain) = v) and status in ('queued', 'failed');
end; $$;

create or replace function public.ea_outreach_stats(p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.assert_secret(p_secret);
  select jsonb_build_object(
    'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from private.outreach_contacts group by status) t), '{}'::jsonb),
    'sent_24h', (select count(*) from private.outreach_contacts where sent_at > now() - interval '24 hours'),
    'suppressed', (select count(*) from private.outreach_suppressions)
  ) into v;
  return v;
end; $$;

-- Match the privileges of the existing ea_* functions (so this works before
-- and after 0002_service_role_only.sql has been applied).
do $$
declare f record; v_anon boolean;
begin
  select has_function_privilege('anon', 'public.ea_get_audit(text, uuid)', 'execute') into v_anon;
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'ea\_outreach\_%'
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    if v_anon then execute format('grant execute on function %s to anon, authenticated', f.sig); end if;
  end loop;
end $$;
