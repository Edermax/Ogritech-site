-- Fase 6F: controles locais para futura homologação híbrida em staging.

create table private.menu_ai_environment_controls (
  environment text primary key check (environment in ('staging','production')),
  hybrid_enabled boolean not null default false,
  kill_switch boolean not null default true,
  maximum_calls integer not null default 0 check(maximum_calls between 0 and 100000),
  maximum_cost_cents integer not null default 0 check(maximum_cost_cents between 0 and 100000000),
  notice_version text not null default 'menu-ai-pilot-2026-09-10' check(length(notice_version) between 3 and 80),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into private.menu_ai_environment_controls(environment) values ('staging'),('production');
alter table private.menu_ai_environment_controls enable row level security;
revoke all on table private.menu_ai_environment_controls from public,anon,authenticated;

alter table public.menu_assistant_settings
  add column hybrid_staging_enabled boolean not null default false,
  add column hybrid_notice_version text,
  add column hybrid_notice_accepted_at timestamptz,
  add column hybrid_notice_accepted_by uuid references auth.users(id) on delete set null;

create table private.menu_ai_staging_events (
  id bigint generated always as identity primary key,
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  menu_id uuid not null references public.online_menus(id) on delete cascade,
  session_hash text not null check(length(session_hash)=64),
  message_hash text not null check(length(message_hash)=64),
  route text not null check(route in ('deterministic','model','fallback')),
  outcome text not null check(outcome in ('accepted','rejected','timeout','invalid_output','provider_error','budget_blocked','kill_switch')),
  provider text, model text,
  latency_ms integer check(latency_ms between 0 and 120000),
  input_tokens integer not null default 0 check(input_tokens between 0 and 100000),
  output_tokens integer not null default 0 check(output_tokens between 0 and 100000),
  estimated_cost_micros integer not null default 0 check(estimated_cost_micros>=0),
  created_at timestamptz not null default now(),
  constraint menu_ai_staging_events_tenant_fk foreign key(menu_id,barbershop_id) references public.online_menus(id,barbershop_id) on delete cascade
);
create index menu_ai_staging_events_limits_idx on private.menu_ai_staging_events(menu_id,created_at desc);
alter table private.menu_ai_staging_events enable row level security;
revoke all on table private.menu_ai_staging_events from public,anon,authenticated;
revoke all on sequence private.menu_ai_staging_events_id_seq from public,anon,authenticated;

create or replace function private.menu_ai_staging_gate(target_slug text,target_session_token text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare menu public.online_menus; settings public.menu_assistant_settings; controls private.menu_ai_environment_controls; month_calls integer; month_cost bigint; session_calls integer; v_session_hash text;
begin
  if length(coalesce(target_slug,'')) not between 3 and 63 or target_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$' then raise exception 'Cardápio inválido' using errcode='22023'; end if;
  if length(coalesce(target_session_token,'')) not between 20 and 120 or target_session_token !~ '^[A-Za-z0-9_-]+$' then raise exception 'Sessão inválida' using errcode='22023'; end if;
  select * into controls from private.menu_ai_environment_controls where environment='staging';
  if controls.kill_switch or not controls.hybrid_enabled then return jsonb_build_object('allowed',false,'code','hybrid_disabled'); end if;
  select * into menu from public.online_menus where slug=target_slug and published;
  if menu.id is null or not private.business_product_is_active(menu.barbershop_id,'menu') then return jsonb_build_object('allowed',false,'code','menu_unavailable'); end if;
  select * into settings from public.menu_assistant_settings where menu_id=menu.id;
  if not coalesce(settings.enabled,false) or not coalesce(settings.hybrid_staging_enabled,false) or settings.hybrid_notice_version is distinct from controls.notice_version then return jsonb_build_object('allowed',false,'code','business_not_enabled'); end if;
  v_session_hash:=encode(extensions.digest(menu.id::text||':'||target_session_token,'sha256'),'hex');
  select count(*),coalesce(sum(estimated_cost_micros),0) into month_calls,month_cost from private.menu_ai_staging_events where menu_id=menu.id and created_at>=date_trunc('month',now());
  select count(*) into session_calls from private.menu_ai_staging_events where menu_id=menu.id and session_hash=v_session_hash and created_at>now()-interval '1 hour';
  if month_calls>=least(settings.monthly_interaction_limit,controls.maximum_calls) or session_calls>=settings.per_session_hourly_limit or month_cost>=least(settings.monthly_cost_cap_cents,controls.maximum_cost_cents)::bigint*10000 then return jsonb_build_object('allowed',false,'code','limit_reached'); end if;
  return jsonb_build_object('allowed',true,'menu_id',menu.id,'barbershop_id',menu.barbershop_id,'session_hash',v_session_hash,'notice_version',controls.notice_version,'notice','Este atendimento combina respostas automáticas locais e inteligência artificial. Preços e pedidos são confirmados pelo sistema e por você.');
end;
$$;

create or replace function private.save_menu_ai_staging_consent(target_barbershop_id uuid,target_enabled boolean,target_notice_version text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare controls private.menu_ai_environment_controls;
begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id) or not private.business_has_product_access(target_barbershop_id,'menu') then raise exception 'Acesso negado' using errcode='42501'; end if;
  select * into controls from private.menu_ai_environment_controls where environment='staging';
  if target_enabled and target_notice_version is distinct from controls.notice_version then raise exception 'Revise o aviso vigente antes de ativar' using errcode='22023'; end if;
  update public.menu_assistant_settings set hybrid_staging_enabled=target_enabled,hybrid_notice_version=case when target_enabled then target_notice_version else null end,hybrid_notice_accepted_at=case when target_enabled then now() else null end,hybrid_notice_accepted_by=case when target_enabled then (select auth.uid()) else null end,updated_by=(select auth.uid()),updated_at=now() where barbershop_id=target_barbershop_id;
  if not found then raise exception 'Configure o assistente antes da homologação' using errcode='22023'; end if;
  return jsonb_build_object('hybrid_staging_enabled',target_enabled,'notice_version',case when target_enabled then target_notice_version else null end);
end;
$$;

create or replace function private.set_menu_ai_environment_controls(target_environment text,target_enabled boolean,target_kill_switch boolean,target_maximum_calls integer,target_maximum_cost_cents integer)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then raise exception 'Acesso negado' using errcode='42501'; end if;
  if target_environment not in ('staging','production') or target_maximum_calls not between 0 and 100000 or target_maximum_cost_cents not between 0 and 100000000 then raise exception 'Configuração inválida' using errcode='22023'; end if;
  update private.menu_ai_environment_controls set hybrid_enabled=target_enabled,kill_switch=target_kill_switch,maximum_calls=target_maximum_calls,maximum_cost_cents=target_maximum_cost_cents,updated_by=(select auth.uid()),updated_at=now() where environment=target_environment;
  return jsonb_build_object('environment',target_environment,'hybrid_enabled',target_enabled,'kill_switch',target_kill_switch,'maximum_calls',target_maximum_calls,'maximum_cost_cents',target_maximum_cost_cents);
end;
$$;

revoke all on function private.menu_ai_staging_gate(text,text),private.save_menu_ai_staging_consent(uuid,boolean,text),private.set_menu_ai_environment_controls(text,boolean,boolean,integer,integer) from public,anon,authenticated;
grant execute on function private.menu_ai_staging_gate(text,text) to anon,authenticated;
grant execute on function private.save_menu_ai_staging_consent(uuid,boolean,text),private.set_menu_ai_environment_controls(text,boolean,boolean,integer,integer) to authenticated;

create function public.menu_ai_staging_gate(target_slug text,target_session_token text) returns jsonb language sql security invoker set search_path='' as $$select private.menu_ai_staging_gate(target_slug,target_session_token)$$;
create function public.save_menu_ai_staging_consent(target_barbershop_id uuid,target_enabled boolean,target_notice_version text) returns jsonb language sql security invoker set search_path='' as $$select private.save_menu_ai_staging_consent(target_barbershop_id,target_enabled,target_notice_version)$$;
create function public.set_menu_ai_environment_controls(target_environment text,target_enabled boolean,target_kill_switch boolean,target_maximum_calls integer,target_maximum_cost_cents integer) returns jsonb language sql security invoker set search_path='' as $$select private.set_menu_ai_environment_controls(target_environment,target_enabled,target_kill_switch,target_maximum_calls,target_maximum_cost_cents)$$;
revoke all on function public.menu_ai_staging_gate(text,text),public.save_menu_ai_staging_consent(uuid,boolean,text),public.set_menu_ai_environment_controls(text,boolean,boolean,integer,integer) from public;
grant execute on function public.menu_ai_staging_gate(text,text) to anon,authenticated;
grant execute on function public.save_menu_ai_staging_consent(uuid,boolean,text),public.set_menu_ai_environment_controls(text,boolean,boolean,integer,integer) to authenticated;
