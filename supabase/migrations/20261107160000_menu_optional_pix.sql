alter table public.online_menus
  add column pix_key text not null default ''
  constraint online_menus_pix_key_valid check (char_length(pix_key) <= 77 and pix_key !~ '[[:space:][:cntrl:]]');

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

create function private.save_menu_pix(target_barbershop_id uuid, target_pix_key text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  clean_key text := btrim(coalesce(target_pix_key,''));
begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id)
     or not private.business_has_product_access(target_barbershop_id,'menu') then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  if char_length(clean_key) > 77 or clean_key ~ '[[:space:][:cntrl:]]' then
    raise exception 'Informe uma chave Pix sem espaços' using errcode='22023';
  end if;
  update public.online_menus set pix_key=clean_key where barbershop_id=target_barbershop_id;
  if not found then raise exception 'Cardápio indisponível' using errcode='22023'; end if;
end $$;

create function public.save_menu_pix(target_barbershop_id uuid, target_pix_key text)
returns void language sql security invoker set search_path = ''
as $$ select private.save_menu_pix(target_barbershop_id,target_pix_key) $$;

revoke all on function private.save_menu_pix(uuid,text), public.save_menu_pix(uuid,text) from public, anon;
grant execute on function private.save_menu_pix(uuid,text), public.save_menu_pix(uuid,text) to authenticated;
