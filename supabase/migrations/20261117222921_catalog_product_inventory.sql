-- Optional, whole-unit inventory shared by all prices/options of a product.
-- No opening balances or deductions are inferred for existing products/orders.
create table private.catalog_stock (
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 item_id uuid not null, item_name text not null,
 enabled boolean not null default false,
 quantity bigint not null default 0 check(quantity between 0 and 9007199254740991),
 version bigint not null default 0,
 primary key(barbershop_id,item_id)
);
-- Deliberately no FK to menu_items: deleting/rebuilding a catalog preserves its ledger.
create table private.catalog_stock_movements (
 id bigint generated always as identity primary key,
 barbershop_id uuid not null, item_id uuid not null,
 item_name text not null, kind text not null,
 delta bigint not null, quantity_before bigint not null, quantity_after bigint not null,
 reason text not null, actor_id uuid, order_id uuid, order_number bigint,
 request_id uuid, request_payload jsonb,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(barbershop_id,item_id) references private.catalog_stock(barbershop_id,item_id) on delete cascade,
 check(quantity_after=quantity_before+delta and quantity_before>=0 and quantity_after>=0),
 check(kind in ('enable','disable','entry','exit','adjust','order','return')),
 unique(barbershop_id,request_id)
);
create index catalog_stock_history on private.catalog_stock_movements(barbershop_id,item_id,id desc);
create index catalog_stock_business_history on private.catalog_stock_movements(barbershop_id,id desc);
create table private.catalog_stock_allocations (
 barbershop_id uuid not null, item_id uuid not null, order_id uuid not null,
 quantity bigint not null check(quantity>0), released boolean not null default false,
 primary key(barbershop_id,order_id,item_id),
 foreign key(barbershop_id,item_id) references private.catalog_stock(barbershop_id,item_id) on delete cascade
);
create index catalog_stock_allocations_item on private.catalog_stock_allocations(barbershop_id,item_id);
alter table private.catalog_stock enable row level security;
alter table private.catalog_stock_movements enable row level security;
alter table private.catalog_stock_allocations enable row level security;
revoke all on private.catalog_stock,private.catalog_stock_movements,private.catalog_stock_allocations from public,anon,authenticated;

create function private.catalog_inventory_access(tenant uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(private.business_product_is_active(tenant,'menu') and private.menu_has_orders(tenant),false)
$$;
revoke all on function private.catalog_inventory_access(uuid) from public,anon,authenticated;

create function private.catalog_inventory(target_barbershop_id uuid,target_item_id uuid default null,before_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_business_manager(target_barbershop_id)
 or not private.catalog_inventory_access(target_barbershop_id) then
  raise exception 'Controle de estoque disponível para a gestão no plano Completo ativo' using errcode='42501';
 end if;
 if before_id is not null and before_id<=0 then raise exception 'Página inválida' using errcode='22023'; end if;
 return jsonb_build_object(
 'products',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('archived',not exists(select 1 from public.menu_items i where i.id=s.item_id and i.barbershop_id=s.barbershop_id)))
 from private.catalog_stock s where s.barbershop_id=target_barbershop_id and (target_item_id is null or s.item_id=target_item_id)),'[]'::jsonb),
 'movements',coalesce((select jsonb_agg(to_jsonb(m)-'request_payload'-'request_id'-'actor_id'-'order_id' order by m.id desc) from (
 select * from private.catalog_stock_movements s where s.barbershop_id=target_barbershop_id
 and (target_item_id is null or s.item_id=target_item_id) and (before_id is null or s.id<before_id) order by s.id desc limit 50
 ) m),'[]'::jsonb));
end $$;

