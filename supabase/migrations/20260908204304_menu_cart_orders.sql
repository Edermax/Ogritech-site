-- Carrinho e pedidos: o backend é a única fonte de preços, adicionais e totais.

alter table public.menu_orders
  add column client_request_id uuid,
  add column scheduled_for timestamptz,
  add column delivery_zone_code text;
create unique index menu_orders_request_key on public.menu_orders(menu_id,client_request_id) where client_request_id is not null;

create table public.menu_delivery_zones (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete restrict,
  menu_id uuid not null,
  code text not null check(code ~ '^[a-z0-9][a-z0-9_-]{1,31}$'),
  name text not null check(char_length(trim(name)) between 1 and 120),
  fee numeric(12,2) not null default 0 check(fee >= 0),
  minimum_order numeric(12,2) not null default 0 check(minimum_order >= 0),
  estimated_minutes integer check(estimated_minutes between 1 and 1440),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,barbershop_id),unique(menu_id,code),
  foreign key(menu_id,barbershop_id) references public.online_menus(id,barbershop_id) on delete cascade
);

create table public.menu_order_item_options (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete restrict,
  order_item_id uuid not null,
  menu_option_id uuid,
  group_name text not null,
  option_name text not null,
  quantity integer not null check(quantity > 0),
  unit_price_delta numeric(12,2) not null check(unit_price_delta >= 0),
  line_total numeric(12,2) generated always as (quantity*unit_price_delta) stored,
  created_at timestamptz not null default now(),
  foreign key(order_item_id,barbershop_id) references public.menu_order_items(id,barbershop_id) on delete cascade,
  foreign key(menu_option_id,barbershop_id) references public.menu_options(id,barbershop_id) on delete set null(menu_option_id)
);
create index menu_delivery_zones_tenant_menu_idx on public.menu_delivery_zones(barbershop_id,menu_id,active);
create index menu_order_item_options_tenant_item_idx on public.menu_order_item_options(barbershop_id,order_item_id);
create index menu_order_item_options_option_idx on public.menu_order_item_options(menu_option_id) where menu_option_id is not null;

create table private.menu_order_idempotency (
  menu_id uuid not null references public.online_menus(id) on delete cascade,
  client_request_id uuid not null,
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '24 hours',
  primary key(menu_id,client_request_id)
);
revoke all on table private.menu_order_idempotency from public,anon,authenticated;

create or replace function private.business_product_is_active(target_barbershop_id uuid,target_product_code text)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.saas_clients client
    join public.billing_customers customer on customer.saas_client_id=client.id
    join public.platform_subscriptions subscription on subscription.billing_customer_id=customer.id
    join public.platform_products product on product.id=subscription.product_id
    where client.barbershop_id=target_barbershop_id and client.deleted_at is null
      and product.code=target_product_code and product.active
      and subscription.status in ('trial','active','grace_period')
      and (subscription.current_period_end is null or subscription.current_period_end>now())
  )
$$;
revoke all on function private.business_product_is_active(uuid,text) from public,anon,authenticated;

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
      'delivery_fee',menu.delivery_fee,'estimated_minutes',menu.estimated_minutes,'visual_identity',menu.visual_identity),
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

