-- Onboarding autônomo, retomável e publicável somente após validação objetiva.

alter table public.online_menus
  add column accepted_payment_methods text[] not null default array['pix','cash']::text[],
  add column weekly_hours jsonb not null default '{"weekdays":[1,2,3,4,5,6],"opens_at":"10:00","closes_at":"22:00"}'::jsonb,
  add column test_order_completed_at timestamptz,
  add column test_order_id uuid,
  add column settings_completed_at timestamptz,
  add column review_confirmed_at timestamptz,
  add column ready_at timestamptz,
  add constraint online_menus_payment_methods_check check(
    cardinality(accepted_payment_methods) between 1 and 4
    and accepted_payment_methods <@ array['pix','cash','credit_card','debit_card']::text[]
  ),
  add constraint online_menus_weekly_hours_check check(jsonb_typeof(weekly_hours)='object');

alter table public.menu_orders add column is_test boolean not null default false;
alter table public.online_menus add constraint online_menus_test_order_fk foreign key(test_order_id,barbershop_id)
  references public.menu_orders(id,barbershop_id) on delete set null(test_order_id);
create index online_menus_test_order_idx on public.online_menus(test_order_id,barbershop_id) where test_order_id is not null;
create index menu_orders_tenant_test_idx on public.menu_orders(barbershop_id,is_test,created_at desc);

create table public.menu_onboarding_events (
  id bigint generated always as identity primary key,
  barbershop_id uuid not null references public.barbershops(id) on delete restrict,
  menu_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check(event_type in ('settings_saved','test_order_completed','review_confirmed','published','unpublished')),
  details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object'),
  created_at timestamptz not null default now(),
  foreign key(menu_id,barbershop_id) references public.online_menus(id,barbershop_id) on delete cascade
);
create index menu_onboarding_events_tenant_menu_idx on public.menu_onboarding_events(barbershop_id,menu_id,created_at desc);
create index menu_onboarding_events_actor_idx on public.menu_onboarding_events(actor_user_id);

-- Somente RPCs autorizadas escrevem campos de aprovação e publicação.
revoke insert,update,delete on public.online_menus from public,anon,authenticated;
revoke all on public.menu_onboarding_events from public,anon,authenticated;

create function private.invalidate_menu_onboarding()
returns trigger language plpgsql security definer set search_path=''
as $$
declare tenant_id uuid; menu public.online_menus;
begin
  if TG_OP='UPDATE' and NEW.barbershop_id is distinct from OLD.barbershop_id then
    raise exception 'Não é permitido transferir dados entre empresas' using errcode='42501';
  end if;
  tenant_id:=case when TG_OP='DELETE' then OLD.barbershop_id else NEW.barbershop_id end;
  select * into menu from public.online_menus where barbershop_id=tenant_id for update;
  if menu.published then raise exception 'Despublique o cardápio antes de alterar o catálogo' using errcode='23514'; end if;
  update public.online_menus set test_order_id=null,test_order_completed_at=null,review_confirmed_at=null,ready_at=null,onboarding_step='catalog' where id=menu.id;
  if TG_OP='DELETE' then return OLD; else return NEW; end if;
end $$;
revoke all on function private.invalidate_menu_onboarding() from public,anon,authenticated;
do $$ declare target_table text; begin
  foreach target_table in array array['menu_categories','menu_items','menu_item_prices','menu_option_groups','menu_options','menu_item_option_groups','menu_delivery_zones','menu_availability_rules'] loop
    execute format('create trigger invalidate_menu_onboarding before insert or update or delete on public.%I for each row execute function private.invalidate_menu_onboarding()',target_table);
  end loop;
end $$;