create function private.catalog_stock_command(target_barbershop_id uuid,target_item_id uuid,operation text,
 supplied_quantity numeric,reason text,request_id uuid,expected_version bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare stock private.catalog_stock; product public.menu_items; prior private.catalog_stock_movements;
 payload jsonb; new_quantity bigint; change bigint; clean_reason text:=btrim(reason);
begin
 if auth.uid() is null or not public.is_business_manager(target_barbershop_id)
 or not private.catalog_inventory_access(target_barbershop_id) then
  raise exception 'Controle de estoque disponível para a gestão no plano Completo ativo' using errcode='42501';
 end if;
 if request_id is null or target_item_id is null or operation is null
 or operation not in ('enable','disable','entry','exit','adjust') or expected_version is null or expected_version<0
 or clean_reason is null or length(clean_reason) not between 3 and 300
 or (supplied_quantity is not null and (supplied_quantity::text in ('NaN','Infinity','-Infinity') or supplied_quantity<0 or supplied_quantity>1000000000 or supplied_quantity<>trunc(supplied_quantity))) then
  raise exception 'Informe unidades inteiras válidas e um motivo de 3 a 300 caracteres' using errcode='22023';
 end if;
 payload:=jsonb_build_object('item',target_item_id,'operation',operation,'quantity',supplied_quantity,'reason',clean_reason,'version',expected_version,'actor',auth.uid());
 -- Serialize retry keys across products, then stock commands/sales for this item.
 perform pg_advisory_xact_lock(hashtextextended(target_barbershop_id::text||request_id::text,711));
 select * into prior from private.catalog_stock_movements m where m.barbershop_id=target_barbershop_id and m.request_id=catalog_stock_command.request_id;
 if prior.id is not null then
  if prior.request_payload is distinct from payload then raise exception 'Chave de repetição usada com dados diferentes' using errcode='23505'; end if;
  return jsonb_build_object('quantity',prior.quantity_after,'replayed',true);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(target_barbershop_id::text||target_item_id::text,712));
 select * into product from public.menu_items i where i.barbershop_id=target_barbershop_id and i.id=target_item_id;
 if product.id is null then raise exception 'Salve o produto antes de configurar o estoque' using errcode='22023'; end if;
 select * into stock from private.catalog_stock s where s.barbershop_id=target_barbershop_id and s.item_id=target_item_id for update;
 if stock.item_id is null then
  if operation<>'enable' or supplied_quantity is null then raise exception 'Informe o saldo inicial para ativar o estoque' using errcode='22023'; end if;
  insert into private.catalog_stock(barbershop_id,item_id,item_name) values(target_barbershop_id,target_item_id,product.name) returning * into stock;
 elsif operation='enable' and supplied_quantity is not null then
  raise exception 'O saldo existente é preservado; use ajuste para corrigi-lo' using errcode='22023';
 end if;
 if stock.version<>expected_version then raise exception 'O estoque mudou. Atualize os dados e revise a movimentação' using errcode='40001'; end if;
 if (operation='enable' and stock.enabled) or (operation<>'enable' and not stock.enabled) then
  raise exception 'Atualize os dados e confira se o controle está ativado' using errcode='22023';
 end if;
 if operation in ('entry','exit','adjust') and (supplied_quantity is null or (operation in ('entry','exit') and supplied_quantity<=0)) then
  raise exception 'Informe uma quantidade válida' using errcode='22023';
 end if;
 if operation='disable' and supplied_quantity is not null then raise exception 'Desativar preserva o saldo' using errcode='22023'; end if;
 new_quantity:=case operation when 'entry' then stock.quantity+supplied_quantity::bigint when 'exit' then stock.quantity-supplied_quantity::bigint when 'adjust' then supplied_quantity::bigint when 'enable' then coalesce(supplied_quantity::bigint,stock.quantity) else stock.quantity end;
 if new_quantity<0 or new_quantity>9007199254740991 then raise exception 'Saldo de estoque insuficiente ou fora do limite' using errcode='23514'; end if;
 change:=new_quantity-stock.quantity;
 update private.catalog_stock s set quantity=new_quantity,enabled=(operation<>'disable'),item_name=product.name,version=s.version+1 where s.barbershop_id=target_barbershop_id and s.item_id=target_item_id;
 insert into private.catalog_stock_movements(barbershop_id,item_id,item_name,kind,delta,quantity_before,quantity_after,reason,actor_id,request_id,request_payload)
 values(target_barbershop_id,target_item_id,product.name,operation,change,stock.quantity,new_quantity,clean_reason,auth.uid(),request_id,payload);
 return jsonb_build_object('quantity',new_quantity,'replayed',false);
