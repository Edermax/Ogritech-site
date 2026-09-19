-- Núcleo universal do catálogo e templates iniciais do Ogritech Cardápio.

create table public.menu_catalog_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check(code ~ '^[a-z][a-z0-9_-]{2,31}$'),
  segment text not null check(segment in ('pizzeria','snack_bar','restaurant','confectionery')),
  name text not null,
  description text not null default '',
  version integer not null default 1 check(version > 0),
  definition jsonb not null check(jsonb_typeof(definition)='object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.menu_catalog_templates(code,segment,name,description,definition)
values
('pizzeria','pizzeria','Pizzaria','Tamanhos, sabores, bordas e adicionais.',
 '{"theme":{"primary_color":"#B91C1C","accent_color":"#F59E0B"},"categories":["Pizzas tradicionais","Pizzas especiais","Bebidas","Sobremesas"],"recommended_item_type":"fractional"}'),
('snack-bar','snack_bar','Lanchonete e hamburgueria','Lanches, combos, adicionais e remoções.',
 '{"theme":{"primary_color":"#111827","accent_color":"#F97316"},"categories":["Hambúrgueres","Combos","Porções","Bebidas"],"recommended_item_type":"configurable"}'),
('restaurant','restaurant','Restaurante e marmitaria','Pratos, marmitas, acompanhamentos e cardápio por horário.',
 '{"theme":{"primary_color":"#166534","accent_color":"#FBBF24"},"categories":["Pratos do dia","Marmitas","Acompanhamentos","Bebidas"],"recommended_item_type":"configurable"}'),
('confectionery','confectionery','Confeitaria, bolos e doces','Produtos por unidade, peso, tamanho ou encomenda.',
 '{"theme":{"primary_color":"#9D174D","accent_color":"#F9A8D4"},"categories":["Bolos","Doces","Kits e caixas","Encomendas"],"recommended_item_type":"preorder"}')
on conflict(code) do update set name=excluded.name,description=excluded.description,definition=excluded.definition,active=true;

alter table public.online_menus
  add column template_code text references public.menu_catalog_templates(code) on delete set null,
  add column visual_identity jsonb not null default '{"primary_color":"#111827","accent_color":"#F59E0B"}'::jsonb
    check(jsonb_typeof(visual_identity)='object'),
  add column onboarding_step text not null default 'establishment'
    check(onboarding_step in ('establishment','segment','identity','catalog','fulfillment','payments','hours','test_order','review','ready'));

alter table public.menu_items
  add column item_type text not null default 'simple'
    check(item_type in ('simple','configurable','fractional','weight','quantity','preorder','combo')),
  add column unit_label text not null default 'unidade',
  add column minimum_quantity numeric(10,3) not null default 1 check(minimum_quantity > 0),
  add column maximum_quantity numeric(10,3) check(maximum_quantity is null or maximum_quantity >= minimum_quantity),
  add column lead_time_hours integer not null default 0 check(lead_time_hours between 0 and 8760);

create table public.menu_option_groups (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete restrict,
  menu_id uuid not null,
  name text not null check(char_length(trim(name)) between 1 and 100),
  selection_type text not null default 'multiple' check(selection_type in ('single','multiple','removal')),
  minimum_selections integer not null default 0 check(minimum_selections >= 0),
  maximum_selections integer not null default 1 check(maximum_selections > 0),
  free_selections integer not null default 0 check(free_selections >= 0),
  sort_order integer not null default 0 check(sort_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,barbershop_id),
  unique(menu_id,name),
  foreign key(menu_id,barbershop_id) references public.online_menus(id,barbershop_id) on delete cascade,
  check(minimum_selections <= maximum_selections and free_selections <= maximum_selections)
);

create table public.menu_options (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete restrict,
  option_group_id uuid not null,
  name text not null check(char_length(trim(name)) between 1 and 120),
  price_delta numeric(12,2) not null default 0 check(price_delta >= 0),
  maximum_quantity integer not null default 1 check(maximum_quantity > 0),
  available boolean not null default true,
  sort_order integer not null default 0 check(sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,barbershop_id),
  unique(option_group_id,name),
  foreign key(option_group_id,barbershop_id) references public.menu_option_groups(id,barbershop_id) on delete cascade
);

create table public.menu_item_option_groups (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete restrict,
  menu_item_id uuid not null,
  option_group_id uuid not null,
  sort_order integer not null default 0 check(sort_order >= 0),
  created_at timestamptz not null default now(),
  unique(menu_item_id,option_group_id),
  foreign key(menu_item_id,barbershop_id) references public.menu_items(id,barbershop_id) on delete cascade,
  foreign key(option_group_id,barbershop_id) references public.menu_option_groups(id,barbershop_id) on delete cascade
);

create table public.menu_availability_rules (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete restrict,
  menu_id uuid not null,
  category_id uuid,
  menu_item_id uuid,
  weekday integer check(weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  valid_from date,
  valid_until date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(menu_id,barbershop_id) references public.online_menus(id,barbershop_id) on delete cascade,
  foreign key(category_id,barbershop_id) references public.menu_categories(id,barbershop_id) on delete cascade,
  foreign key(menu_item_id,barbershop_id) references public.menu_items(id,barbershop_id) on delete cascade,
  check((category_id is null)::integer + (menu_item_id is null)::integer >= 1),
  check(starts_at < ends_at),
  check(valid_until is null or valid_from is null or valid_until >= valid_from)
);

create index menu_option_groups_tenant_menu_idx on public.menu_option_groups(barbershop_id,menu_id,active,sort_order);
create index menu_options_tenant_group_idx on public.menu_options(barbershop_id,option_group_id,available,sort_order);
create index menu_item_option_groups_tenant_item_idx on public.menu_item_option_groups(barbershop_id,menu_item_id,sort_order);
create index menu_item_option_groups_group_idx on public.menu_item_option_groups(option_group_id);
create index menu_availability_rules_tenant_menu_idx on public.menu_availability_rules(barbershop_id,menu_id,active,weekday);
create index menu_availability_rules_category_idx on public.menu_availability_rules(category_id) where category_id is not null;
create index menu_availability_rules_item_idx on public.menu_availability_rules(menu_item_id) where menu_item_id is not null;

create or replace function private.apply_menu_catalog_template(target_barbershop_id uuid,target_template_code text,target_slug text)
returns public.online_menus language plpgsql security definer set search_path=''
as $$
declare template public.menu_catalog_templates; menu public.online_menus; category_name text; position integer:=0;
begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id)
     or not private.business_has_product_access(target_barbershop_id,'menu') then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  if target_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$' then raise exception 'Endereço público inválido' using errcode='22023'; end if;
  select * into template from public.menu_catalog_templates where code=target_template_code and active;
  if template.id is null then raise exception 'Template inválido' using errcode='22023'; end if;
  select * into menu from public.online_menus where barbershop_id=target_barbershop_id for update;
  if menu.id is not null and exists(select 1 from public.menu_categories where menu_id=menu.id) then
    raise exception 'O template só pode ser aplicado antes da criação do catálogo' using errcode='23514';
  end if;
  insert into public.online_menus(barbershop_id,slug,title,template_code,visual_identity,onboarding_step,published,published_at)
  select target_barbershop_id,target_slug,b.name,template.code,template.definition->'theme','catalog',false,null
  from public.barbershops b where b.id=target_barbershop_id
  on conflict(barbershop_id) do update set template_code=excluded.template_code,visual_identity=excluded.visual_identity,onboarding_step='catalog',published=false,published_at=null
  returning * into menu;
  for category_name in select jsonb_array_elements_text(template.definition->'categories') loop
    position:=position+1;
    insert into public.menu_categories(barbershop_id,menu_id,name,sort_order)
    values(target_barbershop_id,menu.id,category_name,position*10);
  end loop;
  return menu;
end;
$$;
revoke all on function private.apply_menu_catalog_template(uuid,text,text) from public,anon,authenticated;
grant execute on function private.apply_menu_catalog_template(uuid,text,text) to authenticated;
create function public.apply_menu_catalog_template(target_barbershop_id uuid,target_template_code text,target_slug text)
returns public.online_menus language sql security invoker set search_path=''
as $$ select * from private.apply_menu_catalog_template(target_barbershop_id,target_template_code,target_slug) $$;
revoke all on function public.apply_menu_catalog_template(uuid,text,text) from public,anon;
grant execute on function public.apply_menu_catalog_template(uuid,text,text) to authenticated;

alter table public.menu_catalog_templates enable row level security;
alter table public.menu_option_groups enable row level security;
alter table public.menu_options enable row level security;
alter table public.menu_item_option_groups enable row level security;
alter table public.menu_availability_rules enable row level security;
revoke all on table public.menu_catalog_templates,public.menu_option_groups,public.menu_options,public.menu_item_option_groups,public.menu_availability_rules from anon;
grant select on table public.menu_catalog_templates to authenticated;
grant select,insert,update,delete on table public.menu_option_groups,public.menu_options,public.menu_item_option_groups,public.menu_availability_rules to authenticated;
create policy "Authenticated users view menu templates" on public.menu_catalog_templates for select to authenticated using(active or public.is_platform_admin());
create policy "Platform admins create menu templates" on public.menu_catalog_templates for insert to authenticated with check(public.is_platform_admin());
create policy "Platform admins update menu templates" on public.menu_catalog_templates for update to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
create policy "Platform admins delete menu templates" on public.menu_catalog_templates for delete to authenticated using(public.is_platform_admin());

do $policies$ declare table_name text; begin
  foreach table_name in array array['menu_option_groups','menu_options','menu_item_option_groups','menu_availability_rules'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_business_team(barbershop_id) and private.business_has_product_access(barbershop_id,''menu''))','Menu team views '||table_name,table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_business_manager(barbershop_id) and private.business_has_product_access(barbershop_id,''menu''))','Menu managers create '||table_name,table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_business_manager(barbershop_id) and private.business_has_product_access(barbershop_id,''menu'')) with check (public.is_business_manager(barbershop_id) and private.business_has_product_access(barbershop_id,''menu''))','Menu managers update '||table_name,table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_business_manager(barbershop_id) and private.business_has_product_access(barbershop_id,''menu''))','Menu managers delete '||table_name,table_name);
  end loop;
