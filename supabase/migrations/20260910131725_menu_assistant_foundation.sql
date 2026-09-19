-- Fase 6A: assistente determinístico do Cardápio, sem provedor de IA.

create table public.menu_assistant_settings (
  barbershop_id uuid primary key references public.barbershops(id) on delete cascade,
  menu_id uuid not null unique references public.online_menus(id) on delete cascade,
  enabled boolean not null default false,
  monthly_interaction_limit integer not null default 1000 check(monthly_interaction_limit between 0 and 100000),
  per_session_hourly_limit integer not null default 20 check(per_session_hourly_limit between 1 and 100),
  estimated_unit_cost_micros integer not null default 0 check(estimated_unit_cost_micros between 0 and 100000000),
  monthly_cost_cap_cents integer not null default 0 check(monthly_cost_cap_cents between 0 and 100000000),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_assistant_settings_tenant_fk foreign key(menu_id,barbershop_id) references public.online_menus(id,barbershop_id) on delete cascade
);

create table private.menu_assistant_events (
  id bigint generated always as identity primary key,
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  menu_id uuid not null references public.online_menus(id) on delete cascade,
  session_hash text not null check(length(session_hash)=64),
  message_hash text not null check(length(message_hash)=64),
  intent text not null,
  tool_name text,
  outcome text not null check(outcome in ('answered','suggested','blocked','fallback')),
  estimated_cost_micros integer not null default 0 check(estimated_cost_micros>=0),
  created_at timestamptz not null default now(),
  constraint menu_assistant_events_tenant_fk foreign key(menu_id,barbershop_id) references public.online_menus(id,barbershop_id) on delete cascade
);
create index menu_assistant_events_session_rate_idx on private.menu_assistant_events(menu_id,session_hash,created_at desc);
create index menu_assistant_events_monthly_idx on private.menu_assistant_events(menu_id,created_at desc);
alter table public.menu_assistant_settings enable row level security;
alter table private.menu_assistant_events enable row level security;
revoke all on table private.menu_assistant_events from public,anon,authenticated;
revoke all on sequence private.menu_assistant_events_id_seq from public,anon,authenticated;
revoke all on table public.menu_assistant_settings from public,anon,authenticated;
grant select on table public.menu_assistant_settings to authenticated;

create policy "Menu managers view assistant settings" on public.menu_assistant_settings for select to authenticated
using(public.is_business_manager(barbershop_id) and private.business_has_product_access(barbershop_id,'menu'));

create or replace function private.menu_assistant_admin_settings(target_barbershop_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare result jsonb;
begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id) or not private.business_has_product_access(target_barbershop_id,'menu') then raise exception 'Acesso negado' using errcode='42501'; end if;
  insert into public.menu_assistant_settings(barbershop_id,menu_id)
  select m.barbershop_id,m.id from public.online_menus m where m.barbershop_id=target_barbershop_id
  on conflict(barbershop_id) do nothing;
  select jsonb_build_object(
    'enabled',settings.enabled,'monthly_interaction_limit',settings.monthly_interaction_limit,
    'per_session_hourly_limit',settings.per_session_hourly_limit,
    'estimated_unit_cost_micros',settings.estimated_unit_cost_micros,'monthly_cost_cap_cents',settings.monthly_cost_cap_cents,
    'month_interactions',(select count(*) from private.menu_assistant_events event where event.menu_id=settings.menu_id and event.created_at>=date_trunc('month',now())),
    'month_estimated_cost_micros',(select coalesce(sum(event.estimated_cost_micros),0) from private.menu_assistant_events event where event.menu_id=settings.menu_id and event.created_at>=date_trunc('month',now()))
  ) into result from public.menu_assistant_settings settings where settings.barbershop_id=target_barbershop_id;
  if result is null then raise exception 'Crie o cardápio antes de configurar o assistente' using errcode='22023'; end if;
  return result;
end;
$$;

create or replace function private.save_menu_assistant_settings(target_barbershop_id uuid,target_enabled boolean,target_monthly_limit integer default 1000,target_session_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id) or not private.business_has_product_access(target_barbershop_id,'menu') then raise exception 'Acesso negado' using errcode='42501'; end if;
  if target_enabled is null or target_monthly_limit is null or target_monthly_limit not between 0 and 100000 or target_session_limit is null or target_session_limit not between 1 and 100 then raise exception 'Configuração inválida' using errcode='22023'; end if;
  insert into public.menu_assistant_settings(barbershop_id,menu_id,enabled,monthly_interaction_limit,per_session_hourly_limit,updated_by)
  select m.barbershop_id,m.id,target_enabled,target_monthly_limit,target_session_limit,(select auth.uid()) from public.online_menus m where m.barbershop_id=target_barbershop_id
  on conflict(barbershop_id) do update set enabled=excluded.enabled,monthly_interaction_limit=excluded.monthly_interaction_limit,per_session_hourly_limit=excluded.per_session_hourly_limit,updated_by=excluded.updated_by,updated_at=now();
  if not found then raise exception 'Crie o cardápio antes de configurar o assistente' using errcode='22023'; end if;
  insert into public.platform_billing_audit_log(actor_id,action,entity_type,entity_id,details)
  select (select auth.uid()),'menu_assistant.settings_saved','online_menu',id,jsonb_build_object('barbershop_id',target_barbershop_id,'enabled',target_enabled,'monthly_limit',target_monthly_limit,'session_limit',target_session_limit) from public.online_menus where barbershop_id=target_barbershop_id;
  return private.menu_assistant_admin_settings(target_barbershop_id);