create function private.public_create_menu_order_v2(
  target_slug text,supplied_name text,supplied_email text,supplied_phone text,
  target_fulfillment_type text,supplied_address jsonb,supplied_notes text,supplied_items jsonb,
  accepted_privacy boolean,client_request_id uuid,requested_for timestamptz default null,website text default ''
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,extensions
as $$
declare
  menu public.online_menus; result public.menu_orders; item jsonb; selection jsonb; selected_price public.menu_item_prices; selected_item public.menu_items;
  group_row public.menu_option_groups; option_row public.menu_options; order_item public.menu_order_items; zone public.menu_delivery_zones;
  clean_name text:=trim(supplied_name); clean_email text:=lower(trim(supplied_email)); clean_phone text:=regexp_replace(supplied_phone,'\D','','g'); fulfillment text:=lower(trim(target_fulfillment_type));
  running_subtotal numeric(12,2):=0; base_price numeric(12,2); option_total numeric(12,2); delivery_amount numeric(12,2):=0; required_minimum numeric(12,2); qty integer; selected_count integer; free_remaining integer; selection_qty integer; attempt_id bigint; secret_token text; response_payload jsonb; fingerprint text; prior record;
begin
  if coalesce(trim(website),'')<>'' or not accepted_privacy or client_request_id is null then raise exception 'Dados do pedido inválidos' using errcode='22023'; end if;
  if length(clean_name) not between 2 and 150 or length(clean_phone) not between 10 and 15 or (clean_email<>'' and (length(clean_email)>320 or clean_email!~'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')) or jsonb_typeof(supplied_items)<>'array' or jsonb_array_length(supplied_items) not between 1 and 50 or length(coalesce(supplied_notes,''))>2000 then raise exception 'Dados do pedido inválidos' using errcode='22023'; end if;
  select m.* into menu from public.online_menus m join public.barbershops b on b.id=m.barbershop_id where lower(m.slug)=lower(trim(target_slug)) and m.published and b.active and b.deleted_at is null and private.business_product_is_active(m.barbershop_id,'menu');
  if menu.id is null then raise exception 'Cardápio indisponível' using errcode='22023'; end if;
  fingerprint:=encode(digest(jsonb_build_object('name',clean_name,'email',clean_email,'phone',clean_phone,'fulfillment',fulfillment,'address',supplied_address,'notes',supplied_notes,'items',supplied_items,'requested_for',requested_for)::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(menu.id::text||client_request_id::text,0));
  select request_hash,response into prior from private.menu_order_idempotency where menu_id=menu.id and private.menu_order_idempotency.client_request_id=public_create_menu_order_v2.client_request_id and expires_at>now();
  if prior.request_hash is not null then if prior.request_hash<>fingerprint then raise exception 'Chave de repetição usada com dados diferentes' using errcode='23505'; end if; return prior.response; end if;
  if fulfillment not in ('pickup','delivery') or (fulfillment='pickup' and not menu.accepts_pickup) or (fulfillment='delivery' and (not menu.accepts_delivery or jsonb_typeof(supplied_address)<>'object')) then raise exception 'Forma de entrega inválida' using errcode='22023'; end if;
  if requested_for is not null and (requested_for<now() or requested_for>now()+interval '90 days') then raise exception 'Agendamento inválido' using errcode='22023'; end if;
  if fulfillment='delivery' and exists(select 1 from public.menu_delivery_zones z where z.menu_id=menu.id and z.active) then
    select * into zone from public.menu_delivery_zones z where z.menu_id=menu.id and z.active and z.code=supplied_address->>'zone_code';
    if zone.id is null then raise exception 'Área de entrega inválida' using errcode='22023'; end if; delivery_amount:=zone.fee;
  elsif fulfillment='delivery' then delivery_amount:=menu.delivery_fee; end if;
  required_minimum:=greatest(menu.minimum_order,coalesce(zone.minimum_order,0)); attempt_id:=private.register_commercial_attempt(menu.barbershop_id,'order',clean_phone,10); secret_token:=encode(gen_random_bytes(24),'hex');
  insert into public.menu_orders(barbershop_id,menu_id,customer_name,customer_email,customer_phone,fulfillment_type,delivery_address,notes,currency,delivery_fee,consent_at,public_token_hash,client_request_id,scheduled_for,delivery_zone_code)
  values(menu.barbershop_id,menu.id,clean_name,clean_email,clean_phone,fulfillment,case when fulfillment='delivery' then supplied_address else null end,trim(coalesce(supplied_notes,'')),menu.currency,delivery_amount,now(),encode(digest(secret_token,'sha256'),'hex'),client_request_id,requested_for,zone.code) returning * into result;
  for item in select value from jsonb_array_elements(supplied_items) loop
    selected_price:=null; selected_item:=null;
    begin qty:=(item->>'quantity')::integer; exception when others then raise exception 'Quantidade inválida' using errcode='22023'; end;
    if qty not between 1 and 100 or jsonb_typeof(coalesce(item->'selections','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(item->'selections','[]'::jsonb))>50 then raise exception 'Item inválido' using errcode='22023'; end if;
    select pr.* into selected_price from public.menu_item_prices pr join public.menu_items i on i.id=pr.menu_item_id join public.menu_categories c on c.id=i.category_id where pr.id=(item->>'menu_item_price_id')::uuid and pr.barbershop_id=menu.barbershop_id and pr.active and i.active and i.available and c.active and c.menu_id=menu.id;
    select i.* into selected_item from public.menu_items i join public.menu_categories c on c.id=i.category_id where i.id=selected_price.menu_item_id and c.menu_id=menu.id;
    if selected_price.id is null or qty<selected_item.minimum_quantity or (selected_item.maximum_quantity is not null and qty>selected_item.maximum_quantity) or (selected_item.lead_time_hours>0 and (requested_for is null or requested_for<now()+make_interval(hours=>selected_item.lead_time_hours))) then raise exception 'Item indisponível ou fora dos limites' using errcode='22023'; end if;
    if exists(
      select 1 from jsonb_array_elements(coalesce(item->'selections','[]'::jsonb)) as choices(choice)
      left join public.menu_options o on o.id=(choice->>'menu_option_id')::uuid
      left join public.menu_option_groups g on g.id=o.option_group_id
      left join public.menu_item_option_groups link on link.option_group_id=g.id and link.menu_item_id=selected_item.id
      where o.id is null or not o.available or g.id is null or not g.active or link.menu_item_id is null
        or (choice->>'quantity')::integer not between 1 and o.maximum_quantity
    ) then raise exception 'Seleção de adicional inválida' using errcode='22023'; end if;
    option_total:=0;
    for group_row in select g.* from public.menu_item_option_groups link join public.menu_option_groups g on g.id=link.option_group_id where link.menu_item_id=selected_item.id and g.active loop
      select coalesce(sum((choice->>'quantity')::integer),0) into selected_count from jsonb_array_elements(coalesce(item->'selections','[]'::jsonb)) as choices(choice) join public.menu_options o on o.id=(choice->>'menu_option_id')::uuid where o.option_group_id=group_row.id;
      if selected_count<group_row.minimum_selections or selected_count>group_row.maximum_selections then raise exception 'Seleções obrigatórias inválidas' using errcode='22023'; end if;
    end loop;
    insert into public.menu_order_items(barbershop_id,order_id,menu_item_id,menu_item_price_id,item_name,price_label,quantity,unit_price,notes)
    values(menu.barbershop_id,result.id,selected_item.id,selected_price.id,selected_item.name,selected_price.label,qty,coalesce(selected_price.promotional_price,selected_price.price),left(coalesce(item->>'notes',''),500)) returning * into order_item;
    for selection in select choice from jsonb_array_elements(coalesce(item->'selections','[]'::jsonb)) as choices(choice) join public.menu_options o on o.id=(choice->>'menu_option_id')::uuid join public.menu_option_groups g on g.id=o.option_group_id join public.menu_item_option_groups link on link.option_group_id=g.id and link.menu_item_id=selected_item.id where o.available and g.active order by g.id,o.price_delta,o.id loop
      select o.* into option_row from public.menu_options o where o.id=(selection->>'menu_option_id')::uuid;
      select g.* into group_row from public.menu_option_groups g where g.id=option_row.option_group_id;
      begin selection_qty:=(selection->>'quantity')::integer; exception when others then raise exception 'Quantidade de adicional inválida' using errcode='22023'; end;
      if selection_qty not between 1 and option_row.maximum_quantity then raise exception 'Quantidade de adicional inválida' using errcode='22023'; end if;
      select greatest(group_row.free_selections-(coalesce(sum(opt.quantity),0)/qty),0) into free_remaining from public.menu_order_item_options opt where opt.order_item_id=order_item.id and opt.group_name=group_row.name and opt.unit_price_delta=0;
      insert into public.menu_order_item_options(barbershop_id,order_item_id,menu_option_id,group_name,option_name,quantity,unit_price_delta)
      values(menu.barbershop_id,order_item.id,option_row.id,group_row.name,option_row.name,selection_qty*qty,case when free_remaining>=selection_qty then 0 else option_row.price_delta end);
      option_total:=option_total+(case when free_remaining>=selection_qty then 0 else option_row.price_delta*selection_qty end);
    end loop;
    base_price:=coalesce(selected_price.promotional_price,selected_price.price)+option_total;
    update public.menu_order_items set unit_price=base_price where id=order_item.id;
    running_subtotal:=running_subtotal+base_price*qty; if running_subtotal>1000000 then raise exception 'Valor do pedido inválido' using errcode='22023'; end if;
  end loop;
  if running_subtotal<required_minimum then raise exception 'Pedido abaixo do valor mínimo' using errcode='22023'; end if;
  update public.menu_orders set subtotal=running_subtotal where id=result.id returning * into result; update private.public_commercial_attempts set succeeded=true where id=attempt_id;
  response_payload:=jsonb_build_object('reference',result.public_reference,'token',secret_token,'status',result.status,'subtotal',result.subtotal,'delivery_fee',result.delivery_fee,'total_amount',result.total_amount,'scheduled_for',result.scheduled_for);
  insert into private.menu_order_idempotency(menu_id,client_request_id,request_hash,response) values(menu.id,client_request_id,fingerprint,response_payload); return response_payload;
exception when invalid_text_representation then raise exception 'Item inválido' using errcode='22023';
end $$;

create function public.public_create_menu_order_v2(target_slug text,supplied_name text,supplied_email text,supplied_phone text,target_fulfillment_type text,supplied_address jsonb,supplied_notes text,supplied_items jsonb,accepted_privacy boolean,client_request_id uuid,requested_for timestamptz default null,website text default '')
returns jsonb language sql security invoker set search_path=pg_catalog,public,private
as $$ select private.public_create_menu_order_v2(target_slug,supplied_name,supplied_email,supplied_phone,target_fulfillment_type,supplied_address,supplied_notes,supplied_items,accepted_privacy,client_request_id,requested_for,website) $$;
revoke all on function private.public_create_menu_order_v2(text,text,text,text,text,jsonb,text,jsonb,boolean,uuid,timestamptz,text) from public;
grant execute on function private.public_create_menu_order_v2(text,text,text,text,text,jsonb,text,jsonb,boolean,uuid,timestamptz,text) to anon,authenticated;
revoke all on function public.public_create_menu_order_v2(text,text,text,text,text,jsonb,text,jsonb,boolean,uuid,timestamptz,text) from public;
grant execute on function public.public_create_menu_order_v2(text,text,text,text,text,jsonb,text,jsonb,boolean,uuid,timestamptz,text) to anon,authenticated;

alter table public.menu_delivery_zones enable row level security; alter table public.menu_order_item_options enable row level security;
revoke all on table public.menu_delivery_zones,public.menu_order_item_options from anon;
grant select,insert,update,delete on public.menu_delivery_zones to authenticated; grant select on public.menu_order_item_options to authenticated;
create policy "Menu team views delivery zones" on public.menu_delivery_zones for select to authenticated using(public.is_business_team(barbershop_id) and private.business_has_product_access(barbershop_id,'menu'));
create policy "Menu managers create delivery zones" on public.menu_delivery_zones for insert to authenticated with check(public.is_business_manager(barbershop_id) and private.business_has_product_access(barbershop_id,'menu'));
create policy "Menu managers update delivery zones" on public.menu_delivery_zones for update to authenticated using(public.is_business_manager(barbershop_id) and private.business_has_product_access(barbershop_id,'menu')) with check(public.is_business_manager(barbershop_id) and private.business_has_product_access(barbershop_id,'menu'));
create policy "Menu managers delete delivery zones" on public.menu_delivery_zones for delete to authenticated using(public.is_business_manager(barbershop_id) and private.business_has_product_access(barbershop_id,'menu'));
create policy "Menu team views order item options" on public.menu_order_item_options for select to authenticated using(public.is_business_team(barbershop_id) and private.business_has_product_access(barbershop_id,'menu'));
create trigger menu_delivery_zones_set_updated_at before update on public.menu_delivery_zones for each row execute function public.ogritech_set_updated_at();
