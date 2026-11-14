-- Hands-free outreach (hourly sender + daily lead finder).
--  * custom_subject / custom_body: hand-checked copy for a queued clinic; the sender uses it verbatim
--    (the body may contain {{unsubscribe_line}}, replaced with the signed unsubscribe link at send time).
--  * ea_outreach_enqueue: also records clinics the lead finder screened out (status "skipped"), so
--    they are never audited or emailed again.
--  * ea_outreach_known: which of these domains are already in the queue/history or suppressed.
--  * ea_outreach_next2: like ea_outreach_next, plus a per-calendar-day cap in a given time zone.
-- Safe to re-run.

alter table private.outreach_contacts add column if not exists custom_subject text;
alter table private.outreach_contacts add column if not exists custom_body text;

create or replace function public.ea_outreach_enqueue(p_secret text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_email text; v_domain text; v_status text; v_ins int := 0; v_queued int := 0; v_skip int := 0;
begin
  perform private.assert_secret(p_secret);
  for r in select * from jsonb_array_elements(p_rows) loop
    v_email := lower(trim(coalesce(r->>'email', '')));
    v_domain := lower(trim(coalesce(r->>'domain', '')));
    v_status := case when r->>'status' = 'skipped' then 'skipped' else 'queued' end;
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or v_domain = '' then v_skip := v_skip + 1; continue; end if;
    if exists (select 1 from private.outreach_suppressions s where s.value in (v_email, v_domain)) then v_skip := v_skip + 1; continue; end if;
    insert into private.outreach_contacts (email, domain, website, name, first_name, city, source, status, score, grade, issue_count, last_error)
    values (v_email, v_domain, coalesce(nullif(r->>'website', ''), 'https://' || v_domain),
            nullif(r->>'name', ''), nullif(r->>'first_name', ''), nullif(r->>'city', ''), coalesce(nullif(r->>'source', ''), 'csv'),
            v_status,
            case when coalesce(r->>'score', '') ~ '^\d{1,3}$' then (r->>'score')::int end,
            nullif(left(coalesce(r->>'grade', ''), 2), ''),
            case when coalesce(r->>'issue_count', '') ~ '^\d{1,4}$' then (r->>'issue_count')::int end,
            nullif(left(coalesce(r->>'reason', ''), 500), ''))
    on conflict do nothing;
    if found then
      v_ins := v_ins + 1;
      if v_status = 'queued' then v_queued := v_queued + 1; end if;
    else
      v_skip := v_skip + 1;
    end if;
  end loop;
  return jsonb_build_object('inserted', v_ins, 'queued', v_queued, 'skipped', v_skip);
end; $$;

create or replace function public.ea_outreach_known(p_secret text, p_domains jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.assert_secret(p_secret);
  select coalesce(jsonb_agg(distinct q.d), '[]'::jsonb) into v
  from (select lower(trim(x)) as d from jsonb_array_elements_text(coalesce(p_domains, '[]'::jsonb)) as x) q
  where exists (select 1 from private.outreach_contacts c where lower(c.domain) = q.d)
     or exists (select 1 from private.outreach_suppressions s where s.value = q.d);
  return v;
end; $$;

create or replace function public.ea_outreach_next2(p_secret text, p_limit int, p_daily_cap int, p_day_cap int, p_tz text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sent int; v_today int; v_n int; v_rows jsonb; v_tz text := coalesce(nullif(p_tz, ''), 'America/Chicago');
begin
  perform private.assert_secret(p_secret);
  update private.outreach_contacts
     set status = 'failed', last_error = 'Stuck in sending: check the Sent folder before re-queueing', updated_at = now()
   where status = 'sending' and updated_at < now() - interval '2 hours';
  select count(*) into v_sent from private.outreach_contacts where sent_at > now() - interval '24 hours';
  select count(*) into v_today from private.outreach_contacts
   where sent_at >= (date_trunc('day', now() at time zone v_tz) at time zone v_tz);
  v_n := greatest(0, least(p_limit, p_daily_cap - v_sent, coalesce(p_day_cap, p_daily_cap) - v_today));
  with picked as (
    select c.id from private.outreach_contacts c
    where c.status = 'queued'
      and not exists (select 1 from private.outreach_suppressions s where s.value in (lower(c.email), lower(c.domain)))
    order by (c.custom_body is null), c.created_at
    limit v_n
    for update skip locked
  ), upd as (
    update private.outreach_contacts c
       set status = 'sending', attempts = c.attempts + 1, updated_at = now()
      from picked where c.id = picked.id
    returning c.*
  )
  select coalesce(jsonb_agg(to_jsonb(upd)), '[]'::jsonb) into v_rows from upd;
  return jsonb_build_object('contacts', v_rows, 'sent_24h', v_sent, 'sent_today', v_today,
    'remaining_today', greatest(0, least(p_daily_cap - v_sent, coalesce(p_day_cap, p_daily_cap) - v_today) - jsonb_array_length(v_rows)));
end; $$;

-- Same privileges as the other ea_outreach_* functions (see 0003).
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
