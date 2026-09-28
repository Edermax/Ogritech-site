-- Mantem o catalogo publico estavel enquanto o gestor prepara uma nova versao.
create table private.menu_catalog_drafts (
  barbershop_id uuid primary key references public.barbershops(id) on delete cascade,
  menu_id uuid not null unique references public.online_menus(id) on delete cascade,
  payload jsonb not null,
  version integer not null default 1 check(version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(jsonb_typeof(payload)='object' and jsonb_typeof(payload->'categories')='array')
);
revoke all on table private.menu_catalog_drafts from public,anon,authenticated;

create function private.menu_catalog_draft_status(target_barbershop_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$ declare draft private.menu_catalog_drafts; begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id)
     or not private.business_has_product_access(target_barbershop_id,'menu') then raise exception 'Acesso negado' using errcode='42501'; end if;
  select * into draft from private.menu_catalog_drafts where barbershop_id=target_barbershop_id;
  return case when draft.menu_id is null then jsonb_build_object('exists',false)
    else jsonb_build_object('exists',true,'version',draft.version,'updated_at',draft.updated_at,'payload',draft.payload) end;
end $$;

create function public.menu_catalog_draft_status(target_barbershop_id uuid)
returns jsonb language sql stable security invoker set search_path=''
as $$ select private.menu_catalog_draft_status(target_barbershop_id) $$;

create function private.save_menu_catalog_draft(target_barbershop_id uuid,draft_payload jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare menu public.online_menus; category jsonb; item jsonb; category_count integer; item_count integer:=0; saved private.menu_catalog_drafts; begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id)
     or not private.business_has_product_access(target_barbershop_id,'menu') then raise exception 'Acesso negado' using errcode='42501'; end if;
  select * into menu from public.online_menus where barbershop_id=target_barbershop_id for update;
  if menu.id is null or not menu.published then raise exception 'O rascunho separado exige um cardapio publicado' using errcode='23514'; end if;
  if jsonb_typeof(draft_payload) is distinct from 'object' or jsonb_typeof(draft_payload->'categories') is distinct from 'array'
     or octet_length(draft_payload::text)>1000000 then raise exception 'Rascunho invalido' using errcode='22023'; end if;
  category_count:=jsonb_array_length(draft_payload->'categories');
  if category_count>100 then raise exception 'Rascunho invalido' using errcode='22023'; end if;
  for category in select value from jsonb_array_elements(draft_payload->'categories') loop
    if length(trim(coalesce(category->>'name',''))) not between 1 and 100
       or jsonb_typeof(category->'menu_items') is distinct from 'array' then raise exception 'Categoria invalida' using errcode='22023'; end if;
    for item in select value from jsonb_array_elements(category->'menu_items') loop
      item_count:=item_count+1;
      if item_count>1000 or length(trim(coalesce(item->>'name',''))) not between 2 and 160
         or jsonb_typeof(item->'menu_item_prices') is distinct from 'array'
         or jsonb_array_length(item->'menu_item_prices') not between 1 and 20
         or jsonb_typeof(coalesce(item->'menu_item_option_groups','[]'::jsonb)) is distinct from 'array'
         then raise exception 'Produto invalido' using errcode='22023'; end if;
    end loop;
  end loop;
  insert into private.menu_catalog_drafts(barbershop_id,menu_id,payload)
  values(target_barbershop_id,menu.id,draft_payload)
  on conflict(barbershop_id) do update set menu_id=excluded.menu_id,payload=excluded.payload,
    version=private.menu_catalog_drafts.version+1,updated_at=now()
  returning * into saved;
  return jsonb_build_object('saved',true,'version',saved.version,'categories',category_count,'items',item_count,'updated_at',saved.updated_at);
end $$;

create function public.save_menu_catalog_draft(target_barbershop_id uuid,draft_payload jsonb)
returns jsonb language sql security invoker set search_path=''
as $$ select private.save_menu_catalog_draft(target_barbershop_id,draft_payload) $$;

create function private.publish_menu_catalog_draft(target_barbershop_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  menu public.online_menus; draft private.menu_catalog_drafts; category jsonb; draft_item jsonb; link jsonb; group_data jsonb;
  prices jsonb; groups jsonb; item_payload jsonb; category_position integer:=0; item_position integer; saved jsonb;
begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id)
     or not private.business_has_product_access(target_barbershop_id,'menu') then raise exception 'Acesso negado' using errcode='42501'; end if;
  select * into menu from public.online_menus where barbershop_id=target_barbershop_id for update;
  select * into draft from private.menu_catalog_drafts where barbershop_id=target_barbershop_id and menu_id=menu.id for update;
  if menu.id is null or not menu.published or draft.menu_id is null then raise exception 'Nao ha alteracoes de catalogo para publicar' using errcode='23514'; end if;

  -- Dentro da transacao, leitores continuam vendo a versao anterior ate o commit.
  update public.online_menus set published=false where id=menu.id;
  delete from public.menu_categories where menu_id=menu.id;
  delete from public.menu_option_groups where menu_id=menu.id;

  for category in select value from jsonb_array_elements(draft.payload->'categories') loop
    category_position:=category_position+1; item_position:=0;
    for draft_item in select value from jsonb_array_elements(category->'menu_items') loop
      item_position:=item_position+1;
      prices:=coalesce(draft_item->'menu_item_prices','[]'::jsonb);
      groups:='[]'::jsonb;
      for link in select value from jsonb_array_elements(coalesce(draft_item->'menu_item_option_groups','[]'::jsonb)) loop
        group_data:=coalesce(link->'menu_option_groups',link);
        groups:=groups||jsonb_build_array(jsonb_build_object(
          'name',group_data->>'name','selection_type',coalesce(group_data->>'selection_type','multiple'),
          'minimum_selections',coalesce((group_data->>'minimum_selections')::integer,0),
          'maximum_selections',coalesce((group_data->>'maximum_selections')::integer,1),
          'free_selections',coalesce((group_data->>'free_selections')::integer,0),
          'options',coalesce(group_data->'menu_options',group_data->'options','[]'::jsonb)
        ));
      end loop;
      item_payload:=jsonb_build_object(
        'category_name',category->>'name','name',draft_item->>'name','description',coalesce(draft_item->>'description',''),
        'image_url',coalesce(draft_item->>'image_url',''),'item_type',coalesce(draft_item->>'item_type','simple'),
        'unit_label',coalesce(draft_item->>'unit_label','unidade'),'minimum_quantity',coalesce((draft_item->>'minimum_quantity')::numeric,1),
        'maximum_quantity',nullif(draft_item->>'maximum_quantity','')::numeric,'lead_time_hours',coalesce((draft_item->>'lead_time_hours')::integer,0),
        'active',coalesce((draft_item->>'active')::boolean,true),'available',coalesce((draft_item->>'available')::boolean,true),
        'prices',prices,'option_groups',groups
      );
      saved:=private.save_menu_catalog_item(target_barbershop_id,item_payload);
      update public.menu_items set sort_order=item_position*10 where id=(saved->>'id')::uuid;
      update public.menu_categories set sort_order=category_position*10,active=coalesce((category->>'active')::boolean,true)
        where id=(saved->>'category_id')::uuid;
    end loop;
  end loop;
  if not private.menu_catalog_is_ready(menu.id) then raise exception 'O rascunho precisa ter ao menos um produto disponivel e todo produto disponivel precisa de preco' using errcode='23514'; end if;
  update public.online_menus set published=true,published_at=now() where id=menu.id;
  delete from private.menu_catalog_drafts where barbershop_id=target_barbershop_id;
  insert into public.menu_onboarding_events(barbershop_id,menu_id,actor_user_id,event_type,details)
  values(target_barbershop_id,menu.id,(select auth.uid()),'published',jsonb_build_object('source','catalog_draft','version',draft.version));
  return jsonb_build_object('published',true,'version',draft.version,'published_at',now());
end $$;

create function public.publish_menu_catalog_draft(target_barbershop_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.publish_menu_catalog_draft(target_barbershop_id) $$;

create function private.discard_menu_catalog_draft(target_barbershop_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$ begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id)
     or not private.business_has_product_access(target_barbershop_id,'menu') then raise exception 'Acesso negado' using errcode='42501'; end if;
  delete from private.menu_catalog_drafts where barbershop_id=target_barbershop_id;
  return jsonb_build_object('discarded',true);
end $$;
create function public.discard_menu_catalog_draft(target_barbershop_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.discard_menu_catalog_draft(target_barbershop_id) $$;

revoke all on function private.menu_catalog_draft_status(uuid),private.save_menu_catalog_draft(uuid,jsonb),private.publish_menu_catalog_draft(uuid),private.discard_menu_catalog_draft(uuid) from public,anon,authenticated;
grant execute on function private.menu_catalog_draft_status(uuid),private.save_menu_catalog_draft(uuid,jsonb),private.publish_menu_catalog_draft(uuid),private.discard_menu_catalog_draft(uuid) to authenticated;
revoke all on function public.menu_catalog_draft_status(uuid),public.save_menu_catalog_draft(uuid,jsonb),public.publish_menu_catalog_draft(uuid),public.discard_menu_catalog_draft(uuid) from public,anon;
grant execute on function public.menu_catalog_draft_status(uuid),public.save_menu_catalog_draft(uuid,jsonb),public.publish_menu_catalog_draft(uuid),public.discard_menu_catalog_draft(uuid) to authenticated;