end $policies$;

-- O catálogo legado também passa a exigir assinatura válida do Cardápio.
do $policies$ declare table_name text; begin
  foreach table_name in array array['online_menus','menu_categories','menu_items','menu_item_prices'] loop
    execute format('drop policy if exists %I on public.%I','Business team views '||table_name,table_name);
    execute format('drop policy if exists %I on public.%I','Business managers create '||table_name,table_name);
    execute format('drop policy if exists %I on public.%I','Business managers update '||table_name,table_name);
    execute format('drop policy if exists %I on public.%I','Business managers delete '||table_name,table_name);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_business_team(barbershop_id) and private.business_has_product_access(barbershop_id,''menu''))','Business team views '||table_name,table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_business_manager(barbershop_id) and private.business_has_product_access(barbershop_id,''menu''))','Business managers create '||table_name,table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_business_manager(barbershop_id) and private.business_has_product_access(barbershop_id,''menu'')) with check (public.is_business_manager(barbershop_id) and private.business_has_product_access(barbershop_id,''menu''))','Business managers update '||table_name,table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_business_manager(barbershop_id) and private.business_has_product_access(barbershop_id,''menu''))','Business managers delete '||table_name,table_name);
  end loop;
end $policies$;

do $triggers$ declare table_name text; begin
  foreach table_name in array array['menu_catalog_templates','menu_option_groups','menu_options','menu_availability_rules'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.ogritech_set_updated_at()',table_name||'_set_updated_at',table_name);
  end loop;
end $triggers$;
