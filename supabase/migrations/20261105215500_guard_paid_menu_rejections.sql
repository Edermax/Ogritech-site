-- A paid order cannot be rejected without a separate refund workflow.
create or replace function private.update_menu_order_operation(target_barbershop_id uuid,target_order_id uuid,target_action text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare current_order public.menu_orders; changed public.menu_orders;
begin
  if (select auth.uid()) is null or not public.is_business_manager(target_barbershop_id)
     or not private.business_has_product_access(target_barbershop_id,'menu') then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  select * into current_order from public.menu_orders
    where id=target_order_id and barbershop_id=target_barbershop_id for update;
  if current_order.id is null or current_order.is_test then
    raise exception 'Pedido indisponível' using errcode='22023';
  end if;
  if target_action='confirm' and current_order.status='received' then
    update public.menu_orders set status='confirmed',confirmed_at=now() where id=current_order.id returning * into changed;
  elsif target_action='reject' and current_order.status='received' and current_order.payment_status='pending' then
    update public.menu_orders set status='rejected',cancelled_at=now() where id=current_order.id returning * into changed;
  elsif target_action='complete' and current_order.status='confirmed' then
    update public.menu_orders set status='completed',completed_at=now() where id=current_order.id returning * into changed;
  elsif target_action='mark_paid' and current_order.payment_status='pending' and current_order.status not in ('rejected','cancelled') then
    update public.menu_orders set payment_status='paid' where id=current_order.id returning * into changed;
  else
    raise exception 'Transição de pedido inválida' using errcode='22023';
  end if;
  return jsonb_build_object('id',changed.id,'status',changed.status,'payment_status',changed.payment_status);
end $$;
