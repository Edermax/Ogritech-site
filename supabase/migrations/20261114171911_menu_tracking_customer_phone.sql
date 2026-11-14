-- The tracking token already protects the customer's name and order details.
-- Return the same order's phone so customer-initiated summaries stay complete.
create or replace function private.public_get_menu_order(target_reference text,target_token text)
returns jsonb language sql stable security definer set search_path='' as $$
 select private.get_menu_order_tracking_data(target_reference,target_token)
  ||jsonb_build_object('order_number',o.order_number,'order_code',
    case when o.is_test then 'TESTE' else '#'||o.order_number end,
    'customer_phone',o.customer_phone)
 from public.menu_orders o
 where o.public_reference=upper(trim(target_reference))
  and o.public_token_hash=encode(extensions.digest(target_token,'sha256'),'hex')
$$;

revoke all on function private.public_get_menu_order(text,text) from public,anon,authenticated;
grant execute on function private.public_get_menu_order(text,text) to anon,authenticated;
