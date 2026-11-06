-- Contact and order actions belong to each menu, never to a hard-coded slug.
alter table public.online_menus add column whatsapp_phone text not null default ''
  constraint online_menus_whatsapp_phone_valid check (whatsapp_phone = '' or whatsapp_phone ~ '^[1-9][0-9]{9,14}$');

update public.online_menus set whatsapp_phone = '5516991596865'
where slug in ('diniz-doces', 'diniz-doces-previa-7d1');

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
      'delivery_fee',menu.delivery_fee,'estimated_minutes',menu.estimated_minutes,'visual_identity',menu.visual_identity,
      'payment_methods',menu.accepted_payment_methods,'weekly_hours',menu.weekly_hours,'whatsapp_phone',menu.whatsapp_phone),
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

create or replace function private.public_get_menu_order(target_reference text,target_token text)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public, private, extensions
as $$
  select jsonb_build_object('reference',o.public_reference,'customer_name',o.customer_name,
    'fulfillment_type',o.fulfillment_type,'status',o.status,'payment_status',o.payment_status,
    'currency',o.currency,'subtotal',o.subtotal,'delivery_fee',o.delivery_fee,
    'discount_amount',o.discount_amount,'total_amount',o.total_amount,'created_at',o.created_at,
    'menu_title',m.title,'whatsapp_phone',m.whatsapp_phone,
    'items',coalesce((select jsonb_agg(jsonb_build_object('name',i.item_name,'label',i.price_label,
      'quantity',i.quantity,'unit_price',i.unit_price,'line_total',i.line_total) order by i.created_at)
      from public.menu_order_items i where i.order_id=o.id),'[]'::jsonb))
  from public.menu_orders o join public.online_menus m on m.id=o.menu_id
  where o.public_reference=upper(trim(target_reference))
    and o.public_token_hash=encode(digest(target_token,'sha256'),'hex')
$$;

create function private.save_menu_contact(target_barbershop_id uuid,target_whatsapp_phone text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare clean_phone text := regexp_replace(coalesce(target_whatsapp_phone,''),'[^0-9]','','g'); changed public.online_menus;
begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id)
     or not private.business_has_product_access(target_barbershop_id,'menu') then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  if clean_phone <> '' and clean_phone !~ '^[1-9][0-9]{9,14}$' then
    raise exception 'Informe o WhatsApp com DDI e DDD' using errcode='22023';
  end if;
  update public.online_menus set whatsapp_phone=clean_phone where barbershop_id=target_barbershop_id returning * into changed;
  if changed.id is null then raise exception 'Cardápio indisponível' using errcode='22023'; end if;
  return jsonb_build_object('whatsapp_phone',changed.whatsapp_phone);
end $$;