end;
$$;

create or replace function private.public_menu_assistant_message(target_slug text,session_token text,supplied_message text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  menu public.online_menus; settings public.menu_assistant_settings; clean_message text; normalized text;
  v_session_hash text; v_message_hash text; intent text:='fallback'; tool_name text; outcome text:='fallback'; response_text text;
  suggestions jsonb:='[]'::jsonb; action jsonb:=null; month_count integer; month_cost bigint; session_count integer;
begin
  clean_message:=btrim(coalesce(supplied_message,''));
  if length(coalesce(target_slug,'')) not between 3 and 63 or target_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$' then raise exception 'Cardápio inválido' using errcode='22023'; end if;
  if length(session_token) not between 20 and 120 or session_token !~ '^[A-Za-z0-9_-]+$' then raise exception 'Sessão inválida' using errcode='22023'; end if;
  if length(clean_message) not between 1 and 500 then raise exception 'Mensagem deve ter entre 1 e 500 caracteres' using errcode='22023'; end if;
  select * into menu from public.online_menus where slug=target_slug and published;
  if menu.id is null or not private.business_product_is_active(menu.barbershop_id,'menu') then raise exception 'Cardápio indisponível' using errcode='22023'; end if;
  select * into settings from public.menu_assistant_settings where menu_id=menu.id and enabled;
  if settings.menu_id is null then return jsonb_build_object('available',false,'code','assistant_disabled'); end if;
  v_session_hash:=encode(extensions.digest(menu.id::text||':'||session_token,'sha256'),'hex');
  v_message_hash:=encode(extensions.digest(menu.id::text||':'||clean_message,'sha256'),'hex');
  select count(*) into session_count from private.menu_assistant_events event where event.menu_id=menu.id and event.session_hash=v_session_hash and event.created_at>now()-interval '1 hour';
  select count(*),coalesce(sum(estimated_cost_micros),0) into month_count,month_cost from private.menu_assistant_events where menu_id=menu.id and created_at>=date_trunc('month',now());
  if session_count>=settings.per_session_hourly_limit or month_count>=settings.monthly_interaction_limit then raise exception 'Limite do assistente atingido. Continue pelo cardápio ou fale com o estabelecimento.' using errcode='P0001'; end if;
  if settings.estimated_unit_cost_micros>0 and month_cost+settings.estimated_unit_cost_micros>settings.monthly_cost_cap_cents::bigint*10000 then raise exception 'Limite de custo do assistente atingido' using errcode='P0001'; end if;
  normalized:=lower(translate(clean_message,'ÁÀÂÃÉÊÍÓÔÕÚÜÇáàâãéêíóôõúüç','AAAAEEIOOOUUCAAAAEEIOOOUUC'));

  if normalized ~ '(ignore|ignorar|esqueca|revele|mostre).*(instruc|sistema|prompt|regra|segredo|token)' or normalized ~ '(system prompt|developer message|sql|senha|chave secreta)' then
    intent:='unsafe_instruction'; outcome:='blocked'; response_text:='Não posso alterar minhas regras, revelar dados internos ou executar instruções fora do cardápio. Posso ajudar a encontrar produtos e revisar seu carrinho.';
  elsif normalized ~ '(finalizar|checkout|fechar pedido|meu carrinho|ver carrinho|revisar carrinho)' then
    intent:='cart_review'; tool_name:='open_cart'; outcome:='suggested'; response_text:='Posso abrir a revisão do seu carrinho. Confira itens, valores e dados antes de enviar o pedido.'; action:=jsonb_build_object('type','open_cart','label','Revisar carrinho','requires_confirmation',true);
  elsif normalized ~ '(pagamento|pagar|pix|dinheiro|cartao)' then
    intent:='payment_info'; tool_name:='read_menu_settings'; outcome:='answered'; response_text:='As formas informadas pelo estabelecimento são: '||array_to_string(menu.accepted_payment_methods,', ')||'. O pagamento é combinado diretamente com o estabelecimento.';
  elsif normalized ~ '(horario|abre|fecha|funciona|atendimento)' then
    intent:='hours_info'; tool_name:='read_menu_settings'; outcome:='answered'; response_text:='Horário informado: '||coalesce(menu.weekly_hours->>'opens_at','não informado')||' às '||coalesce(menu.weekly_hours->>'closes_at','não informado')||'. A confirmação depende do estabelecimento.';
  elsif normalized ~ '(oi|ola|bom dia|boa tarde|boa noite|ajuda|cardapio)' then
    intent:='greeting'; outcome:='answered'; response_text:='Olá! Posso localizar produtos, informar horários e pagamentos ou abrir a revisão do carrinho. O que você procura?';
  else
    select coalesce(jsonb_agg(item order by (item->>'name')),'[]'::jsonb) into suggestions from (
      select jsonb_build_object('menu_item_price_id',price.id,'name',menu_item.name,'label',price.label,'price',coalesce(price.promotional_price,price.price),'requires_confirmation',true) item
      from public.menu_categories category join public.menu_items menu_item on menu_item.category_id=category.id
      join public.menu_item_prices price on price.menu_item_id=menu_item.id
      where category.menu_id=menu.id and category.active and menu_item.active and menu_item.available and price.active
        and exists(select 1 from regexp_split_to_table(normalized,'[^a-z0-9]+') word where length(word)>=3 and word not in ('quero','gostaria','voce','voces','produto','tem','uma','para','com') and (lower(menu_item.name)||' '||lower(menu_item.description)||' '||lower(category.name)) like '%'||word||'%')
      order by menu_item.sort_order,price.sort_order limit 5
    ) matched;
    intent:='catalog_search'; tool_name:='search_catalog';
    if jsonb_array_length(suggestions)>0 then outcome:='suggested'; response_text:='Encontrei estas opções no catálogo. Confira o preço e escolha se deseja adicionar.';
    else outcome:='fallback'; response_text:='Não encontrei uma opção com esses termos. Navegue pelas categorias ou tente informar o nome do produto. Se precisar, fale diretamente com o estabelecimento.'; end if;
  end if;

  insert into private.menu_assistant_events(barbershop_id,menu_id,session_hash,message_hash,intent,tool_name,outcome,estimated_cost_micros)
  values(menu.barbershop_id,menu.id,v_session_hash,v_message_hash,intent,tool_name,outcome,settings.estimated_unit_cost_micros);
  return jsonb_build_object('available',true,'reply',response_text,'intent',intent,'suggestions',suggestions,'action',action,'notice','Preços e disponibilidade são confirmados pelo sistema. O assistente não envia pedidos sem sua confirmação.');
end;
$$;

create or replace function private.public_menu_assistant_status(target_slug text)
returns jsonb language sql stable security definer set search_path=''
as $$
  select jsonb_build_object('available',coalesce(settings.enabled,false),'mode','deterministic','external_model',false)
  from public.online_menus menu left join public.menu_assistant_settings settings on settings.menu_id=menu.id
  where menu.slug=target_slug and menu.published and private.business_product_is_active(menu.barbershop_id,'menu')
$$;

revoke all on function private.menu_assistant_admin_settings(uuid),private.save_menu_assistant_settings(uuid,boolean,integer,integer),private.public_menu_assistant_message(text,text,text),private.public_menu_assistant_status(text) from public,anon,authenticated;
grant execute on function private.menu_assistant_admin_settings(uuid),private.save_menu_assistant_settings(uuid,boolean,integer,integer) to authenticated;
grant execute on function private.public_menu_assistant_message(text,text,text) to anon,authenticated;
grant execute on function private.public_menu_assistant_status(text) to anon,authenticated;

create function public.menu_assistant_admin_settings(target_barbershop_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.menu_assistant_admin_settings(target_barbershop_id)$$;
create function public.save_menu_assistant_settings(target_barbershop_id uuid,target_enabled boolean,target_monthly_limit integer default 1000,target_session_limit integer default 20) returns jsonb language sql security invoker set search_path='' as $$select private.save_menu_assistant_settings(target_barbershop_id,target_enabled,target_monthly_limit,target_session_limit)$$;
create function public.public_menu_assistant_message(target_slug text,session_token text,supplied_message text) returns jsonb language sql security invoker set search_path='' as $$select private.public_menu_assistant_message(target_slug,session_token,supplied_message)$$;
create function public.public_menu_assistant_status(target_slug text) returns jsonb language sql stable security invoker set search_path='' as $$select private.public_menu_assistant_status(target_slug)$$;
revoke all on function public.menu_assistant_admin_settings(uuid),public.save_menu_assistant_settings(uuid,boolean,integer,integer) from public,anon;
revoke all on function public.public_menu_assistant_message(text,text,text),public.public_menu_assistant_status(text) from public;
grant execute on function public.menu_assistant_admin_settings(uuid),public.save_menu_assistant_settings(uuid,boolean,integer,integer) to authenticated;
grant execute on function public.public_menu_assistant_message(text,text,text) to anon,authenticated;
grant execute on function public.public_menu_assistant_status(text) to anon,authenticated;
