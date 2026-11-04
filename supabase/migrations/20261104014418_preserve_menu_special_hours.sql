-- Preserve server-maintained special hours and metadata when saving general hours.
-- The existing row lock keeps concurrent saves consistent. Only validated general
-- fields come from the request, including requests made by older clients.

create or replace function private.save_menu_onboarding_settings(target_barbershop_id uuid,settings jsonb)
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
  update public.online_menus set slug=clean_slug,title=clean_title,description=clean_description,minimum_order=minimum_value,delivery_fee=delivery_value,accepts_pickup=desired_pickup,accepts_delivery=desired_delivery,accepted_payment_methods=methods,weekly_hours=coalesce(menu.weekly_hours,'{}'::jsonb) || jsonb_build_object('weekdays',to_jsonb(weekdays),'opens_at',to_char(opens,'HH24:MI'),'closes_at',to_char(closes,'HH24:MI')),visual_identity=settings->'visual_identity',test_order_completed_at=null,review_confirmed_at=null,ready_at=null,onboarding_step='catalog' where id=menu.id;
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
