-- Editor self-service completo do catalogo, com escrita atomica e imagens isoladas por empresa.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('menu-images','menu-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Menu managers upload catalog images" on storage.objects;
drop policy if exists "Menu managers update catalog images" on storage.objects;
drop policy if exists "Menu managers delete catalog images" on storage.objects;
create policy "Menu managers upload catalog images" on storage.objects for insert to authenticated
with check(bucket_id='menu-images' and (storage.foldername(name))[1]~'^[0-9a-f-]{36}$'
  and public.is_business_manager(((storage.foldername(name))[1])::uuid)
  and private.business_has_product_access(((storage.foldername(name))[1])::uuid,'menu'));
create policy "Menu managers update catalog images" on storage.objects for update to authenticated
using(bucket_id='menu-images' and (storage.foldername(name))[1]~'^[0-9a-f-]{36}$'
  and public.is_business_manager(((storage.foldername(name))[1])::uuid)
  and private.business_has_product_access(((storage.foldername(name))[1])::uuid,'menu'))
with check(bucket_id='menu-images' and (storage.foldername(name))[1]~'^[0-9a-f-]{36}$'
  and public.is_business_manager(((storage.foldername(name))[1])::uuid)
  and private.business_has_product_access(((storage.foldername(name))[1])::uuid,'menu'));
create policy "Menu managers delete catalog images" on storage.objects for delete to authenticated
using(bucket_id='menu-images' and (storage.foldername(name))[1]~'^[0-9a-f-]{36}$'
  and public.is_business_manager(((storage.foldername(name))[1])::uuid)
  and private.business_has_product_access(((storage.foldername(name))[1])::uuid,'menu'));

create or replace function private.save_menu_catalog_item(target_barbershop_id uuid,payload jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  menu public.online_menus; category public.menu_categories; item public.menu_items;
  price_entry jsonb; group_entry jsonb; option_entry jsonb; group_row public.menu_option_groups;
  target_item_id uuid; target_category_id uuid; clean_name text; clean_description text; clean_category text;
  clean_image text; clean_type text; clean_unit text; minimum_value numeric; maximum_value numeric; lead_hours integer;
  position integer:=0; option_position integer; allowed_prefix text;
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
    insert into public.menu_items(barbershop_id,category_id,name,description,image_url,item_type,unit_label,minimum_quantity,maximum_quantity,lead_time_hours,sort_order)
    values(target_barbershop_id,category.id,clean_name,clean_description,clean_image,clean_type,clean_unit,minimum_value,maximum_value,lead_hours,
      coalesce((select max(sort_order)+10 from public.menu_items where category_id=category.id),10)) returning * into item;
  else
    select * into item from public.menu_items where id=target_item_id and barbershop_id=target_barbershop_id for update;
    if item.id is null then raise exception 'Produto nao encontrado' using errcode='22023'; end if;
    update public.menu_items set category_id=category.id,name=clean_name,description=clean_description,image_url=clean_image,item_type=clean_type,
      unit_label=clean_unit,minimum_quantity=minimum_value,maximum_quantity=maximum_value,lead_time_hours=lead_hours,
      active=coalesce((payload->>'active')::boolean,true),available=coalesce((payload->>'available')::boolean,true)
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

create or replace function public.save_menu_catalog_item(target_barbershop_id uuid,payload jsonb)
returns jsonb language sql security invoker set search_path=''
as $$ select private.save_menu_catalog_item(target_barbershop_id,payload) $$;
revoke all on function private.save_menu_catalog_item(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.save_menu_catalog_item(uuid,jsonb) to authenticated;
revoke all on function public.save_menu_catalog_item(uuid,jsonb) from public,anon;
grant execute on function public.save_menu_catalog_item(uuid,jsonb) to authenticated;

create or replace function private.delete_menu_catalog_item(target_barbershop_id uuid,target_item_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare menu public.online_menus; item public.menu_items; begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id) or not private.business_has_product_access(target_barbershop_id,'menu') then raise exception 'Acesso negado' using errcode='42501'; end if;
  select * into menu from public.online_menus where barbershop_id=target_barbershop_id for update;
  if menu.published then raise exception 'Despublique o cardapio antes de alterar o catalogo' using errcode='23514'; end if;
  select i.* into item from public.menu_items i join public.menu_categories c on c.id=i.category_id where i.id=target_item_id and i.barbershop_id=target_barbershop_id and c.menu_id=menu.id;
  if item.id is null then raise exception 'Produto nao encontrado' using errcode='22023'; end if;
  delete from public.menu_items where id=item.id;
  delete from public.menu_categories c where c.id=item.category_id and not exists(select 1 from public.menu_items i where i.category_id=c.id);
  return jsonb_build_object('deleted',true,'image_url',item.image_url);
end $$;
create or replace function public.delete_menu_catalog_item(target_barbershop_id uuid,target_item_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.delete_menu_catalog_item(target_barbershop_id,target_item_id) $$;
revoke all on function private.delete_menu_catalog_item(uuid,uuid) from public,anon,authenticated;
grant execute on function private.delete_menu_catalog_item(uuid,uuid) to authenticated;
revoke all on function public.delete_menu_catalog_item(uuid,uuid) from public,anon;
grant execute on function public.delete_menu_catalog_item(uuid,uuid) to authenticated;

create or replace function private.menu_catalog_is_ready(target_menu_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.menu_items i join public.menu_categories c on c.id=i.category_id where c.menu_id=target_menu_id and c.active and i.active and i.available)
  and not exists(select 1 from public.menu_items i join public.menu_categories c on c.id=i.category_id where c.menu_id=target_menu_id and c.active and i.active and i.available
    and not exists(select 1 from public.menu_item_prices p where p.menu_item_id=i.id and p.active)) $$;
revoke all on function private.menu_catalog_is_ready(uuid) from public,anon,authenticated;

create or replace function private.menu_onboarding_snapshot(target_barbershop_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare menu public.online_menus; segment_ok boolean; identity_ok boolean; catalog_ok boolean; fulfillment_ok boolean; payments_ok boolean; hours_ok boolean; test_ok boolean; review_ok boolean; next_step text;
begin
  select * into menu from public.online_menus where barbershop_id=target_barbershop_id;
  if menu.id is null then return jsonb_build_object('exists',false,'next_step','segment','published',false); end if;
  segment_ok:=menu.template_code is not null;
  identity_ok:=menu.settings_completed_at is not null and coalesce(menu.visual_identity->>'primary_color','')~'^#[0-9A-Fa-f]{6}$' and coalesce(menu.visual_identity->>'accent_color','')~'^#[0-9A-Fa-f]{6}$';
  catalog_ok:=private.menu_catalog_is_ready(menu.id);
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