end $$;

-- Internal checkout hook: called only after validated, server-priced order lines exist.
-- The whole checkout rolls back if any tracked item lacks units.
create function private.reserve_catalog_inventory(target_order_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare sale public.menu_orders; line record; stock private.catalog_stock;
begin
 select * into sale from public.menu_orders where id=target_order_id for update;
 if sale.id is null or sale.is_test then return; end if;
 for line in select i.menu_item_id,sum(i.quantity)::bigint quantity,max(i.item_name) item_name from public.menu_order_items i
 where i.order_id=sale.id and i.barbershop_id=sale.barbershop_id group by i.menu_item_id order by i.menu_item_id loop
  perform pg_advisory_xact_lock(hashtextextended(sale.barbershop_id::text||line.menu_item_id::text,712));
  select * into stock from private.catalog_stock s where s.barbershop_id=sale.barbershop_id and s.item_id=line.menu_item_id for update;
  if stock.item_id is null or not stock.enabled then continue; end if;
  if exists(select 1 from private.catalog_stock_allocations a where a.barbershop_id=sale.barbershop_id and a.order_id=sale.id and a.item_id=line.menu_item_id) then continue; end if;
  if stock.quantity<line.quantity then raise exception 'Estoque insuficiente para %. Atualize sua seleção e tente novamente.',line.item_name using errcode='23514'; end if;
  update private.catalog_stock s set quantity=s.quantity-line.quantity,version=s.version+1,item_name=line.item_name where s.barbershop_id=stock.barbershop_id and s.item_id=stock.item_id;
  insert into private.catalog_stock_allocations(barbershop_id,item_id,order_id,quantity) values(sale.barbershop_id,stock.item_id,sale.id,line.quantity);
  insert into private.catalog_stock_movements(barbershop_id,item_id,item_name,kind,delta,quantity_before,quantity_after,reason,order_id,order_number)
  values(sale.barbershop_id,stock.item_id,line.item_name,'order',-line.quantity,stock.quantity,stock.quantity-line.quantity,'Pedido recebido',sale.id,sale.order_number);
 end loop;
end $$;

-- Refusals/cancellations return the originally deducted units, even after disabling
-- tracking or downgrading. Reopening a refused order must reserve those units again.
create function private.sync_catalog_inventory_status() returns trigger
language plpgsql security definer set search_path='' as $$
declare allocation record; stock private.catalog_stock; release_units boolean; change bigint;
begin
 if new.is_test or new.status is not distinct from old.status then return null; end if;
 release_units:=new.status in ('cancelled','rejected');
 for allocation in select * from private.catalog_stock_allocations a where a.barbershop_id=new.barbershop_id and a.order_id=new.id order by a.item_id for update loop
  if allocation.released=release_units then continue; end if;
  select * into stock from private.catalog_stock s where s.barbershop_id=allocation.barbershop_id and s.item_id=allocation.item_id for update;
  change:=case when release_units then allocation.quantity else -allocation.quantity end;
  if stock.quantity+change<0 then raise exception 'Estoque insuficiente para reabrir o pedido. Reponha o saldo antes de confirmar.' using errcode='23514'; end if;
  update private.catalog_stock s set quantity=s.quantity+change,version=s.version+1 where s.barbershop_id=stock.barbershop_id and s.item_id=stock.item_id;
  update private.catalog_stock_allocations a set released=release_units where a.barbershop_id=allocation.barbershop_id and a.order_id=allocation.order_id and a.item_id=allocation.item_id;
  insert into private.catalog_stock_movements(barbershop_id,item_id,item_name,kind,delta,quantity_before,quantity_after,reason,actor_id,order_id,order_number)
  values(new.barbershop_id,stock.item_id,stock.item_name,case when release_units then 'return' else 'order' end,change,stock.quantity,stock.quantity+change,
  case when release_units then 'Pedido recusado ou cancelado' else 'Pedido reaberto' end,auth.uid(),new.id,new.order_number);
 end loop;
 return null;
end $$;
create trigger sync_catalog_inventory_status after update of status on public.menu_orders for each row execute function private.sync_catalog_inventory_status();
revoke all on function private.reserve_catalog_inventory(uuid),private.sync_catalog_inventory_status() from public,anon,authenticated;

do $patch$ declare definition text; patched text;
begin
 definition:=pg_get_functiondef('private.create_menu_order_core(text,text,text,text,text,jsonb,text,jsonb,boolean,uuid,timestamptz,text,boolean)'::regprocedure);
 patched:=replace(definition,'insert into private.menu_order_idempotency(menu_id,client_request_id,request_hash,response)',
 'perform private.reserve_catalog_inventory(result.id); insert into private.menu_order_idempotency(menu_id,client_request_id,request_hash,response)');
 if patched=definition then raise exception 'Checkout inventory anchor missing'; end if; execute patched;
 -- Add only a public availability flag; balances and ledger never enter public JSON.
 definition:=pg_get_functiondef('private.public_menu(text)'::regprocedure);
 patched:=replace(definition,'return result;',
 $body$result:=jsonb_set(result,'{categories}',coalesce((select jsonb_agg(jsonb_set(category,'{items}',coalesce((select jsonb_agg(item||jsonb_build_object('stock_available',not private.catalog_inventory_access(tenant) or not exists(select 1 from private.catalog_stock stock where stock.barbershop_id=tenant and stock.item_id=(item->>'id')::uuid and stock.enabled and stock.quantity<greatest(1,coalesce((item->>'minimum_quantity')::numeric,1)))) order by item_position) from jsonb_array_elements(category->'items') with ordinality items(item,item_position)),'[]'::jsonb)) order by category_position) from jsonb_array_elements(result->'categories') with ordinality categories(category,category_position)),'[]'::jsonb)); return result;$body$);
 if patched=definition then raise exception 'Public inventory anchor missing'; end if; execute patched;
 definition:=pg_get_functiondef('private.menu_onboarding_status(uuid)'::regprocedure);
 patched:=replace(definition,'''segment'',','''inventory_enabled'',private.catalog_inventory_access(target_barbershop_id),''segment'',');
 if patched=definition then raise exception 'Inventory entitlement anchor missing'; end if; execute patched;
end $patch$;

create function public.catalog_inventory(target_barbershop_id uuid,target_item_id uuid default null,before_id bigint default null)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.catalog_inventory(target_barbershop_id,target_item_id,before_id) $$;
create function public.catalog_stock_command(target_barbershop_id uuid,target_item_id uuid,operation text,supplied_quantity numeric,reason text,request_id uuid,expected_version bigint)
returns jsonb language sql security invoker set search_path='' as $$ select private.catalog_stock_command(target_barbershop_id,target_item_id,operation,supplied_quantity,reason,request_id,expected_version) $$;
revoke all on function private.catalog_inventory(uuid,uuid,bigint),public.catalog_inventory(uuid,uuid,bigint),
 private.catalog_stock_command(uuid,uuid,text,numeric,text,uuid,bigint),public.catalog_stock_command(uuid,uuid,text,numeric,text,uuid,bigint) from public,anon,authenticated;
grant execute on function private.catalog_inventory(uuid,uuid,bigint),public.catalog_inventory(uuid,uuid,bigint),
 private.catalog_stock_command(uuid,uuid,text,numeric,text,uuid,bigint),public.catalog_stock_command(uuid,uuid,text,numeric,text,uuid,bigint) to authenticated;

comment on table private.catalog_stock_movements is 'Append-only application ledger. Corrections are compensating movements; no customer data. Tenant deletion removes its ledger.';

-- Advertise only on the Complete commercial family; no price or contract changes.
update public.saas_plans set features=features||'["Estoque por produto e histórico de movimentações"]'::jsonb where code='catalogo-completo' and menu_offer_code='encomendas';
