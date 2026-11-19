-- Optional first-party usage metrics. No identities, URLs, form text or IPs are stored.
create table private.platform_usage_settings (
 singleton boolean primary key default true check(singleton),
 activated_at timestamptz not null default now(),
 rate_secret text not null default encode(extensions.gen_random_bytes(32),'hex')
);
insert into private.platform_usage_settings(singleton) values(true);
create table private.platform_usage_sessions (
 id uuid primary key, visitor_id uuid not null,
 started_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
 source text not null check(source in ('direct','internal','instagram','facebook','google','whatsapp','email','search','other')),
 device text not null check(device in ('mobile','tablet','desktop')),
 unique(id,visitor_id)
);
create index platform_usage_sessions_retention_idx on private.platform_usage_sessions(last_seen_at);
create index platform_usage_sessions_visitor_idx on private.platform_usage_sessions(visitor_id,started_at);
create table private.platform_usage_events (
 id uuid primary key, session_id uuid not null, visitor_id uuid not null, visit_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 received_at timestamptz not null default clock_timestamp(),
 event text not null check(event in ('page_view','click','scroll','engagement','signup_started','signup_submitted','signup_completed','login_succeeded','panel_open','workspace_view','product_saved','catalog_published','checkout_open','order_completed')),
 page text not null check(page in ('home','catalog_landing','signup','signup_essential','signup_complete','login','panel','storefront','order_tracking','subscription','contact','legal','client','booking')),
 target text not null default '' check(target in ('','hero_signup','footer_signup','nav_signup','plan_essential','plan_complete','plans','demo','login','contact','legal','home','whatsapp','instagram','assistant','panel_orders','panel_products','panel_storefront','panel_sales','panel_account','add_product','open_cart','checkout','photo','signup_next')),
 value smallint not null default 0 check(value between 0 and 1800),
 foreign key(session_id,visitor_id) references private.platform_usage_sessions(id,visitor_id) on delete cascade,
 check(event<>'scroll' or value in (25,50,75,90))
);
create index platform_usage_events_period_idx on private.platform_usage_events(created_at,page);
create index platform_usage_events_retention_idx on private.platform_usage_events(received_at);
create index platform_usage_events_session_idx on private.platform_usage_events(session_id,visitor_id,created_at);
create index platform_usage_events_funnel_idx on private.platform_usage_events(visitor_id,created_at,event);
create table private.platform_usage_rate_buckets (
 subject_hash text not null, minute timestamptz not null, event_count integer not null,
 primary key(subject_hash,minute)
);
create index platform_usage_rate_retention_idx on private.platform_usage_rate_buckets(minute);
alter table private.platform_usage_settings enable row level security;
alter table private.platform_usage_sessions enable row level security;
alter table private.platform_usage_events enable row level security;
alter table private.platform_usage_rate_buckets enable row level security;
revoke all on private.platform_usage_settings,private.platform_usage_sessions,private.platform_usage_events,private.platform_usage_rate_buckets from public,anon,authenticated,service_role;

create function private.platform_usage_surface(page text) returns text
language sql immutable security invoker set search_path='' as $$
 select case when page in ('panel','subscription','client') then 'app' when page in ('storefront','order_tracking','booking') then 'storefront' else 'site' end
$$;

