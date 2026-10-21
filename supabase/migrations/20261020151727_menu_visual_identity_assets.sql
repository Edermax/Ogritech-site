-- Branding follows its own draft/publication boundary. Existing menus and orders are preserved.
create table private.menu_branding_drafts (
  barbershop_id uuid primary key references public.barbershops(id) on delete cascade,
  identity jsonb not null check(jsonb_typeof(identity)='object'),
  updated_at timestamptz not null default now()
);
alter table private.menu_branding_drafts enable row level security;
revoke all on table private.menu_branding_drafts from public,anon,authenticated;

create function private.menu_branding(target_barbershop_id uuid, action text, payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare menu public.online_menus; draft jsonb; identity jsonb; asset text; object_metadata jsonb;
begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id)
     or not private.business_has_product_access(target_barbershop_id,'menu') then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  if action not in ('get','save','publish','discard') then raise exception 'Ação inválida' using errcode='22023'; end if;
  select * into menu from public.online_menus where barbershop_id=target_barbershop_id for update;
  if menu.id is null then raise exception 'Crie a estrutura inicial do cardápio' using errcode='23514'; end if;
  if action='save' then
    if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>4096
       or coalesce(payload->>'primary_color','')!~'^#[0-9A-Fa-f]{6}$'
       or coalesce(payload->>'accent_color','')!~'^#[0-9A-Fa-f]{6}$'
       or exists(select 1 from jsonb_object_keys(payload) key where key not in ('primary_color','accent_color','logo_path','cover_path')) then
      raise exception 'Identidade visual inválida' using errcode='22023';
    end if;
    foreach asset in array array[coalesce(payload->>'logo_path',''),coalesce(payload->>'cover_path','')] loop
      if asset='' then continue; end if;
      if asset!~('^'||target_barbershop_id::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$') then
        raise exception 'Imagem não pertence ao estabelecimento' using errcode='42501';
      end if;
      select metadata into object_metadata from storage.objects where bucket_id='menu-images' and name=asset;
      if object_metadata is null or coalesce(object_metadata->>'mimetype','') not in ('image/jpeg','image/png','image/webp')
         or coalesce((object_metadata->>'size')::bigint,0) not between 1 and 5242880 then
        raise exception 'Envie uma imagem JPEG, PNG ou WebP de até 5 MB' using errcode='22023';
      end if;
    end loop;
    identity:=jsonb_build_object('customized',true,'primary_color',lower(payload->>'primary_color'),
      'accent_color',lower(payload->>'accent_color'),'logo_path',coalesce(payload->>'logo_path',''),
      'cover_path',coalesce(payload->>'cover_path',''));
    if menu.published then
      insert into private.menu_branding_drafts(barbershop_id,identity) values(target_barbershop_id,identity)
      on conflict(barbershop_id) do update set identity=excluded.identity,updated_at=now();
    else
      update public.online_menus set visual_identity=identity where id=menu.id;
      delete from private.menu_branding_drafts where barbershop_id=target_barbershop_id;
    end if;
  elsif action='publish' then
    select d.identity into draft from private.menu_branding_drafts d where d.barbershop_id=target_barbershop_id;
    if draft is null then raise exception 'Não há aparência em rascunho para publicar' using errcode='23514'; end if;
    update public.online_menus set visual_identity=draft where id=menu.id;
    delete from private.menu_branding_drafts where barbershop_id=target_barbershop_id;
  elsif action='discard' then
    delete from private.menu_branding_drafts where barbershop_id=target_barbershop_id;
  end if;
  select * into menu from public.online_menus where id=menu.id;
  select d.identity into draft from private.menu_branding_drafts d where d.barbershop_id=target_barbershop_id;
  return jsonb_build_object('identity',coalesce(draft,menu.visual_identity),'published_identity',menu.visual_identity,
    'has_draft',draft is not null,'menu_published',menu.published);
end $$;
create function public.menu_branding(target_barbershop_id uuid, action text, payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path=''
as $$ select private.menu_branding(target_barbershop_id,action,payload) $$;
revoke all on function private.menu_branding(uuid,text,jsonb),public.menu_branding(uuid,text,jsonb) from public,anon;
grant execute on function private.menu_branding(uuid,text,jsonb),public.menu_branding(uuid,text,jsonb) to authenticated;

create function private.menu_branding_asset_is_referenced(asset text)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.online_menus where visual_identity->>'logo_path'=asset or visual_identity->>'cover_path'=asset)
  or exists(select 1 from private.menu_branding_drafts where identity->>'logo_path'=asset or identity->>'cover_path'=asset)
  or exists(select 1 from public.menu_items where image_url like '%/storage/v1/object/public/menu-images/'||asset) $$;
revoke all on function private.menu_branding_asset_is_referenced(text) from public,anon;
grant execute on function private.menu_branding_asset_is_referenced(text) to authenticated;
create policy "Referenced menu images are immutable" on storage.objects as restrictive for update to authenticated
using(bucket_id<>'menu-images' or not private.menu_branding_asset_is_referenced(name))
with check(bucket_id<>'menu-images' or not private.menu_branding_asset_is_referenced(name));
create policy "Referenced menu images cannot be deleted" on storage.objects as restrictive for delete to authenticated
using(bucket_id<>'menu-images' or not private.menu_branding_asset_is_referenced(name));
