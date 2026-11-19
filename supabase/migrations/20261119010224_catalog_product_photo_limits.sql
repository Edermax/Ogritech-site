-- Product galleries are opt-in. The existing image_url remains the cover.
create function private.catalog_product_image_limit(tenant uuid) returns integer
language sql stable security invoker set search_path='' as $$
 select case when private.menu_has_orders(tenant) then 3 else 1 end
$$;

create function private.validate_catalog_product_images(tenant uuid,cover text,images jsonb,previous jsonb default '[]') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare entry jsonb; asset text; seen text[]:='{}'; result jsonb:='[]'; prior jsonb:=case when jsonb_typeof(previous)='array' then previous else '[]'::jsonb end;
begin
 if jsonb_typeof(images) is distinct from 'array' or jsonb_array_length(images)>2 then
  raise exception 'Use no maximo 3 fotos por produto no Completo e 1 no Essencial' using errcode='22023'; end if;
 for entry in select value from jsonb_array_elements(images) loop
  if jsonb_typeof(entry) is distinct from 'string' then raise exception 'Foto de produto invalida' using errcode='22023'; end if;
  asset:=entry#>>'{}';
  if asset !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
   or split_part(asset,'/',1)<>tenant::text then raise exception 'A foto deve pertencer ao estabelecimento' using errcode='22023'; end if;
  if asset=any(seen) or right(coalesce(cover,''),length(asset)+1)='/'||asset then raise exception 'Nao repita a mesma foto no produto' using errcode='22023'; end if;
  if not(prior ? asset) then
   if private.catalog_product_image_limit(tenant)<3 then raise exception 'O Essencial permite 1 foto por produto. Fotos adicionais exigem o Completo' using errcode='22023'; end if;
   if nullif(cover,'') is null then raise exception 'Escolha primeiro a foto principal' using errcode='22023'; end if;
   if not exists(select 1 from storage.objects o where o.bucket_id='menu-images' and o.name=asset
    and o.metadata->>'mimetype' in ('image/jpeg','image/png','image/webp') and (o.metadata->>'size')::numeric between 1 and 5242880) then
    raise exception 'Envie uma imagem JPEG, PNG ou WebP de ate 5 MB' using errcode='22023'; end if;
  end if;
  seen:=array_append(seen,asset); result:=result||jsonb_build_array(asset);
 end loop;
 return result;
end $$;

-- Direct table mutations are subject to the same limits as the catalog RPCs.
create function private.guard_catalog_product_images() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.metadata ? 'gallery_images' then
  new.metadata:=jsonb_set(new.metadata,'{gallery_images}',private.validate_catalog_product_images(new.barbershop_id,new.image_url,new.metadata->'gallery_images',case when TG_OP='UPDATE' then old.metadata->'gallery_images' else '[]'::jsonb end));
 end if;
 return new;
end $$;
create trigger catalog_product_images_guard before insert or update of metadata,image_url on public.menu_items
for each row execute function private.guard_catalog_product_images();

-- The public response exposes only the photos included in the current plan.
create function private.catalog_visible_product_images(payload jsonb,tenant uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_set(jsonb_set(payload,'{menu}',(payload->'menu')||jsonb_build_object('product_image_limit',private.catalog_product_image_limit(tenant))),'{categories}',
  coalesce((select jsonb_agg(jsonb_set(category,'{items}',coalesce((select jsonb_agg(jsonb_set(item,'{metadata}',case when private.catalog_product_image_limit(tenant)=1
    then coalesce(item->'metadata','{}'::jsonb)-'gallery_images' else coalesce(item->'metadata','{}'::jsonb) end) order by item_position)
    from jsonb_array_elements(category->'items') with ordinality items(item,item_position)),'[]'::jsonb)) order by category_position)
   from jsonb_array_elements(payload->'categories') with ordinality categories(category,category_position)),'[]'::jsonb))
$$;
revoke all on function private.catalog_product_image_limit(uuid),private.validate_catalog_product_images(uuid,text,jsonb,jsonb),private.guard_catalog_product_images(),private.catalog_visible_product_images(jsonb,uuid) from public,anon,authenticated;

-- Referenced covers and gallery photos are immutable, including saved drafts.
create or replace function private.menu_branding_asset_is_referenced(asset text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.online_menus where visual_identity->>'logo_path'=asset or visual_identity->>'cover_path'=asset)
 or exists(select 1 from private.menu_branding_drafts where identity->>'logo_path'=asset or identity->>'cover_path'=asset)
 or exists(select 1 from public.menu_items where image_url like '%/storage/v1/object/public/menu-images/'||asset or metadata->'gallery_images' ? asset)
 or exists(select 1 from private.menu_catalog_drafts d cross join lateral jsonb_array_elements(d.payload->'categories') category
  cross join lateral jsonb_array_elements(category->'menu_items') item
  where item->>'image_url' like '%/storage/v1/object/public/menu-images/'||asset or item->'metadata'->'gallery_images' ? asset)
$$;

do $patch$ declare definition text; patched text;
begin
 definition:=pg_get_functiondef('private.save_menu_catalog_item(uuid,jsonb)'::regprocedure);
 patched:=replace(definition,'''order_mode'',''configuration_required'',''quantity_rules'')','''order_mode'',''configuration_required'',''quantity_rules'',''gallery_images'')');
 if patched=definition then raise exception 'Product photo metadata anchor missing'; end if; execute patched;

 definition:=pg_get_functiondef('private.save_menu_catalog_draft(uuid,jsonb)'::regprocedure);
 patched:=replace(definition,'      item_count:=item_count+1;',
 $body$      if item->'metadata' ? 'gallery_images' then
        perform private.validate_catalog_product_images(target_barbershop_id,item->>'image_url',item->'metadata'->'gallery_images',
          (select i.metadata->'gallery_images' from public.menu_items i where i.id=case when item->>'id' ~* '^[0-9a-f-]{36}$' then (item->>'id')::uuid end and i.barbershop_id=target_barbershop_id));
      end if;
      item_count:=item_count+1;$body$);
 if patched=definition then raise exception 'Product photo draft anchor missing'; end if; execute patched;

 definition:=pg_get_functiondef('private.menu_onboarding_status(uuid)'::regprocedure);
 patched:=replace(definition,'''inventory_enabled'',','''product_image_limit'',private.catalog_product_image_limit(target_barbershop_id),''inventory_enabled'',');
 if patched=definition then raise exception 'Product photo entitlement anchor missing'; end if; execute patched;

 definition:=pg_get_functiondef('private.public_menu(text)'::regprocedure);
 patched:=replace(definition,'return result;','return private.catalog_visible_product_images(result,tenant);');
 if patched=definition then raise exception 'Product photo public visibility anchor missing'; end if; execute patched;
end $patch$;

update public.saas_plans set features=features||'["1 foto por produto"]'::jsonb where code='catalogo-essencial';
update public.saas_plans set features=features||'["Até 3 fotos por produto"]'::jsonb where code='catalogo-completo';
