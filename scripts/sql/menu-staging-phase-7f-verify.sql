select jsonb_build_object(
  'businesses',(select count(*) from public.barbershops where id='7f000000-0000-4000-8000-000000000001'),
  'menus',(select count(*) from public.online_menus where id='7f000000-0000-4000-8000-000000000003' and published),
  'categories',(select count(*) from public.menu_categories where menu_id='7f000000-0000-4000-8000-000000000003'),
  'orders',(select count(*) from public.menu_orders where barbershop_id='7f000000-0000-4000-8000-000000000001' and not is_test),
  'unique_requests',(select count(distinct client_request_id) from public.menu_orders where barbershop_id='7f000000-0000-4000-8000-000000000001' and not is_test),
  'received_orders',(select count(*) from public.menu_orders where barbershop_id='7f000000-0000-4000-8000-000000000001' and status='received' and not is_test),
  'invalid_emails',(select count(*) from public.menu_orders where barbershop_id='7f000000-0000-4000-8000-000000000001' and customer_email like '%@fase7f.invalid'),
  'price_divergences',(select count(*) from public.menu_order_items item join public.menu_item_prices price on price.id=item.menu_item_price_id where item.barbershop_id='7f000000-0000-4000-8000-000000000001' and item.unit_price<>price.price),
  'anon_menu_orders_privilege',has_table_privilege('anon','public.menu_orders','select'),
  'all_menu_tables_rls',(select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and (c.relname like 'menu_%' or c.relname='online_menus')),
  'ai_controls',(select jsonb_build_object('hybrid_enabled',hybrid_enabled,'kill_switch',kill_switch,'maximum_calls',maximum_calls,'maximum_cost_cents',maximum_cost_cents) from private.menu_ai_environment_controls where environment='staging')
) as result;
