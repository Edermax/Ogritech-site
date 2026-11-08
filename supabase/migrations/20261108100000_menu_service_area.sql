alter table public.online_menus
  add column pickup_location text not null default '' check (char_length(pickup_location) <= 300),
  add column delivery_postcodes text[] not null default '{}'
    check (cardinality(delivery_postcodes) <= 50);

create function private.save_menu_service_area(target_barbershop_id uuid, target_pickup_location text, target_delivery_postcodes text[])
returns void language plpgsql security definer set search_path = ''
as $$
declare
  location text := btrim(coalesce(target_pickup_location,''));
  postcodes text[] := coalesce(target_delivery_postcodes,'{}');
begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id)
     or not private.business_has_product_access(target_barbershop_id,'menu') then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  if char_length(location) > 300 or cardinality(postcodes) > 50 or exists (
    select 1 from unnest(postcodes) as range(value)
    where value is null or value !~ '^[0-9]{8}-[0-9]{8}$' or left(value,8) > right(value,8)
  ) then
    raise exception 'Informe faixas de CEP válidas, com oito dígitos em cada extremo' using errcode='22023';
  end if;
  update public.online_menus set pickup_location=location, delivery_postcodes=postcodes
  where barbershop_id=target_barbershop_id;
  if not found then raise exception 'Cardápio indisponível' using errcode='22023'; end if;
end $$;

create function public.save_menu_service_area(target_barbershop_id uuid, target_pickup_location text, target_delivery_postcodes text[])
returns void language sql security invoker set search_path = ''
as $$ select private.save_menu_service_area(target_barbershop_id,target_pickup_location,target_delivery_postcodes) $$;

revoke all on function private.save_menu_service_area(uuid,text,text[]), public.save_menu_service_area(uuid,text,text[]) from public, anon;
grant execute on function private.save_menu_service_area(uuid,text,text[]), public.save_menu_service_area(uuid,text,text[]) to authenticated;

create function private.enforce_menu_delivery_postcode()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  postcodes text[];
  postcode text := new.delivery_address->>'cep';
begin
  if new.fulfillment_type <> 'delivery' or new.is_test then return new; end if;
  select delivery_postcodes into postcodes from public.online_menus where id=new.menu_id;
  if cardinality(postcodes) > 0 and (
    postcode is null or postcode !~ '^[0-9]{8}$' or not exists (
      select 1 from unnest(postcodes) as range(value)
      where postcode between left(value,8) and right(value,8)
    )
  ) then
    raise exception 'Ainda não entregamos neste CEP' using errcode='22023';
  end if;
  return new;
end $$;

revoke all on function private.enforce_menu_delivery_postcode() from public, anon, authenticated;

create trigger enforce_menu_delivery_postcode before insert on public.menu_orders
for each row execute function private.enforce_menu_delivery_postcode();

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
      'payment_methods',menu.accepted_payment_methods,'weekly_hours',menu.weekly_hours,'whatsapp_phone',menu.whatsapp_phone,
      'pickup_location',menu.pickup_location,'delivery_postcodes',menu.delivery_postcodes,
      'pix_amount_city',case when 'pix'=any(menu.accepted_payment_methods) and menu.pix_key<>'' then nullif(menu.pix_amount_city,'') end,
      'pix_key',case when 'pix'=any(menu.accepted_payment_methods) then nullif(menu.pix_key,'') end),
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

