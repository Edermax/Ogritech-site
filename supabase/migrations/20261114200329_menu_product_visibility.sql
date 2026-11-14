-- Visibility is an operational action: update the live item and any saved draft
-- atomically, without publishing unrelated edits or removing product data.
create or replace function private.set_menu_item_visibility(target_barbershop_id uuid,target_item_id uuid,target_visible boolean)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  menu public.online_menus;
  draft private.menu_catalog_drafts;
  live_item public.menu_items;
  categories jsonb; category jsonb; items jsonb; item jsonb;
  draft_found boolean:=false;
begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id)
    or not private.business_has_product_access(target_barbershop_id,'menu') then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  if target_item_id is null or target_visible is null then
    raise exception 'Visibilidade invalida' using errcode='22023';
  end if;
  select * into menu from public.online_menus where barbershop_id=target_barbershop_id for update;
  if menu.id is null then raise exception 'Cardapio nao encontrado' using errcode='22023'; end if;
  select * into draft from private.menu_catalog_drafts where barbershop_id=target_barbershop_id and menu_id=menu.id for update;
  select i.* into live_item from public.menu_items i join public.menu_categories c on c.id=i.category_id
    where i.id=target_item_id and i.barbershop_id=target_barbershop_id and c.menu_id=menu.id for update of i;
  categories:='[]'::jsonb;
  if draft.menu_id is not null then
    for category in select value from jsonb_array_elements(draft.payload->'categories') loop
      items:='[]'::jsonb;
      for item in select value from jsonb_array_elements(category->'menu_items') loop
        if item->>'id'=target_item_id::text then
          draft_found:=true;
          item:=item||jsonb_build_object('active',target_visible,'available',target_visible);
        end if;
        items:=items||jsonb_build_array(item);
      end loop;
      categories:=categories||jsonb_build_array(jsonb_set(category,'{menu_items}',items));
    end loop;
  end if;
  if live_item.id is null and not draft_found then
    raise exception 'Produto nao encontrado' using errcode='22023';
  end if;
  if live_item.id is not null then
    update public.menu_items set active=target_visible,available=target_visible where id=live_item.id;
  end if;
  if draft_found then
    update private.menu_catalog_drafts set payload=jsonb_set(draft.payload,'{categories}',categories),
      version=version+1,updated_at=now() where barbershop_id=target_barbershop_id;
  end if;
  return jsonb_build_object('id',target_item_id,'visible',target_visible,
    'published_changed',menu.published and live_item.id is not null,'draft_changed',draft_found);
end $$;