create function public.save_menu_contact(target_barbershop_id uuid,target_whatsapp_phone text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.save_menu_contact(target_barbershop_id,target_whatsapp_phone) $$;
revoke all on function private.save_menu_contact(uuid,text) from public,anon,authenticated;
grant execute on function private.save_menu_contact(uuid,text) to authenticated;
revoke all on function public.save_menu_contact(uuid,text) from public,anon;
grant execute on function public.save_menu_contact(uuid,text) to authenticated;

create function private.update_menu_order_operation(target_barbershop_id uuid,target_order_id uuid,target_action text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare current_order public.menu_orders; changed public.menu_orders;
begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id)
     or not private.business_has_product_access(target_barbershop_id,'menu') then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  select * into current_order from public.menu_orders
    where id=target_order_id and barbershop_id=target_barbershop_id for update;
  if current_order.id is null or current_order.is_test then
    raise exception 'Pedido indisponível' using errcode='22023';
  end if;
  if target_action='confirm' and current_order.status='received' then
    update public.menu_orders set status='confirmed',confirmed_at=now() where id=current_order.id returning * into changed;
  elsif target_action='reject' and current_order.status='received' then
    update public.menu_orders set status='rejected',cancelled_at=now() where id=current_order.id returning * into changed;
  elsif target_action='complete' and current_order.status='confirmed' then
    update public.menu_orders set status='completed',completed_at=now() where id=current_order.id returning * into changed;
  elsif target_action='mark_paid' and current_order.payment_status='pending' and current_order.status not in ('rejected','cancelled') then
    update public.menu_orders set payment_status='paid' where id=current_order.id returning * into changed;
  else
    raise exception 'Transição de pedido inválida' using errcode='22023';
  end if;
  return jsonb_build_object('id',changed.id,'status',changed.status,'payment_status',changed.payment_status);
end $$;

create function public.update_menu_order_operation(target_barbershop_id uuid,target_order_id uuid,target_action text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.update_menu_order_operation(target_barbershop_id,target_order_id,target_action) $$;
revoke all on function private.update_menu_order_operation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.update_menu_order_operation(uuid,uuid,text) to authenticated;
revoke all on function public.update_menu_order_operation(uuid,uuid,text) from public,anon;
grant execute on function public.update_menu_order_operation(uuid,uuid,text) to authenticated;

-- Atomic updates keep the published menu available while operational settings change.
create function private.save_published_menu_settings(target_barbershop_id uuid,settings jsonb,zones jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare menu public.online_menus; clean_title text; clean_description text; methods text[]; weekdays integer[];
  opens time; closes time; desired_delivery boolean; desired_pickup boolean; minimum_value numeric; delivery_value numeric;
  zone jsonb; clean_code text; clean_name text; fee_value numeric; zone_minimum numeric; seen_codes text[]:=array[]::text[];
begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id)
     or not private.business_has_product_access(target_barbershop_id,'menu') then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  select * into menu from public.online_menus where barbershop_id=target_barbershop_id for update;
  if menu.id is null or not menu.published then raise exception 'Cardápio publicado indisponível' using errcode='23514'; end if;
  if jsonb_typeof(settings) is distinct from 'object' or octet_length(settings::text)>12000
     or jsonb_typeof(zones) is distinct from 'array' or jsonb_array_length(zones)>50
     or settings->>'slug' is distinct from menu.slug
     or jsonb_typeof(settings->'payment_methods') is distinct from 'array'
     or jsonb_typeof(settings->'weekdays') is distinct from 'array'
     or jsonb_typeof(settings->'minimum_order') is distinct from 'number'
     or jsonb_typeof(settings->'delivery_fee') is distinct from 'number'
     or jsonb_typeof(settings->'accepts_delivery') is distinct from 'boolean'
     or jsonb_typeof(settings->'accepts_pickup') is distinct from 'boolean'
     or coalesce(settings->>'opens_at','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or coalesce(settings->>'closes_at','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
     then raise exception 'Configuração inválida' using errcode='22023'; end if;
  clean_title:=trim(coalesce(settings->>'title',''));
  clean_description:=trim(coalesce(settings->>'description',''));
  if length(clean_title) not between 2 and 120 or length(clean_description)>1000 then
    raise exception 'Nome ou descrição inválidos' using errcode='22023'; end if;
  begin
    minimum_value:=(settings->>'minimum_order')::numeric; delivery_value:=(settings->>'delivery_fee')::numeric;
    desired_delivery:=(settings->>'accepts_delivery')::boolean; desired_pickup:=(settings->>'accepts_pickup')::boolean;
    select array_agg(value order by value) into methods from jsonb_array_elements_text(settings->'payment_methods');
    select array_agg(value::integer order by value::integer) into weekdays from jsonb_array_elements_text(settings->'weekdays');
    opens:=(settings->>'opens_at')::time; closes:=(settings->>'closes_at')::time;
  exception when others then raise exception 'Configuração inválida' using errcode='22023'; end;
  if minimum_value not between 0 and 1000000 or delivery_value not between 0 and 100000
     or not (desired_delivery or desired_pickup)
     or coalesce(cardinality(methods),0) not between 1 and 4 or not methods<@array['pix','cash','credit_card','debit_card']::text[]
     or array_position(methods,null) is not null or (select count(distinct method) from unnest(methods) method)<>cardinality(methods)
     or coalesce(cardinality(weekdays),0) not between 1 and 7 or array_position(weekdays,null) is not null
     or exists(select 1 from unnest(weekdays) day where day not between 0 and 6)
     or (select count(distinct day) from unnest(weekdays) day)<>cardinality(weekdays) or opens>=closes
     or (desired_delivery and jsonb_array_length(zones)=0) then
    raise exception 'Configuração inválida' using errcode='22023'; end if;
  for zone in select value from jsonb_array_elements(zones) loop
    clean_code:=lower(trim(coalesce(zone->>'code',''))); clean_name:=trim(coalesce(zone->>'name',''));
    begin fee_value:=(zone->>'fee')::numeric; zone_minimum:=(zone->>'minimum_order')::numeric;
    exception when others then raise exception 'Região inválida' using errcode='22023'; end;
    if clean_code!~'^[a-z0-9][a-z0-9_-]{1,31}$' or length(clean_name) not between 1 and 120
       or fee_value not between 0 and 100000 or zone_minimum not between 0 and 1000000
       or clean_code=any(seen_codes) then raise exception 'Região inválida' using errcode='22023'; end if;
    seen_codes:=array_append(seen_codes,clean_code);
  end loop;
  update public.online_menus set title=clean_title,description=clean_description,minimum_order=minimum_value,
    delivery_fee=delivery_value,accepts_pickup=desired_pickup,accepts_delivery=desired_delivery,
    accepted_payment_methods=methods,
    weekly_hours=coalesce(menu.weekly_hours,'{}'::jsonb)||jsonb_build_object('weekdays',to_jsonb(weekdays),'opens_at',to_char(opens,'HH24:MI'),'closes_at',to_char(closes,'HH24:MI'))
    where id=menu.id;
  update public.menu_delivery_zones set active=false where menu_id=menu.id;
  if desired_delivery then
    for zone in select value from jsonb_array_elements(zones) loop
      insert into public.menu_delivery_zones(barbershop_id,menu_id,code,name,fee,minimum_order,active)
      values(target_barbershop_id,menu.id,lower(trim(zone->>'code')),trim(zone->>'name'),(zone->>'fee')::numeric,(zone->>'minimum_order')::numeric,true)
      on conflict(menu_id,code) do update set name=excluded.name,fee=excluded.fee,
        minimum_order=excluded.minimum_order,active=true,updated_at=now();
    end loop;
  end if;
  return jsonb_build_object('saved',true,'published',true,'zone_count',case when desired_delivery then jsonb_array_length(zones) else 0 end);
end $$;

create function public.save_published_menu_settings(target_barbershop_id uuid,settings jsonb,zones jsonb)
returns jsonb language sql security invoker set search_path=''
as $$ select private.save_published_menu_settings(target_barbershop_id,settings,zones) $$;
revoke all on function private.save_published_menu_settings(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function private.save_published_menu_settings(uuid,jsonb,jsonb) to authenticated;
revoke all on function public.save_published_menu_settings(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_published_menu_settings(uuid,jsonb,jsonb) to authenticated;