create function private.menu_onboarding_snapshot(target_barbershop_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare menu public.online_menus; segment_ok boolean; identity_ok boolean; catalog_ok boolean; fulfillment_ok boolean; payments_ok boolean; hours_ok boolean; test_ok boolean; review_ok boolean; next_step text;
begin
  select * into menu from public.online_menus where barbershop_id=target_barbershop_id;
  if menu.id is null then return jsonb_build_object('exists',false,'next_step','segment','published',false); end if;
  segment_ok:=menu.template_code is not null;
  identity_ok:=menu.settings_completed_at is not null and coalesce(menu.visual_identity->>'primary_color','')~'^#[0-9A-Fa-f]{6}$' and coalesce(menu.visual_identity->>'accent_color','')~'^#[0-9A-Fa-f]{6}$';
  catalog_ok:=exists(select 1 from public.menu_categories c join public.menu_items i on i.category_id=c.id and i.active and i.available join public.menu_item_prices p on p.menu_item_id=i.id and p.active where c.menu_id=menu.id and c.active);
  fulfillment_ok:=(menu.accepts_pickup or menu.accepts_delivery) and (not menu.accepts_delivery or exists(select 1 from public.menu_delivery_zones z where z.menu_id=menu.id and z.active));
  payments_ok:=menu.settings_completed_at is not null and cardinality(menu.accepted_payment_methods)>0;
  hours_ok:=menu.settings_completed_at is not null and jsonb_typeof(menu.weekly_hours->'weekdays')='array' and jsonb_array_length(menu.weekly_hours->'weekdays')>0 and menu.weekly_hours ? 'opens_at' and menu.weekly_hours ? 'closes_at';
  test_ok:=menu.test_order_id is not null and menu.test_order_completed_at is not null;
  review_ok:=menu.review_confirmed_at is not null;
  next_step:=case when not segment_ok then 'segment' when not identity_ok then 'identity' when not catalog_ok then 'catalog' when not fulfillment_ok then 'fulfillment' when not payments_ok then 'payments' when not hours_ok then 'hours' when not test_ok then 'test_order' when not review_ok then 'review' else 'ready' end;
  return jsonb_build_object('exists',true,'menu_id',menu.id,'published',menu.published,'next_step',next_step,'completed_count',
    (segment_ok::int+identity_ok::int+catalog_ok::int+fulfillment_ok::int+payments_ok::int+hours_ok::int+test_ok::int+review_ok::int),
    'total_count',8,'checks',jsonb_build_object('segment',segment_ok,'identity',identity_ok,'catalog',catalog_ok,'fulfillment',fulfillment_ok,'payments',payments_ok,'hours',hours_ok,'test_order',test_ok,'review',review_ok));
end $$;

create function private.menu_onboarding_status(target_barbershop_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$ begin
  if (select auth.uid()) is null or not public.is_business_team(target_barbershop_id) or not private.business_has_product_access(target_barbershop_id,'menu') then raise exception 'Acesso negado' using errcode='42501'; end if;
  return private.menu_onboarding_snapshot(target_barbershop_id);
end $$;

create function private.save_menu_onboarding_settings(target_barbershop_id uuid,settings jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare menu public.online_menus; clean_slug text:=lower(trim(settings->>'slug')); clean_title text:=trim(settings->>'title'); clean_description text:=trim(coalesce(settings->>'description','')); methods text[]; weekdays integer[]; opens time; closes time; desired_delivery boolean; desired_pickup boolean; zone jsonb; minimum_value numeric; delivery_value numeric; snapshot jsonb;
begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id) or not private.business_has_product_access(target_barbershop_id,'menu') then raise exception 'Acesso negado' using errcode='42501'; end if;
  select * into menu from public.online_menus where barbershop_id=target_barbershop_id for update;
  if menu.id is null then raise exception 'Escolha primeiro um modelo de catálogo' using errcode='23514'; end if;
  if menu.published then raise exception 'Despublique o cardápio antes de alterar a configuração' using errcode='23514'; end if;
  if jsonb_typeof(settings) is distinct from 'object' or octet_length(settings::text)>12000
     or coalesce(clean_slug,'')!~'^[a-z0-9][a-z0-9-]{2,62}$' or length(coalesce(clean_title,'')) not between 2 and 120 or length(clean_description)>1000
     or jsonb_typeof(settings->'payment_methods') is distinct from 'array'
     or jsonb_typeof(settings->'weekdays') is distinct from 'array'
     or jsonb_typeof(settings->'minimum_order') is distinct from 'number'
     or jsonb_typeof(settings->'delivery_fee') is distinct from 'number'
     or jsonb_typeof(settings->'accepts_delivery') is distinct from 'boolean'
     or (settings ? 'accepts_pickup' and jsonb_typeof(settings->'accepts_pickup') is distinct from 'boolean')
     or coalesce(settings->>'opens_at','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or coalesce(settings->>'closes_at','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
     then raise exception 'Configuração inválida' using errcode='22023'; end if;
  begin
    minimum_value:=(settings->>'minimum_order')::numeric; delivery_value:=(settings->>'delivery_fee')::numeric; desired_delivery:=(settings->>'accepts_delivery')::boolean;
    desired_pickup:=coalesce((settings->>'accepts_pickup')::boolean,true);
    select array_agg(value order by value) into methods from jsonb_array_elements_text(settings->'payment_methods');
    select array_agg(value::integer order by value::integer) into weekdays from jsonb_array_elements_text(settings->'weekdays');
    opens:=(settings->>'opens_at')::time; closes:=(settings->>'closes_at')::time;
  exception when others then raise exception 'Configuração inválida' using errcode='22023'; end;
  if minimum_value<0 or minimum_value>1000000 or delivery_value<0 or delivery_value>100000
     or not (desired_pickup or desired_delivery)
     or coalesce(cardinality(methods),0) not between 1 and 4 or not methods<@array['pix','cash','credit_card','debit_card']::text[]
     or array_position(methods,null) is not null or (select count(distinct method) from unnest(methods) method)<>cardinality(methods)
     or coalesce(cardinality(weekdays),0) not between 1 and 7 or array_position(weekdays,null) is not null
     or exists(select 1 from unnest(weekdays) day where day not between 0 and 6)
     or (select count(distinct day) from unnest(weekdays) day)<>cardinality(weekdays) or opens>=closes then raise exception 'Configuração inválida' using errcode='22023'; end if;
  if coalesce(settings->'visual_identity'->>'primary_color','')!~'^#[0-9A-Fa-f]{6}$' or coalesce(settings->'visual_identity'->>'accent_color','')!~'^#[0-9A-Fa-f]{6}$' then raise exception 'Cores inválidas' using errcode='22023'; end if;
  zone:=settings->'delivery_zone';
  if desired_delivery and (jsonb_typeof(zone) is distinct from 'object'
     or coalesce(zone->>'code','')!~'^[a-z0-9][a-z0-9_-]{1,31}$'
     or length(trim(coalesce(zone->>'name',''))) not between 1 and 120
     or jsonb_typeof(zone->'fee') is distinct from 'number' or jsonb_typeof(zone->'minimum_order') is distinct from 'number')
     then raise exception 'Região de entrega inválida' using errcode='22023'; end if;
  if desired_delivery and ((zone->>'fee')::numeric not between 0 and 100000 or (zone->>'minimum_order')::numeric not between 0 and 1000000)
     then raise exception 'Região de entrega inválida' using errcode='22023'; end if;
  update public.online_menus set slug=clean_slug,title=clean_title,description=clean_description,minimum_order=minimum_value,delivery_fee=delivery_value,accepts_pickup=desired_pickup,accepts_delivery=desired_delivery,accepted_payment_methods=methods,weekly_hours=jsonb_build_object('weekdays',to_jsonb(weekdays),'opens_at',to_char(opens,'HH24:MI'),'closes_at',to_char(closes,'HH24:MI')),visual_identity=settings->'visual_identity',test_order_completed_at=null,review_confirmed_at=null,ready_at=null,onboarding_step='catalog' where id=menu.id;
  if desired_delivery then
    insert into public.menu_delivery_zones(barbershop_id,menu_id,code,name,fee,minimum_order,active)
    values(target_barbershop_id,menu.id,zone->>'code',trim(zone->>'name'),coalesce((zone->>'fee')::numeric,delivery_value),coalesce((zone->>'minimum_order')::numeric,minimum_value),true)
    on conflict(menu_id,code) do update set name=excluded.name,fee=excluded.fee,minimum_order=excluded.minimum_order,active=true,updated_at=now();
  end if;
  update public.online_menus set settings_completed_at=now(),test_order_id=null where id=menu.id;
  snapshot:=private.menu_onboarding_snapshot(target_barbershop_id);
  update public.online_menus set onboarding_step=snapshot->>'next_step' where id=menu.id;
  insert into public.menu_onboarding_events(barbershop_id,menu_id,actor_user_id,event_type,details) values(target_barbershop_id,menu.id,(select auth.uid()),'settings_saved',jsonb_build_object('next_step',snapshot->>'next_step'));
  return snapshot;
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Configuração inválida' using errcode='22023';
end $$;

create function private.run_menu_test_order(target_barbershop_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare
  menu public.online_menus; price public.menu_item_prices; item public.menu_items;
  order_row public.menu_orders; zone public.menu_delivery_zones; snapshot jsonb; response jsonb;
  selections jsonb:='[]'::jsonb; group_entry record; selected_option record; remaining integer; take_count integer;
  qty integer; max_qty integer; requested_at timestamptz; fulfillment text; order_address jsonb; failure_message text;
begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id) or not private.business_has_product_access(target_barbershop_id,'menu') then raise exception 'Acesso negado' using errcode='42501'; end if;
  select * into menu from public.online_menus where barbershop_id=target_barbershop_id for update;
  snapshot:=private.menu_onboarding_snapshot(target_barbershop_id);
  if menu.id is null or (snapshot->>'next_step') not in ('test_order','review','ready') then raise exception 'Conclua a configuração antes do pedido de teste' using errcode='23514'; end if;
  if menu.test_order_completed_at is not null and menu.test_order_id is not null then
    select * into order_row from public.menu_orders where id=menu.test_order_id and menu_id=menu.id and is_test;
    if order_row.id is not null then return jsonb_build_object('order_id',order_row.id,'reference',order_row.public_reference,'total_amount',order_row.total_amount,'next_step',snapshot->>'next_step'); end if;
  end if;
  select p.* into price from public.menu_item_prices p join public.menu_items i on i.id=p.menu_item_id join public.menu_categories c on c.id=i.category_id where c.menu_id=menu.id and c.active and i.active and i.available and p.active order by c.sort_order,i.sort_order,p.sort_order,p.id limit 1;
  select * into item from public.menu_items where id=price.menu_item_id;
  qty:=ceil(item.minimum_quantity)::integer; max_qty:=least(100,floor(coalesce(item.maximum_quantity,100))::integer);
  requested_at:=case when item.lead_time_hours>0 then now()+make_interval(hours=>item.lead_time_hours)+interval '1 minute' else null end;
  fulfillment:=case when menu.accepts_delivery then 'delivery' else 'pickup' end;
  if fulfillment='delivery' then
    select * into zone from public.menu_delivery_zones where menu_id=menu.id and active order by fee,id limit 1;
    order_address:=jsonb_build_object('text','Endereço fictício do pedido de teste','zone_code',zone.code);
  end if;
  for group_entry in select g.* from public.menu_item_option_groups link join public.menu_option_groups g on g.id=link.option_group_id where link.menu_item_id=item.id and g.active and g.minimum_selections>0 order by g.id loop
    remaining:=group_entry.minimum_selections;
    for selected_option in select o.* from public.menu_options o where o.option_group_id=group_entry.id and o.available order by o.price_delta,o.id loop
      exit when remaining=0;
      take_count:=least(remaining,selected_option.maximum_quantity);
      selections:=selections||jsonb_build_array(jsonb_build_object('menu_option_id',selected_option.id,'quantity',take_count));
      remaining:=remaining-take_count;
    end loop;
    if remaining>0 then raise exception 'Grupo obrigatório sem opções suficientes' using errcode='23514'; end if;
  end loop;
  -- Cada tentativa usa o mesmo validador do cliente; subtransações desfazem tentativas
  -- abaixo do mínimo antes de aumentar a quantidade, sempre respeitando o limite.
  while qty<=max_qty loop
    begin
      response:=private.create_menu_order_core(menu.slug,'Pedido de teste Ogritech','','00000000000',fulfillment,order_address,'Teste interno sem cobrança',
        jsonb_build_array(jsonb_build_object('menu_item_price_id',price.id,'quantity',qty,'selections',selections)),true,gen_random_uuid(),requested_at,'',true);
      exit;
    exception when sqlstate '22023' then
      get stacked diagnostics failure_message=MESSAGE_TEXT;
      if failure_message<>'Pedido abaixo do valor mínimo' then raise; end if;
      qty:=qty+1;
    end;
  end loop;
  if response is null then raise exception 'Não foi possível montar pedido de teste dentro dos limites do catálogo' using errcode='23514'; end if;
  update public.menu_orders set status='completed',completed_at=now(),payment_method=menu.accepted_payment_methods[1],public_token_hash=null
    where menu_id=menu.id and public_reference=response->>'reference' and is_test returning * into order_row;
  -- Testes não geram links públicos nem mantêm tokens de acompanhamento.
  delete from private.menu_order_idempotency where menu_id=menu.id and client_request_id=order_row.client_request_id;
  update public.online_menus set test_order_id=order_row.id,test_order_completed_at=now(),review_confirmed_at=null,ready_at=null,onboarding_step='review' where id=menu.id;
  insert into public.menu_onboarding_events(barbershop_id,menu_id,actor_user_id,event_type,details)
    values(target_barbershop_id,menu.id,(select auth.uid()),'test_order_completed',jsonb_build_object('order_id',order_row.id,'total_amount',order_row.total_amount));
  return jsonb_build_object('order_id',order_row.id,'reference',order_row.public_reference,'total_amount',order_row.total_amount,'next_step','review');
end $$;

create function private.confirm_menu_review(target_barbershop_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare menu public.online_menus; snapshot jsonb; begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id) or not private.business_has_product_access(target_barbershop_id,'menu') then raise exception 'Acesso negado' using errcode='42501'; end if;
  select * into menu from public.online_menus where barbershop_id=target_barbershop_id for update;
  if menu.test_order_completed_at is null then raise exception 'Faça o pedido de teste antes da revisão' using errcode='23514'; end if;
  snapshot:=private.menu_onboarding_snapshot(target_barbershop_id);
  if snapshot->>'next_step' not in ('review','ready') then raise exception 'Revise as pendências antes de confirmar' using errcode='23514'; end if;
  update public.online_menus set review_confirmed_at=now(),ready_at=now(),onboarding_step='ready' where id=menu.id;
  insert into public.menu_onboarding_events(barbershop_id,menu_id,actor_user_id,event_type) values(target_barbershop_id,menu.id,(select auth.uid()),'review_confirmed');
  return private.menu_onboarding_snapshot(target_barbershop_id);
end $$;

create function private.set_menu_publication(target_barbershop_id uuid,should_publish boolean)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare menu public.online_menus; snapshot jsonb; begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id) or not private.business_has_product_access(target_barbershop_id,'menu') then raise exception 'Acesso negado' using errcode='42501'; end if;
  select * into menu from public.online_menus where barbershop_id=target_barbershop_id for update;
  if menu.id is null then raise exception 'Cardápio não encontrado' using errcode='22023'; end if;
  if should_publish is null then raise exception 'Publicação inválida' using errcode='22023'; end if;
  if menu.published=should_publish then return private.menu_onboarding_snapshot(target_barbershop_id); end if;
  snapshot:=private.menu_onboarding_snapshot(target_barbershop_id);
  if should_publish and (snapshot->>'next_step')<>'ready' then raise exception 'Conclua todas as etapas antes de publicar' using errcode='23514'; end if;
  update public.online_menus set published=should_publish,published_at=case when should_publish then coalesce(published_at,now()) else null end where id=menu.id;
  insert into public.menu_onboarding_events(barbershop_id,menu_id,actor_user_id,event_type) values(target_barbershop_id,menu.id,(select auth.uid()),case when should_publish then 'published' else 'unpublished' end);
  return private.menu_onboarding_snapshot(target_barbershop_id);
end $$;

create function public.menu_onboarding_status(target_barbershop_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.menu_onboarding_status(target_barbershop_id) $$;
create function public.save_menu_onboarding_settings(target_barbershop_id uuid,settings jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.save_menu_onboarding_settings(target_barbershop_id,settings) $$;
create function public.run_menu_test_order(target_barbershop_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.run_menu_test_order(target_barbershop_id) $$;
create function public.confirm_menu_review(target_barbershop_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.confirm_menu_review(target_barbershop_id) $$;
create function public.set_menu_publication(target_barbershop_id uuid,should_publish boolean) returns jsonb language sql security invoker set search_path='' as $$ select private.set_menu_publication(target_barbershop_id,should_publish) $$;

revoke all on function private.menu_onboarding_snapshot(uuid),private.menu_onboarding_status(uuid),private.save_menu_onboarding_settings(uuid,jsonb),private.run_menu_test_order(uuid),private.confirm_menu_review(uuid),private.set_menu_publication(uuid,boolean) from public,anon,authenticated;
grant execute on function private.menu_onboarding_status(uuid),private.save_menu_onboarding_settings(uuid,jsonb),private.run_menu_test_order(uuid),private.confirm_menu_review(uuid),private.set_menu_publication(uuid,boolean) to authenticated;
revoke all on function public.menu_onboarding_status(uuid),public.save_menu_onboarding_settings(uuid,jsonb),public.run_menu_test_order(uuid),public.confirm_menu_review(uuid),public.set_menu_publication(uuid,boolean) from public,anon;
grant execute on function public.menu_onboarding_status(uuid),public.save_menu_onboarding_settings(uuid,jsonb),public.run_menu_test_order(uuid),public.confirm_menu_review(uuid),public.set_menu_publication(uuid,boolean) to authenticated;

alter table public.menu_onboarding_events enable row level security;
revoke all on table public.menu_onboarding_events from anon;
grant select on table public.menu_onboarding_events to authenticated;
create policy "Menu team views onboarding events" on public.menu_onboarding_events for select to authenticated using(public.is_business_team(barbershop_id) and private.business_has_product_access(barbershop_id,'menu'));

-- Motor compartilhado pelo checkout público e pelo pedido interno de teste.
create function private.create_menu_order_core(
  target_slug text,supplied_name text,supplied_email text,supplied_phone text,
  target_fulfillment_type text,supplied_address jsonb,supplied_notes text,supplied_items jsonb,
  accepted_privacy boolean,client_request_id uuid,requested_for timestamptz default null,website text default '', test_mode boolean default false
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,extensions
as $$
declare
  menu public.online_menus; result public.menu_orders; item jsonb; selection jsonb; selected_price public.menu_item_prices; selected_item public.menu_items;
  group_row public.menu_option_groups; option_row public.menu_options; order_item public.menu_order_items; zone public.menu_delivery_zones;
  clean_name text:=trim(supplied_name); clean_email text:=lower(trim(supplied_email)); clean_phone text:=regexp_replace(supplied_phone,'\D','','g'); fulfillment text:=lower(trim(target_fulfillment_type));
  running_subtotal numeric(12,2):=0; base_price numeric(12,2); option_total numeric(12,2); delivery_amount numeric(12,2):=0; required_minimum numeric(12,2); qty integer; selected_count integer; free_remaining integer; selection_qty integer; attempt_id bigint; secret_token text; response_payload jsonb; fingerprint text; prior record;
begin
  if coalesce(trim(website),'')<>'' or accepted_privacy is not true or client_request_id is null then raise exception 'Dados do pedido inválidos' using errcode='22023'; end if;
  if clean_name is null or clean_phone is null or supplied_items is null or length(clean_name) not between 2 and 150 or length(clean_phone) not between 10 and 15 or (clean_email<>'' and (length(clean_email)>320 or clean_email!~'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')) or jsonb_typeof(supplied_items)<>'array' or jsonb_array_length(supplied_items) not between 1 and 50 or length(coalesce(supplied_notes,''))>2000 then raise exception 'Dados do pedido inválidos' using errcode='22023'; end if;
  select m.* into menu from public.online_menus m join public.barbershops b on b.id=m.barbershop_id where lower(m.slug)=lower(trim(target_slug)) and (m.published or test_mode) and b.active and b.deleted_at is null and private.business_product_is_active(m.barbershop_id,'menu');
  if menu.id is null then raise exception 'Cardápio indisponível' using errcode='22023'; end if;
  if test_mode and ((select auth.uid()) is null or not public.is_business_manager(menu.barbershop_id) or not private.business_has_product_access(menu.barbershop_id,'menu')) then raise exception 'Acesso negado' using errcode='42501'; end if;
  fingerprint:=encode(digest(jsonb_build_object('test_mode',test_mode,'name',clean_name,'email',clean_email,'phone',clean_phone,'fulfillment',fulfillment,'address',supplied_address,'notes',supplied_notes,'items',supplied_items,'requested_for',requested_for)::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(menu.id::text||client_request_id::text,0));
  select request_hash,response into prior from private.menu_order_idempotency where menu_id=menu.id and private.menu_order_idempotency.client_request_id=create_menu_order_core.client_request_id and expires_at>now();
  if prior.request_hash is not null then if prior.request_hash<>fingerprint then raise exception 'Chave de repetição usada com dados diferentes' using errcode='23505'; end if; return prior.response; end if;
  if fulfillment is null or fulfillment not in ('pickup','delivery') or (fulfillment='pickup' and not menu.accepts_pickup) or (fulfillment='delivery' and (not menu.accepts_delivery or jsonb_typeof(supplied_address) is distinct from 'object')) then raise exception 'Forma de entrega inválida' using errcode='22023'; end if;
  if requested_for is not null and (requested_for<now() or requested_for>now()+interval '90 days') then raise exception 'Agendamento inválido' using errcode='22023'; end if;
  if fulfillment='delivery' and exists(select 1 from public.menu_delivery_zones z where z.menu_id=menu.id and z.active) then
    select * into zone from public.menu_delivery_zones z where z.menu_id=menu.id and z.active and z.code=supplied_address->>'zone_code';
    if zone.id is null then raise exception 'Área de entrega inválida' using errcode='22023'; end if; delivery_amount:=zone.fee;
  elsif fulfillment='delivery' then delivery_amount:=menu.delivery_fee; end if;
  required_minimum:=greatest(menu.minimum_order,coalesce(zone.minimum_order,0)); if not test_mode then attempt_id:=private.register_commercial_attempt(menu.barbershop_id,'order',clean_phone,10); end if; secret_token:=encode(gen_random_bytes(24),'hex');
  insert into public.menu_orders(barbershop_id,menu_id,customer_name,customer_email,customer_phone,fulfillment_type,delivery_address,notes,currency,delivery_fee,consent_at,public_token_hash,client_request_id,scheduled_for,delivery_zone_code,is_test)
  values(menu.barbershop_id,menu.id,clean_name,clean_email,clean_phone,fulfillment,case when fulfillment='delivery' then supplied_address else null end,trim(coalesce(supplied_notes,'')),menu.currency,delivery_amount,now(),encode(digest(secret_token,'sha256'),'hex'),client_request_id,requested_for,zone.code,test_mode) returning * into result;
  for item in select value from jsonb_array_elements(supplied_items) loop
    selected_price:=null; selected_item:=null;
    begin qty:=(item->>'quantity')::integer; exception when others then raise exception 'Quantidade inválida' using errcode='22023'; end;
    if qty is null or qty not between 1 and 100 or jsonb_typeof(coalesce(item->'selections','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(item->'selections','[]'::jsonb))>50 then raise exception 'Item inválido' using errcode='22023'; end if;
    select pr.* into selected_price from public.menu_item_prices pr join public.menu_items i on i.id=pr.menu_item_id join public.menu_categories c on c.id=i.category_id where pr.id=(item->>'menu_item_price_id')::uuid and pr.barbershop_id=menu.barbershop_id and pr.active and i.active and i.available and c.active and c.menu_id=menu.id;
    select i.* into selected_item from public.menu_items i join public.menu_categories c on c.id=i.category_id where i.id=selected_price.menu_item_id and c.menu_id=menu.id;
    if selected_price.id is null or qty<selected_item.minimum_quantity or (selected_item.maximum_quantity is not null and qty>selected_item.maximum_quantity) or (selected_item.lead_time_hours>0 and (requested_for is null or requested_for<now()+make_interval(hours=>selected_item.lead_time_hours))) then raise exception 'Item indisponível ou fora dos limites' using errcode='22023'; end if;
    if exists(
      select 1 from jsonb_array_elements(coalesce(item->'selections','[]'::jsonb)) as choices(choice)
      left join public.menu_options o on o.id=(choice->>'menu_option_id')::uuid
      left join public.menu_option_groups g on g.id=o.option_group_id
      left join public.menu_item_option_groups link on link.option_group_id=g.id and link.menu_item_id=selected_item.id
      where o.id is null or not o.available or g.id is null or not g.active or link.menu_item_id is null
        or choice->>'quantity' is null or (choice->>'quantity')::integer not between 1 and o.maximum_quantity
    ) then raise exception 'Seleção de adicional inválida' using errcode='22023'; end if;
    option_total:=0;
    for group_row in select g.* from public.menu_item_option_groups link join public.menu_option_groups g on g.id=link.option_group_id where link.menu_item_id=selected_item.id and g.active loop
      select coalesce(sum((choice->>'quantity')::integer),0) into selected_count from jsonb_array_elements(coalesce(item->'selections','[]'::jsonb)) as choices(choice) join public.menu_options o on o.id=(choice->>'menu_option_id')::uuid where o.option_group_id=group_row.id;
      if selected_count<group_row.minimum_selections or selected_count>group_row.maximum_selections then raise exception 'Seleções obrigatórias inválidas' using errcode='22023'; end if;
    end loop;
    insert into public.menu_order_items(barbershop_id,order_id,menu_item_id,menu_item_price_id,item_name,price_label,quantity,unit_price,notes)
    values(menu.barbershop_id,result.id,selected_item.id,selected_price.id,selected_item.name,selected_price.label,qty,coalesce(selected_price.promotional_price,selected_price.price),left(coalesce(item->>'notes',''),500)) returning * into order_item;
    for selection in select choice from jsonb_array_elements(coalesce(item->'selections','[]'::jsonb)) as choices(choice) join public.menu_options o on o.id=(choice->>'menu_option_id')::uuid join public.menu_option_groups g on g.id=o.option_group_id join public.menu_item_option_groups link on link.option_group_id=g.id and link.menu_item_id=selected_item.id where o.available and g.active order by g.id,o.price_delta,o.id loop
      select o.* into option_row from public.menu_options o where o.id=(selection->>'menu_option_id')::uuid;
      select g.* into group_row from public.menu_option_groups g where g.id=option_row.option_group_id;
      begin selection_qty:=(selection->>'quantity')::integer; exception when others then raise exception 'Quantidade de adicional inválida' using errcode='22023'; end;
      if selection_qty not between 1 and option_row.maximum_quantity then raise exception 'Quantidade de adicional inválida' using errcode='22023'; end if;
      select greatest(group_row.free_selections-(coalesce(sum(opt.quantity),0)/qty),0) into free_remaining from public.menu_order_item_options opt where opt.order_item_id=order_item.id and opt.group_name=group_row.name;
      free_remaining:=least(free_remaining,selection_qty);
      if free_remaining>0 then
        insert into public.menu_order_item_options(barbershop_id,order_item_id,menu_option_id,group_name,option_name,quantity,unit_price_delta)
        values(menu.barbershop_id,order_item.id,option_row.id,group_row.name,option_row.name,free_remaining*qty,0);
      end if;
      if selection_qty>free_remaining then
        insert into public.menu_order_item_options(barbershop_id,order_item_id,menu_option_id,group_name,option_name,quantity,unit_price_delta)
        values(menu.barbershop_id,order_item.id,option_row.id,group_row.name,option_row.name,(selection_qty-free_remaining)*qty,option_row.price_delta);
      end if;
      option_total:=option_total+option_row.price_delta*(selection_qty-free_remaining);
    end loop;
    base_price:=coalesce(selected_price.promotional_price,selected_price.price)+option_total;
    update public.menu_order_items set unit_price=base_price where id=order_item.id;
    running_subtotal:=running_subtotal+base_price*qty; if running_subtotal>1000000 then raise exception 'Valor do pedido inválido' using errcode='22023'; end if;
  end loop;
  if running_subtotal<required_minimum then raise exception 'Pedido abaixo do valor mínimo' using errcode='22023'; end if;
  update public.menu_orders set subtotal=running_subtotal where id=result.id returning * into result; update private.public_commercial_attempts set succeeded=true where id=attempt_id;
  response_payload:=jsonb_build_object('reference',result.public_reference,'token',secret_token,'status',result.status,'subtotal',result.subtotal,'delivery_fee',result.delivery_fee,'total_amount',result.total_amount,'scheduled_for',result.scheduled_for);
  insert into private.menu_order_idempotency(menu_id,client_request_id,request_hash,response) values(menu.id,client_request_id,fingerprint,response_payload); return response_payload;
exception when invalid_text_representation then raise exception 'Item inválido' using errcode='22023';
end $$;

revoke all on function private.create_menu_order_core(text,text,text,text,text,jsonb,text,jsonb,boolean,uuid,timestamptz,text,boolean) from public,anon,authenticated;

create or replace function private.public_create_menu_order_v2(
  target_slug text,supplied_name text,supplied_email text,supplied_phone text,
  target_fulfillment_type text,supplied_address jsonb,supplied_notes text,supplied_items jsonb,
  accepted_privacy boolean,client_request_id uuid,requested_for timestamptz default null,website text default ''
) returns jsonb language sql security definer set search_path=''
as $$ select private.create_menu_order_core(target_slug,supplied_name,supplied_email,supplied_phone,target_fulfillment_type,supplied_address,supplied_notes,supplied_items,accepted_privacy,client_request_id,requested_for,website,false) $$;

-- A API legada segue as mesmas regras; mantém compatibilidade de assinatura.
create or replace function private.public_create_menu_order(
  target_slug text,supplied_name text,supplied_email text,supplied_phone text,
  target_fulfillment_type text,supplied_address jsonb,supplied_notes text,
  supplied_items jsonb,accepted_privacy boolean,website text default ''
) returns jsonb language sql security definer set search_path=''
as $$ select private.create_menu_order_core(target_slug,supplied_name,supplied_email,supplied_phone,target_fulfillment_type,supplied_address,supplied_notes,supplied_items,accepted_privacy,gen_random_uuid(),null,website,false) $$;

create or replace function private.public_menu(target_slug text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,private
as $$
declare menu public.online_menus;
begin
  select m.* into menu from public.online_menus m join public.barbershops b on b.id=m.barbershop_id
  where lower(m.slug)=lower(trim(target_slug)) and m.published and b.active and b.deleted_at is null
    and private.business_product_is_active(m.barbershop_id,'menu');
  if menu.id is null then raise exception 'Cardápio indisponível' using errcode='22023'; end if;
  return jsonb_build_object(
    'menu',jsonb_build_object('slug',menu.slug,'title',menu.title,'description',menu.description,'currency',menu.currency,
      'accepts_pickup',menu.accepts_pickup,'accepts_delivery',menu.accepts_delivery,'minimum_order',menu.minimum_order,
      'delivery_fee',menu.delivery_fee,'estimated_minutes',menu.estimated_minutes,'visual_identity',menu.visual_identity,'payment_methods',menu.accepted_payment_methods,'weekly_hours',menu.weekly_hours),
    'delivery_zones',coalesce((select jsonb_agg(jsonb_build_object('code',z.code,'name',z.name,'fee',z.fee,'minimum_order',z.minimum_order,'estimated_minutes',z.estimated_minutes) order by z.name) from public.menu_delivery_zones z where z.menu_id=menu.id and z.active),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'description',c.description,
      'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'description',i.description,'image_url',i.image_url,
        'item_type',i.item_type,'unit_label',i.unit_label,'minimum_quantity',i.minimum_quantity,'maximum_quantity',i.maximum_quantity,'lead_time_hours',i.lead_time_hours,'metadata',i.metadata,
        'prices',coalesce((select jsonb_agg(jsonb_build_object('id',pr.id,'label',pr.label,'price',pr.price,'promotional_price',pr.promotional_price) order by pr.sort_order) from public.menu_item_prices pr where pr.menu_item_id=i.id and pr.active),'[]'::jsonb),
        'option_groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'selection_type',g.selection_type,'minimum_selections',g.minimum_selections,'maximum_selections',g.maximum_selections,'free_selections',g.free_selections,
          'options',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'price_delta',o.price_delta,'maximum_quantity',o.maximum_quantity) order by o.sort_order) from public.menu_options o where o.option_group_id=g.id and o.available),'[]'::jsonb)) order by link.sort_order)
          from public.menu_item_option_groups link join public.menu_option_groups g on g.id=link.option_group_id where link.menu_item_id=i.id and g.active),'[]'::jsonb)
      ) order by i.sort_order) from public.menu_items i where i.category_id=c.id and i.active and i.available),'[]'::jsonb)) order by c.sort_order)
      from public.menu_categories c where c.menu_id=menu.id and c.active),'[]'::jsonb)
  );
end $$;
