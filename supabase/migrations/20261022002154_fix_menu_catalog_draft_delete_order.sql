-- Preserve transactional draft publication and existing access checks.
create or replace function private.publish_menu_catalog_draft(target_barbershop_id uuid)
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
  -- Items reference categories with RESTRICT. Remove children first; order snapshots
  -- retain names, quantities and prices, with historical catalog links set to NULL.
  delete from public.menu_items where category_id in (select id from public.menu_categories where menu_id=menu.id);
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

