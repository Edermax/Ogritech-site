-- Ordenacao atomica do catalogo e administracao completa das regioes de entrega.

create function private.reorder_menu_catalog(target_barbershop_id uuid,category_ids jsonb,item_ids jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare menu public.online_menus; entry jsonb; position integer:=0; target_id uuid; begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id) or not private.business_has_product_access(target_barbershop_id,'menu') then raise exception 'Acesso negado' using errcode='42501'; end if;
  select * into menu from public.online_menus where barbershop_id=target_barbershop_id for update;
  if menu.id is null or menu.published then raise exception 'Despublique o cardapio antes de ordenar o catalogo' using errcode='23514'; end if;
  if jsonb_typeof(category_ids) is distinct from 'array' or jsonb_array_length(category_ids)>200 or jsonb_typeof(item_ids) is distinct from 'array' or jsonb_array_length(item_ids)>2000 then raise exception 'Ordenacao invalida' using errcode='22023'; end if;
  for entry in select value from jsonb_array_elements(category_ids) loop position:=position+1; target_id:=trim(both '"' from entry::text)::uuid;
    update public.menu_categories set sort_order=position*10 where id=target_id and menu_id=menu.id;
    if not found then raise exception 'Categoria invalida' using errcode='22023'; end if;
  end loop;
  position:=0;
  for entry in select value from jsonb_array_elements(item_ids) loop position:=position+1; target_id:=trim(both '"' from entry::text)::uuid;
    update public.menu_items i set sort_order=position*10 from public.menu_categories c where i.id=target_id and i.category_id=c.id and c.menu_id=menu.id;
    if not found then raise exception 'Produto invalido' using errcode='22023'; end if;
  end loop;
  return jsonb_build_object('reordered',true);
exception when invalid_text_representation then raise exception 'Ordenacao invalida' using errcode='22023'; end $$;
create function public.reorder_menu_catalog(target_barbershop_id uuid,category_ids jsonb,item_ids jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.reorder_menu_catalog(target_barbershop_id,category_ids,item_ids) $$;
revoke all on function private.reorder_menu_catalog(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function private.reorder_menu_catalog(uuid,jsonb,jsonb) to authenticated;
revoke all on function public.reorder_menu_catalog(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.reorder_menu_catalog(uuid,jsonb,jsonb) to authenticated;

create function private.save_menu_delivery_zones(target_barbershop_id uuid,zones jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare menu public.online_menus; zone jsonb; seen_codes text[]:=array[]::text[]; clean_code text; clean_name text; fee_value numeric; minimum_value numeric; position integer:=0; begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id) or not private.business_has_product_access(target_barbershop_id,'menu') then raise exception 'Acesso negado' using errcode='42501'; end if;
  select * into menu from public.online_menus where barbershop_id=target_barbershop_id for update;
  if menu.id is null or menu.published then raise exception 'Despublique o cardapio antes de alterar as regioes' using errcode='23514'; end if;
  if jsonb_typeof(zones) is distinct from 'array' or jsonb_array_length(zones)>50 or (menu.accepts_delivery and jsonb_array_length(zones)=0) then raise exception 'Regioes de entrega invalidas' using errcode='22023'; end if;
  update public.menu_delivery_zones set active=false where menu_id=menu.id;
  for zone in select value from jsonb_array_elements(zones) loop
    position:=position+1; clean_code:=lower(trim(coalesce(zone->>'code',''))); clean_name:=trim(coalesce(zone->>'name',''));
    begin fee_value:=(zone->>'fee')::numeric; minimum_value:=(zone->>'minimum_order')::numeric; exception when others then raise exception 'Regiao de entrega invalida' using errcode='22023'; end;
    if clean_code!~'^[a-z0-9][a-z0-9_-]{1,31}$' or length(clean_name) not between 1 and 120 or fee_value not between 0 and 100000 or minimum_value not between 0 and 1000000 or clean_code=any(seen_codes) then raise exception 'Regiao de entrega invalida' using errcode='22023'; end if;
    seen_codes:=array_append(seen_codes,clean_code);
    insert into public.menu_delivery_zones(barbershop_id,menu_id,code,name,fee,minimum_order,active)
    values(target_barbershop_id,menu.id,clean_code,clean_name,fee_value,minimum_value,true)
    on conflict(menu_id,code) do update set name=excluded.name,fee=excluded.fee,minimum_order=excluded.minimum_order,active=true,updated_at=now();
  end loop;
  return jsonb_build_object('saved',true,'count',position);
end $$;
create function public.save_menu_delivery_zones(target_barbershop_id uuid,zones jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.save_menu_delivery_zones(target_barbershop_id,zones) $$;
revoke all on function private.save_menu_delivery_zones(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.save_menu_delivery_zones(uuid,jsonb) to authenticated;
revoke all on function public.save_menu_delivery_zones(uuid,jsonb) from public,anon;
grant execute on function public.save_menu_delivery_zones(uuid,jsonb) to authenticated;
