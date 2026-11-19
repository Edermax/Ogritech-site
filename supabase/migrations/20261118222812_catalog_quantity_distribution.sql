-- Opt-in whole-unit lots. Existing product quantities/prices/history are unchanged.
-- Distribution is absolute per order line, separate from per-unit paid extras.
create function private.validate_catalog_quantity_rules(rules jsonb,minimum_value numeric,maximum_value numeric)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare step_value integer; distribution_step integer; names jsonb; name_value jsonb; seen text[]:='{}'; clean_name text;
begin
 if rules is null or rules='null'::jsonb then return null; end if;
 if jsonb_typeof(rules) is distinct from 'object' or octet_length(rules::text)>10000
  or jsonb_typeof(rules->'step') is distinct from 'number' or (rules->>'step') !~ '^[0-9]{1,5}$'
  or jsonb_typeof(rules->'options') is distinct from 'array' then
  raise exception 'Regras de quantidade invalidas' using errcode='22023';
 end if;
 step_value:=(rules->>'step')::integer; names:=rules->'options';
 if step_value not between 1 and 10000 or minimum_value is null or minimum_value not between 1 and 10000
  or trunc(minimum_value)<>minimum_value or mod(minimum_value,step_value)<>0
  or (maximum_value is not null and (maximum_value not between minimum_value and 10000 or trunc(maximum_value)<>maximum_value or mod(maximum_value,step_value)<>0))
  or jsonb_array_length(names)>50 then raise exception 'Minimo, maximo ou multiplo de compra invalidos' using errcode='22023'; end if;
 distribution_step:=step_value;
 if jsonb_array_length(names)>0 then
  if jsonb_typeof(rules->'distribution_step') is distinct from 'number' or (rules->>'distribution_step') !~ '^[0-9]{1,5}$' then
   raise exception 'Multiplo por opcao invalido' using errcode='22023'; end if;
  distribution_step:=(rules->>'distribution_step')::integer;
  if distribution_step not between 1 and 10000 then raise exception 'Multiplo por opcao invalido' using errcode='22023'; end if;
  if mod(step_value,distribution_step)<>0 then raise exception 'O multiplo por opcao deve dividir o multiplo de compra' using errcode='22023'; end if;
 end if;
 for name_value in select value from jsonb_array_elements(names) loop
  if jsonb_typeof(name_value) is distinct from 'string' then raise exception 'Nome de opcao invalido' using errcode='22023'; end if;
  clean_name:=trim(name_value#>>'{}');
  if length(clean_name) not between 1 and 80 or clean_name ~ '[[:cntrl:]]' or lower(clean_name)=any(seen) then
   raise exception 'Nome de opcao invalido ou repetido' using errcode='22023'; end if;
  seen:=array_append(seen,lower(clean_name));
 end loop;
 return jsonb_build_object('step',step_value,'distribution_step',distribution_step,'options',
  coalesce((select jsonb_agg(trim(value#>>'{}') order by position) from jsonb_array_elements(names) with ordinality entries(value,position)),'[]'::jsonb));
exception when numeric_value_out_of_range or division_by_zero then raise exception 'Regras de quantidade invalidas' using errcode='22023';
end $$;

create function private.validate_catalog_distribution(rules jsonb,minimum_value numeric,maximum_value numeric,qty integer,distribution jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare rule jsonb; part jsonb; part_qty integer; name_value text; seen text[]:='{}'; total_qty integer:=0; result jsonb:='[]';
begin
 rule:=private.validate_catalog_quantity_rules(rules,minimum_value,maximum_value);
 if qty is null or qty<greatest(1,minimum_value) or qty>least(coalesce(maximum_value,10000),case when rule is null then 100 else 10000 end)
  then raise exception 'Quantidade fora dos limites do produto' using errcode='22023'; end if;
 if rule is not null and mod(qty,(rule->>'step')::integer)<>0 then raise exception 'Quantidade fora do multiplo de compra' using errcode='22023'; end if;
 if jsonb_typeof(distribution) is distinct from 'array' or jsonb_array_length(distribution)>50 then raise exception 'Distribuicao invalida' using errcode='22023'; end if;
 if rule is null or jsonb_array_length(rule->'options')=0 then
  if jsonb_array_length(distribution)>0 then raise exception 'Este produto nao aceita distribuicao de quantidades' using errcode='22023'; end if;
  return result;
 end if;
 for part in select value from jsonb_array_elements(distribution) loop
  if jsonb_typeof(part) is distinct from 'object' or jsonb_typeof(part->'name') is distinct from 'string'
   or jsonb_typeof(part->'quantity') is distinct from 'number' or (part->>'quantity') !~ '^[0-9]{1,5}$' then raise exception 'Distribuicao invalida' using errcode='22023'; end if;
  name_value:=part->>'name'; part_qty:=(part->>'quantity')::integer;
  if not (rule->'options' ? name_value) or name_value=any(seen) or part_qty not between 1 and qty then raise exception 'Opcao ou quantidade invalida' using errcode='22023'; end if;
  if mod(part_qty,(rule->>'distribution_step')::integer)<>0 then raise exception 'Quantidade fora do multiplo por opcao' using errcode='22023'; end if;
  seen:=array_append(seen,name_value); total_qty:=total_qty+part_qty;
  result:=result||jsonb_build_array(jsonb_build_object('name',name_value,'quantity',part_qty));
 end loop;
 if total_qty<>qty then raise exception 'A soma das opcoes deve ser igual a quantidade comprada' using errcode='22023'; end if;
 return result;
end $$;
revoke all on function private.validate_catalog_quantity_rules(jsonb,numeric,numeric),private.validate_catalog_distribution(jsonb,numeric,numeric,integer,jsonb) from public,anon,authenticated;

-- Keep the existing manager authorization, metadata allowlist, publication and
-- checkout transactions. Fail closed if the expected source anchors change.
do $patch$
declare definition text; patched text;
begin
 definition:=pg_get_functiondef('private.save_menu_catalog_item(uuid,jsonb)'::regprocedure);
 patched:=replace(definition,'''order_mode'',''configuration_required'')','''order_mode'',''configuration_required'',''quantity_rules'')');
 if patched=definition then raise exception 'Quantity metadata allowlist anchor missing'; end if; definition:=patched;
 patched:=replace(definition,'  allowed_prefix:=',
 $body$  if metadata_patch ? 'quantity_rules' then
    metadata_patch:=jsonb_set(metadata_patch,'{quantity_rules}',coalesce(private.validate_catalog_quantity_rules(metadata_patch->'quantity_rules',minimum_value,maximum_value),'null'::jsonb));
  elsif target_item_id is not null then
    perform private.validate_catalog_quantity_rules((select i.metadata->'quantity_rules' from public.menu_items i where i.id=target_item_id and i.barbershop_id=target_barbershop_id),minimum_value,maximum_value);
  end if;
  allowed_prefix:=$body$);
 if patched=definition then raise exception 'Quantity save validation anchor missing'; end if; execute patched;

 definition:=pg_get_functiondef('private.save_menu_catalog_draft(uuid,jsonb)'::regprocedure);
 patched:=replace(definition,'      item_count:=item_count+1;',
 $body$      perform private.validate_catalog_quantity_rules(item->'metadata'->'quantity_rules',coalesce((item->>'minimum_quantity')::numeric,1),nullif(item->>'maximum_quantity','')::numeric);
      item_count:=item_count+1;$body$);
 if patched=definition then raise exception 'Quantity draft validation anchor missing'; end if; execute patched;

 definition:=pg_get_functiondef('private.publish_menu_catalog_draft(uuid)'::regprocedure);
 patched:=replace(definition,'      update public.menu_categories set sort_order=',
 $body$      perform private.validate_catalog_quantity_rules(i.metadata->'quantity_rules',i.minimum_quantity,i.maximum_quantity) from public.menu_items i where i.id=(saved->>'id')::uuid;
      update public.menu_categories set sort_order=$body$);
 if patched=definition then raise exception 'Quantity publish validation anchor missing'; end if; execute patched;

 definition:=pg_get_functiondef('private.create_menu_order_core(text,text,text,text,text,jsonb,text,jsonb,boolean,uuid,timestamptz,text,boolean)'::regprocedure);
 patched:=replace(definition,'  group_row public.menu_option_groups;', '  distribution jsonb; distribution_part jsonb; group_row public.menu_option_groups;');
 if patched=definition then raise exception 'Quantity checkout declaration anchor missing'; end if; definition:=patched;
 patched:=replace(definition,'qty not between 1 and 100 or','qty not between 1 and 10000 or');
 if patched=definition then raise exception 'Quantity checkout bound anchor missing'; end if; definition:=patched;
 patched:=replace(definition,'    if exists(',$body$    distribution:=private.validate_catalog_distribution(selected_item.metadata->'quantity_rules',selected_item.minimum_quantity,selected_item.maximum_quantity,qty,coalesce(item->'distribution','[]'::jsonb));
    if exists($body$);
 if patched=definition then raise exception 'Quantity checkout validation anchor missing'; end if; definition:=patched;
 patched:=replace(definition,'    base_price:=coalesce(selected_price.promotional_price,selected_price.price)+option_total;',
 $body$    for distribution_part in select value from jsonb_array_elements(distribution) loop
      insert into public.menu_order_item_options(barbershop_id,order_item_id,group_name,option_name,quantity,unit_price_delta)
      values(menu.barbershop_id,order_item.id,'Distribuição',distribution_part->>'name',(distribution_part->>'quantity')::integer,0);
    end loop;
    base_price:=coalesce(selected_price.promotional_price,selected_price.price)+option_total;$body$);
 if patched=definition then raise exception 'Quantity checkout snapshot anchor missing'; end if; execute patched;

 -- The authenticated tracking token already protects these order snapshots.
 definition:=pg_get_functiondef('private.get_menu_order_tracking_data(text,text)'::regprocedure);
 patched:=replace(definition,'''line_total'',i.line_total)',
 $body$'line_total',i.line_total,'options',coalesce((select jsonb_agg(jsonb_build_object('group_name',opt.group_name,'name',opt.option_name,'quantity',opt.quantity) order by opt.created_at,opt.id) from public.menu_order_item_options opt where opt.order_item_id=i.id and opt.barbershop_id=i.barbershop_id),'[]'::jsonb))$body$);
 if patched=definition then raise exception 'Quantity tracking anchor missing'; end if; execute patched;
end $patch$;

-- Editing lots on a published product must retain its identity and stock ledger.
-- Reconcile in the existing atomic transaction instead of recreating every item.
create or replace function private.publish_menu_catalog_draft(target_barbershop_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 menu public.online_menus; draft private.menu_catalog_drafts; category jsonb; draft_item jsonb; link jsonb; group_data jsonb;
 prices jsonb; groups jsonb; item_payload jsonb; category_position integer:=0; item_position integer; saved jsonb;
 prior_metadata jsonb; item_id uuid; kept_items uuid[]:='{}'; kept_categories uuid[]:='{}';
begin
 if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id)
  or not private.business_has_product_access(target_barbershop_id,'menu') then raise exception 'Acesso negado' using errcode='42501'; end if;
 select * into menu from public.online_menus where barbershop_id=target_barbershop_id for update;
 select * into draft from private.menu_catalog_drafts where barbershop_id=target_barbershop_id and menu_id=menu.id for update;
 if menu.id is null or not menu.published or draft.menu_id is null then raise exception 'Nao ha alteracoes de catalogo para publicar' using errcode='23514'; end if;
 select coalesce(jsonb_object_agg(i.id::text,i.metadata),'{}'::jsonb) into prior_metadata
 from public.menu_items i join public.menu_categories c on c.id=i.category_id where c.menu_id=menu.id and i.barbershop_id=target_barbershop_id;
 update public.online_menus set published=false where id=menu.id;
 for category in select value from jsonb_array_elements(draft.payload->'categories') loop
  category_position:=category_position+1; item_position:=0;
  for draft_item in select value from jsonb_array_elements(category->'menu_items') loop
   item_position:=item_position+1;
   item_id:=case when prior_metadata ? (draft_item->>'id') then (draft_item->>'id')::uuid else null end;
   if item_id=any(kept_items) then raise exception 'Produto repetido no rascunho' using errcode='22023'; end if;
   prices:=coalesce(draft_item->'menu_item_prices','[]'::jsonb); groups:='[]'::jsonb;
   for link in select value from jsonb_array_elements(coalesce(draft_item->'menu_item_option_groups','[]'::jsonb)) loop
    group_data:=coalesce(link->'menu_option_groups',link);
    groups:=groups||jsonb_build_array(jsonb_build_object('name',group_data->>'name','selection_type',coalesce(group_data->>'selection_type','multiple'),
     'minimum_selections',coalesce((group_data->>'minimum_selections')::integer,0),'maximum_selections',coalesce((group_data->>'maximum_selections')::integer,1),
     'free_selections',coalesce((group_data->>'free_selections')::integer,0),'options',coalesce(group_data->'menu_options',group_data->'options','[]'::jsonb)));
   end loop;
   item_payload:=jsonb_build_object('id',item_id,'category_name',category->>'name','name',draft_item->>'name','description',coalesce(draft_item->>'description',''),
    'image_url',coalesce(draft_item->>'image_url',''),'item_type',coalesce(draft_item->>'item_type','simple'),'unit_label',coalesce(draft_item->>'unit_label','unidade'),
    'minimum_quantity',coalesce((draft_item->>'minimum_quantity')::numeric,1),'maximum_quantity',nullif(draft_item->>'maximum_quantity','')::numeric,
    'lead_time_hours',coalesce((draft_item->>'lead_time_hours')::integer,0),'active',coalesce((draft_item->>'active')::boolean,true),'available',coalesce((draft_item->>'available')::boolean,true),
    'metadata',coalesce(draft_item->'metadata','{}'::jsonb),'prices',prices,'option_groups',groups);
   saved:=private.save_menu_catalog_item(target_barbershop_id,item_payload);
   kept_items:=array_append(kept_items,(saved->>'id')::uuid); kept_categories:=array_append(kept_categories,(saved->>'category_id')::uuid);
   update public.menu_items set sort_order=item_position*10 where id=(saved->>'id')::uuid;
   update public.menu_categories set sort_order=category_position*10,active=coalesce((category->>'active')::boolean,true) where id=(saved->>'category_id')::uuid;
  end loop;
 end loop;
 delete from public.menu_items i where i.barbershop_id=target_barbershop_id and i.category_id in (select c.id from public.menu_categories c where c.menu_id=menu.id) and not(i.id=any(kept_items));
 delete from public.menu_categories c where c.menu_id=menu.id and not(c.id=any(kept_categories));
 delete from public.menu_option_groups g where g.menu_id=menu.id and not exists(select 1 from public.menu_item_option_groups link where link.option_group_id=g.id);
 if not private.menu_catalog_is_ready(menu.id) then raise exception 'O rascunho precisa ter ao menos um produto disponivel e todo produto disponivel precisa de preco' using errcode='23514'; end if;
 update public.online_menus set published=true,published_at=now() where id=menu.id;
 delete from private.menu_catalog_drafts where barbershop_id=target_barbershop_id;
 insert into public.menu_onboarding_events(barbershop_id,menu_id,actor_user_id,event_type,details)
 values(target_barbershop_id,menu.id,(select auth.uid()),'published',jsonb_build_object('source','catalog_draft','version',draft.version));
 return jsonb_build_object('published',true,'version',draft.version,'published_at',now());
end $$;

-- Onboarding exercises the same rules, with a deterministic valid composition.
do $patch$ declare definition text; patched text;
begin
 definition:=pg_get_functiondef('private.run_menu_test_order(uuid)'::regprocedure);
 patched:=replace(definition,'max_qty:=least(100,floor(coalesce(item.maximum_quantity,100))::integer);',
 'max_qty:=least(case when item.metadata->''quantity_rules'' is null or item.metadata->''quantity_rules''=''null''::jsonb then 100 else 10000 end,floor(coalesce(item.maximum_quantity,10000))::integer);');
 if patched=definition then raise exception 'Quantity onboarding bound anchor missing'; end if; definition:=patched;
 patched:=replace(definition,'''quantity'',qty,''selections'',selections)',
 $body$'quantity',qty,'selections',selections,'distribution',case when jsonb_array_length(coalesce(item.metadata->'quantity_rules'->'options','[]'::jsonb))>0 then jsonb_build_array(jsonb_build_object('name',item.metadata->'quantity_rules'->'options'->>0,'quantity',qty)) else '[]'::jsonb end)$body$);
 if patched=definition then raise exception 'Quantity onboarding composition anchor missing'; end if; definition:=patched;
 patched:=replace(definition,'qty:=qty+1;', 'qty:=qty+coalesce((item.metadata->''quantity_rules''->>''step'')::integer,1);');
 if patched=definition then raise exception 'Quantity onboarding step anchor missing'; end if; execute patched;
end $patch$;