create function private.record_platform_usage(events jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare entry jsonb; clean private.platform_usage_events; session_row private.platform_usage_sessions; batch_visitor uuid; batch_session uuid;
 headers jsonb; address_hint text; subject text; rate_count integer; accepted integer:=0; stamp timestamptz:=now();
begin
 if jsonb_typeof(events) is distinct from 'array' or jsonb_array_length(events) not between 1 and 20 or octet_length(events::text)>20000 then
  raise exception 'Lote de estatísticas inválido' using errcode='22023'; end if;
 -- Strictly bounded vocabulary rejects accidental PII before any insert.
 for entry in select value from jsonb_array_elements(events) loop
  if jsonb_typeof(entry) is distinct from 'object' or entry-'id'-'session_id'-'visitor_id'-'visit_id'-'occurred_at'-'event'-'page'-'target'-'value'-'source'-'device'<>'{}'::jsonb
   or not(entry ?& array['id','session_id','visitor_id','visit_id','occurred_at','event','page','target','value','source','device'])
   or exists(select 1 from jsonb_each(entry) e where e.key not in ('value','occurred_at') and jsonb_typeof(e.value)<>'string')
   or jsonb_typeof(entry->'value')<>'number' or (entry->>'value')!~ '^\d{1,4}$'
   or jsonb_typeof(entry->'occurred_at')<>'number' or (entry->>'occurred_at')!~ '^\d{15,16}$' then raise exception 'Evento de estatística inválido' using errcode='22023'; end if;
  begin
   clean.id:=(entry->>'id')::uuid;clean.visitor_id:=(entry->>'visitor_id')::uuid;clean.session_id:=(entry->>'session_id')::uuid;clean.visit_id:=(entry->>'visit_id')::uuid;
   clean.event:=entry->>'event';clean.page:=entry->>'page';clean.target:=entry->>'target';clean.value:=(entry->>'value')::smallint;
   clean.created_at:=to_timestamp((entry->>'occurred_at')::numeric/1000000);
  exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Evento de estatística inválido' using errcode='22023'; end;
  if clean.created_at<stamp-interval '24 hours' or clean.created_at>clock_timestamp()+interval '5 minutes'
   or clean.event not in ('page_view','click','scroll','engagement','signup_started','signup_submitted','signup_completed','login_succeeded','panel_open','workspace_view','product_saved','catalog_published','checkout_open','order_completed')
   or clean.page not in ('home','catalog_landing','signup','signup_essential','signup_complete','login','panel','storefront','order_tracking','subscription','contact','legal','client','booking')
   or clean.target not in ('','hero_signup','footer_signup','nav_signup','plan_essential','plan_complete','plans','demo','login','contact','legal','home','whatsapp','instagram','assistant','panel_orders','panel_products','panel_storefront','panel_sales','panel_account','add_product','open_cart','checkout','photo','signup_next')
   or clean.value not between 0 and 1800 or clean.event='scroll' and clean.value not in (25,50,75,90)
   or entry->>'source' not in ('direct','internal','instagram','facebook','google','whatsapp','email','search','other')
   or entry->>'device' not in ('mobile','tablet','desktop') then raise exception 'Evento de estatística inválido' using errcode='22023'; end if;
  if batch_visitor is null then batch_visitor:=clean.visitor_id;batch_session:=clean.session_id;
  elsif batch_visitor<>clean.visitor_id or batch_session<>clean.session_id then raise exception 'Não misture sessões no lote' using errcode='22023'; end if;
 end loop;
 headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 if headers ? 'origin' and headers->>'origin' not in ('https://ogritech.com.br','https://www.ogritech.com.br','http://127.0.0.1:8080','http://localhost:8080') then
  raise exception 'Origem não permitida' using errcode='42501'; end if;
 -- Forwarded addresses are only a best-effort abuse signal, never authorization.
 -- Hash uses a private daily secret; raw address/header values are never persisted.
 address_hint:=left(coalesce(nullif(headers->>'cf-connecting-ip',''),nullif(split_part(headers->>'x-forwarded-for',',',1),''),batch_visitor::text),200);
 select encode(extensions.hmac(address_hint||stamp::date::text,rate_secret,'sha256'),'hex') into subject from private.platform_usage_settings where singleton;
 insert into private.platform_usage_rate_buckets(subject_hash,minute,event_count) values(subject,date_trunc('minute',stamp),jsonb_array_length(events))
 on conflict(subject_hash,minute) do update set event_count=private.platform_usage_rate_buckets.event_count+excluded.event_count
 where private.platform_usage_rate_buckets.event_count+excluded.event_count<=1200 returning event_count into rate_count;
 if rate_count is null then return jsonb_build_object('accepted',0,'limited',true); end if;
 perform pg_advisory_xact_lock(hashtextextended(batch_session::text,805));
 select * into session_row from private.platform_usage_sessions where id=batch_session;
 if found and (session_row.visitor_id<>batch_visitor or stamp-session_row.started_at>interval '12 hours') then raise exception 'Sessão de estatísticas inválida' using errcode='22023'; end if;
 if (select count(*) from private.platform_usage_events where session_id=batch_session)>=3000 then return jsonb_build_object('accepted',0,'limited',true); end if;
 entry:=events->0;
 insert into private.platform_usage_sessions(id,visitor_id,source,device) values(batch_session,batch_visitor,entry->>'source',entry->>'device')
 on conflict(id) do update set last_seen_at=stamp;
 insert into private.platform_usage_events(id,session_id,visitor_id,visit_id,created_at,event,page,target,value)
 select (e->>'id')::uuid,(e->>'session_id')::uuid,(e->>'visitor_id')::uuid,(e->>'visit_id')::uuid,to_timestamp((e->>'occurred_at')::numeric/1000000),e->>'event',e->>'page',e->>'target',(e->>'value')::smallint
 from jsonb_array_elements(events) with ordinality as payload(e,position) order by position on conflict(id) do nothing;
 get diagnostics accepted=row_count;
 return jsonb_build_object('accepted',accepted,'limited',false);
end $$;

create function public.public_record_platform_usage(events jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.record_platform_usage(events) $$;
revoke all on function public.public_record_platform_usage(jsonb),private.record_platform_usage(jsonb) from public,anon,authenticated;
grant execute on function public.public_record_platform_usage(jsonb),private.record_platform_usage(jsonb) to anon,authenticated;

create function private.platform_usage_report(start_date date,end_date date,scope text default 'all') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; from_time timestamptz; to_time timestamptz; local_today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if not public.is_platform_admin() or not exists(select 1 from public.profiles where id=auth.uid() and active) then raise exception 'Acesso negado' using errcode='42501'; end if;
 if start_date is null or end_date is null or start_date>end_date or end_date>local_today or end_date-start_date>89 or scope is null or scope not in ('all','site','app','storefront') then raise exception 'Período ou área inválidos' using errcode='22023'; end if;
 from_time:=start_date::timestamp at time zone 'America/Sao_Paulo';to_time:=(end_date+1)::timestamp at time zone 'America/Sao_Paulo';
 with e as materialized (
  select ev.*,s.source,s.device from private.platform_usage_events ev join private.platform_usage_sessions s on s.id=ev.session_id
  where ev.created_at>=from_time and ev.created_at<to_time and (scope='all' or private.platform_usage_surface(ev.page)=scope)
 ), visits as (
  select session_id,visitor_id,visit_id,page,count(*) filter(where event='page_view') views,max(value) filter(where event='scroll') depth,max(value) filter(where event='engagement') seconds
  from e group by session_id,visitor_id,visit_id,page
 ), sessions as (
  select session_id,max(source) source,max(device) device,count(*) filter(where event='page_view') views,bool_or(event='engagement' and value>=10 or event='scroll' and value>=50) active from e group by session_id
 ), navigation as (
  select page,lag(page) over(partition by session_id order by created_at,id) previous from e where event='page_view'
 ), signup as (
  select visitor_id,min(created_at) opened from e where event='page_view' and page in ('signup','signup_essential','signup_complete') group by visitor_id
 ), signup_started as (
  select s.visitor_id,s.opened,min(e.created_at) started from signup s left join e on e.visitor_id=s.visitor_id and e.event='signup_started' and e.created_at>=s.opened group by s.visitor_id,s.opened
 ), signup_submitted as (
  select s.visitor_id,s.started,min(e.created_at) submitted from signup_started s left join e on e.visitor_id=s.visitor_id and e.event='signup_submitted' and e.created_at>=s.started group by s.visitor_id,s.started
 ), signup_completed as (
  select s.visitor_id,min(e.created_at) completed from signup_submitted s left join e on e.visitor_id=s.visitor_id and e.event='signup_completed' and e.created_at>=s.submitted group by s.visitor_id
 ), app_open as (
  select visitor_id,min(created_at) opened from e where event='panel_open' group by visitor_id
 ), app_products as (
  select s.visitor_id,min(e.created_at) products from app_open s left join e on e.visitor_id=s.visitor_id and e.event='workspace_view' and e.target='panel_products' and e.created_at>=s.opened group by s.visitor_id
 ), app_saved as (
  select s.visitor_id,min(e.created_at) saved from app_products s left join e on e.visitor_id=s.visitor_id and e.event='product_saved' and e.created_at>=s.products group by s.visitor_id
 ), app_published as (
  select s.visitor_id,min(e.created_at) published from app_saved s left join e on e.visitor_id=s.visitor_id and e.event='catalog_published' and e.created_at>=s.saved group by s.visitor_id
 )
 select jsonb_build_object(
  'period',jsonb_build_object('start',start_date,'end',end_date,'timezone','America/Sao_Paulo','scope',scope),
  'activated_at',(select activated_at from private.platform_usage_settings where singleton),
  'summary',jsonb_build_object('visitors',(select count(distinct visitor_id) from e),'sessions',(select count(*) from sessions),'page_views',(select count(*) from e where event='page_view'),'engaged_sessions',(select count(*) from sessions where active or views>1),'clicks',(select count(*) from e where event='click'),'signups',(select count(*) from e where event='signup_completed'),'publications',(select count(*) from e where event='catalog_published')),
  'daily',coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from (select series_day::date as "day",(select count(*) from e where event='page_view' and (created_at at time zone 'America/Sao_Paulo')::date=series_day::date) page_views,(select count(distinct visitor_id) from e where (created_at at time zone 'America/Sao_Paulo')::date=series_day::date) visitors from generate_series(start_date::timestamp,end_date::timestamp,interval '1 day') as days(series_day)) d),'[]'::jsonb),
  'pages',coalesce((select jsonb_agg(to_jsonb(p) order by p.views desc,p.page) from (select page,sum(views)::bigint views,count(distinct session_id) sessions,round(avg(coalesce(depth,0)),1) average_scroll,round(avg(seconds),1) average_active_seconds from visits group by page) p),'[]'::jsonb),
  'clicks',coalesce((select jsonb_agg(to_jsonb(c) order by c.clicks desc,c.target) from (select page,target,count(*) clicks,count(distinct session_id) sessions from e where event='click' group by page,target order by count(*) desc limit 30) c),'[]'::jsonb),
  'sources',coalesce((select jsonb_agg(to_jsonb(s) order by s.sessions desc,s.source) from (select source,count(*) sessions from sessions group by source) s),'[]'::jsonb),
  'devices',coalesce((select jsonb_agg(to_jsonb(d) order by d.sessions desc,d.device) from (select device,count(*) sessions from sessions group by device) d),'[]'::jsonb),
  'paths',coalesce((select jsonb_agg(to_jsonb(p) order by p.transitions desc,p.previous,p.page) from (select previous,page,count(*) transitions from navigation where previous is not null and previous<>page group by previous,page order by count(*) desc limit 20) p),'[]'::jsonb),
  'signup_funnel',jsonb_build_array(jsonb_build_object('step','signup_open','count',(select count(*) from signup)),jsonb_build_object('step','signup_started','count',(select count(*) from signup_started where started is not null)),jsonb_build_object('step','signup_submitted','count',(select count(*) from signup_submitted where submitted is not null)),jsonb_build_object('step','signup_completed','count',(select count(*) from signup_completed where completed is not null))),
  'app_funnel',jsonb_build_array(jsonb_build_object('step','panel_open','count',(select count(*) from app_open)),jsonb_build_object('step','products_open','count',(select count(*) from app_products where products is not null)),jsonb_build_object('step','product_saved','count',(select count(*) from app_saved where saved is not null)),jsonb_build_object('step','catalog_published','count',(select count(*) from app_published where published is not null))),
  'latest_event_at',(select max(created_at) from e)
 ) into result;
 return result;
end $$;
create function public.platform_usage_report(start_date date,end_date date,scope text default 'all') returns jsonb
language sql stable security invoker set search_path='' as $$ select private.platform_usage_report(start_date,end_date,scope) $$;
revoke all on function public.platform_usage_report(date,date,text),private.platform_usage_report(date,date,text) from public,anon,authenticated;
grant execute on function public.platform_usage_report(date,date,text),private.platform_usage_report(date,date,text) to authenticated;

create function private.prune_platform_usage() returns void language plpgsql security definer set search_path='' as $$
begin
 delete from private.platform_usage_events where received_at<now()-interval '90 days';
 delete from private.platform_usage_sessions where last_seen_at<now()-interval '90 days';
 delete from private.platform_usage_rate_buckets where minute<now()-interval '2 days';
end $$;
revoke all on function private.platform_usage_surface(text),private.prune_platform_usage() from public,anon,authenticated,service_role;
select cron.schedule('platform-usage-retention','17 4 * * *','select private.prune_platform_usage()');