create or replace function public.set_menu_item_visibility(target_barbershop_id uuid,target_item_id uuid,target_visible boolean)
returns jsonb language sql security invoker set search_path=''
as $$ select private.set_menu_item_visibility(target_barbershop_id,target_item_id,target_visible) $$;
revoke all on function private.set_menu_item_visibility(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function private.set_menu_item_visibility(uuid,uuid,boolean) to authenticated;
revoke all on function public.set_menu_item_visibility(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_menu_item_visibility(uuid,uuid,boolean) to authenticated;

-- Draft publication creates new rows; honor hidden state during insertion too.
create or replace function private.save_menu_catalog_item(target_barbershop_id uuid,payload jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  menu public.online_menus; category public.menu_categories; item public.menu_items;
  price_entry jsonb; group_entry jsonb; option_entry jsonb; group_row public.menu_option_groups;
  target_item_id uuid; target_category_id uuid; clean_name text; clean_description text; clean_category text;
  clean_image text; clean_type text; clean_unit text; minimum_value numeric; maximum_value numeric; lead_hours integer;
  position integer:=0; option_position integer; allowed_prefix text; metadata_patch jsonb;
begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id)
     or not private.business_has_product_access(target_barbershop_id,'menu') then raise exception 'Acesso negado' using errcode='42501'; end if;
  if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>100000 then raise exception 'Produto invalido' using errcode='22023'; end if;
  select * into menu from public.online_menus where barbershop_id=target_barbershop_id for update;
  if menu.id is null then raise exception 'Escolha primeiro um modelo de catalogo' using errcode='23514'; end if;
  if menu.published then raise exception 'Despublique o cardapio antes de alterar o catalogo' using errcode='23514'; end if;
  begin
    target_item_id:=nullif(payload->>'id','')::uuid; target_category_id:=nullif(payload->>'category_id','')::uuid;
    minimum_value:=coalesce((payload->>'minimum_quantity')::numeric,1);
    maximum_value:=nullif(payload->>'maximum_quantity','')::numeric;
    lead_hours:=coalesce((payload->>'lead_time_hours')::integer,0);
  exception when others then raise exception 'Produto invalido' using errcode='22023'; end;
  clean_name:=trim(coalesce(payload->>'name','')); clean_description:=trim(coalesce(payload->>'description',''));
  clean_category:=trim(coalesce(payload->>'category_name','')); clean_image:=nullif(trim(coalesce(payload->>'image_url','')),'');
  clean_type:=coalesce(payload->>'item_type','simple'); clean_unit:=trim(coalesce(payload->>'unit_label','unidade'));
  if length(clean_name) not between 2 and 160 or length(clean_description)>1000 or length(clean_category) not between 1 and 100
     or clean_type not in ('simple','configurable','fractional','weight','quantity','preorder','combo')
     or length(clean_unit) not between 1 and 30 or minimum_value<=0 or (maximum_value is not null and maximum_value<minimum_value)
     or lead_hours not between 0 and 8760 or jsonb_typeof(payload->'prices') is distinct from 'array'
     or jsonb_array_length(payload->'prices') not between 1 and 20 or jsonb_typeof(coalesce(payload->'option_groups','[]'::jsonb)) is distinct from 'array'
     or jsonb_array_length(coalesce(payload->'option_groups','[]'::jsonb))>20 then raise exception 'Produto invalido' using errcode='22023'; end if;
  metadata_patch:=coalesce(payload->'metadata','{}'::jsonb);
  if jsonb_typeof(metadata_patch) is distinct from 'object'
     or (metadata_patch ? 'order_mode' and (jsonb_typeof(metadata_patch->'order_mode') is distinct from 'string' or metadata_patch->>'order_mode' not in ('direct','quote')))
     or (metadata_patch ? 'configuration_required' and jsonb_typeof(metadata_patch->'configuration_required') is distinct from 'boolean')
     then raise exception 'Metadados do produto invalidos' using errcode='22023'; end if;
  -- Only these non-auth fields are writable. Existing server-owned fields survive updates.
  select coalesce(jsonb_object_agg(entry.key,entry.value),'{}'::jsonb) into metadata_patch
  from jsonb_each(metadata_patch) entry where entry.key in ('order_mode','configuration_required');
  allowed_prefix:='/storage/v1/object/public/menu-images/'||target_barbershop_id::text||'/';
  if clean_image is not null and (position(allowed_prefix in clean_image)=0 or clean_image!~'^https://') then raise exception 'Imagem invalida' using errcode='22023'; end if;
  if target_category_id is not null then
    select * into category from public.menu_categories where id=target_category_id and menu_id=menu.id;
    if category.id is null then raise exception 'Categoria invalida' using errcode='22023'; end if;
    if category.name<>clean_category then update public.menu_categories set name=clean_category where id=category.id returning * into category; end if;
  else
    select * into category from public.menu_categories where menu_id=menu.id and lower(name)=lower(clean_category) limit 1;
    if category.id is null then insert into public.menu_categories(barbershop_id,menu_id,name,sort_order)
      values(target_barbershop_id,menu.id,clean_category,coalesce((select max(sort_order)+10 from public.menu_categories where menu_id=menu.id),10)) returning * into category; end if;
  end if;
  if target_item_id is null then
    insert into public.menu_items(barbershop_id,category_id,name,description,image_url,item_type,unit_label,minimum_quantity,maximum_quantity,lead_time_hours,sort_order,metadata,active,available)
    values(target_barbershop_id,category.id,clean_name,clean_description,clean_image,clean_type,clean_unit,minimum_value,maximum_value,lead_hours,
      coalesce((select max(sort_order)+10 from public.menu_items where category_id=category.id),10),metadata_patch,coalesce((payload->>'active')::boolean,true),coalesce((payload->>'available')::boolean,true)) returning * into item;
  else
    select * into item from public.menu_items where id=target_item_id and barbershop_id=target_barbershop_id for update;
    if item.id is null then raise exception 'Produto nao encontrado' using errcode='22023'; end if;
    update public.menu_items set category_id=category.id,name=clean_name,description=clean_description,image_url=clean_image,item_type=clean_type,
      unit_label=clean_unit,minimum_quantity=minimum_value,maximum_quantity=maximum_value,lead_time_hours=lead_hours,
      active=coalesce((payload->>'active')::boolean,true),available=coalesce((payload->>'available')::boolean,true),metadata=item.metadata||metadata_patch
      where id=item.id returning * into item;
    delete from public.menu_item_prices where menu_item_id=item.id;
    delete from public.menu_item_option_groups where menu_item_id=item.id;
  end if;
  for price_entry in select value from jsonb_array_elements(payload->'prices') loop
    position:=position+1;
    if length(trim(coalesce(price_entry->>'label',''))) not between 1 and 80 or jsonb_typeof(price_entry->'price') is distinct from 'number'
       or (price_entry ? 'promotional_price' and price_entry->'promotional_price'<>'null'::jsonb and jsonb_typeof(price_entry->'promotional_price') is distinct from 'number')
       or (price_entry->>'price')::numeric<0 or (nullif(price_entry->>'promotional_price',''))::numeric<0
       or coalesce((nullif(price_entry->>'promotional_price',''))::numeric,(price_entry->>'price')::numeric)>(price_entry->>'price')::numeric
       then raise exception 'Preco invalido' using errcode='22023'; end if;
    insert into public.menu_item_prices(barbershop_id,menu_item_id,label,price,promotional_price,sort_order)
    values(target_barbershop_id,item.id,trim(price_entry->>'label'),(price_entry->>'price')::numeric,nullif(price_entry->>'promotional_price','')::numeric,position*10);
  end loop;
  position:=0;
  for group_entry in select value from jsonb_array_elements(coalesce(payload->'option_groups','[]'::jsonb)) loop
    position:=position+1;
    if length(trim(coalesce(group_entry->>'name',''))) not between 1 and 100 or coalesce(group_entry->>'selection_type','multiple') not in ('single','multiple','removal')
       or jsonb_typeof(group_entry->'options') is distinct from 'array' or jsonb_array_length(group_entry->'options') not between 1 and 50 then raise exception 'Grupo de adicionais invalido' using errcode='22023'; end if;
    begin
      insert into public.menu_option_groups(barbershop_id,menu_id,name,selection_type,minimum_selections,maximum_selections,free_selections,sort_order)
      values(target_barbershop_id,menu.id,trim(group_entry->>'name'),coalesce(group_entry->>'selection_type','multiple'),coalesce((group_entry->>'minimum_selections')::integer,0),coalesce((group_entry->>'maximum_selections')::integer,1),coalesce((group_entry->>'free_selections')::integer,0),position*10)
      on conflict(menu_id,name) do update set selection_type=excluded.selection_type,minimum_selections=excluded.minimum_selections,maximum_selections=excluded.maximum_selections,free_selections=excluded.free_selections,active=true
      returning * into group_row;
    exception when check_violation or invalid_text_representation then raise exception 'Grupo de adicionais invalido' using errcode='22023'; end;
    delete from public.menu_options where option_group_id=group_row.id;
    option_position:=0;
    for option_entry in select value from jsonb_array_elements(group_entry->'options') loop
      option_position:=option_position+1;
      if length(trim(coalesce(option_entry->>'name',''))) not between 1 and 120 or jsonb_typeof(option_entry->'price_delta') is distinct from 'number'
         or (option_entry->>'price_delta')::numeric<0 then raise exception 'Adicional invalido' using errcode='22023'; end if;
      insert into public.menu_options(barbershop_id,option_group_id,name,price_delta,maximum_quantity,sort_order)
      values(target_barbershop_id,group_row.id,trim(option_entry->>'name'),(option_entry->>'price_delta')::numeric,coalesce((option_entry->>'maximum_quantity')::integer,1),option_position*10);
    end loop;
    insert into public.menu_item_option_groups(barbershop_id,menu_item_id,option_group_id,sort_order)
    values(target_barbershop_id,item.id,group_row.id,position*10);
  end loop;
  return jsonb_build_object('id',item.id,'category_id',category.id,'image_url',item.image_url);
exception when unique_violation then raise exception 'Categoria, variacao ou adicional duplicado' using errcode='23505';
  when invalid_text_representation or numeric_value_out_of_range then raise exception 'Produto invalido' using errcode='22023';
end $$;

-- Preserve transactional draft publication and existing access checks.

-- Live visibility is restricted to the validated RPC; other product edits still
-- require a draft, and every other onboarding guard remains in place.
drop policy if exists "Published product visibility uses the manager RPC" on public.menu_items;
create policy "Published product visibility uses the manager RPC" on public.menu_items
as restrictive for update to authenticated
using (exists(select 1 from public.online_menus m where m.barbershop_id=menu_items.barbershop_id and not m.published))
with check (exists(select 1 from public.online_menus m where m.barbershop_id=menu_items.barbershop_id and not m.published));
create or replace function private.invalidate_menu_onboarding()
returns trigger language plpgsql security definer set search_path=''
as $$
declare tenant_id uuid; menu public.online_menus;
begin
  if TG_OP='UPDATE' and NEW.barbershop_id is distinct from OLD.barbershop_id then
    raise exception 'Não é permitido transferir dados entre empresas' using errcode='42501';
  end if;
  tenant_id:=case when TG_OP='DELETE' then OLD.barbershop_id else NEW.barbershop_id end;
  select * into menu from public.online_menus where barbershop_id=tenant_id for update;
  if menu.published and TG_TABLE_NAME='menu_delivery_zones' then
    if (select auth.uid()) is null or not public.is_business_manager(tenant_id)
       or not private.business_has_product_access(tenant_id,'menu') then
      raise exception 'Acesso negado' using errcode='42501';
    end if;
    if TG_OP='DELETE' then return OLD; else return NEW; end if;
  end if;
  if menu.published and TG_TABLE_NAME='menu_items' and TG_OP='UPDATE'
    and (to_jsonb(NEW)-'active'-'available'-'updated_at')=(to_jsonb(OLD)-'active'-'available'-'updated_at') then
    if (select auth.uid()) is null or not public.is_business_manager(tenant_id)
       or not private.business_has_product_access(tenant_id,'menu') then
      raise exception 'Acesso negado' using errcode='42501';
    end if;
    return NEW;
  end if;
  if menu.published then raise exception 'Despublique o cardápio antes de alterar o catálogo' using errcode='23514'; end if;
  update public.online_menus set test_order_id=null,test_order_completed_at=null,
    review_confirmed_at=null,ready_at=null,onboarding_step='catalog' where id=menu.id;
  if TG_OP='DELETE' then return OLD; else return NEW; end if;
end $$;
