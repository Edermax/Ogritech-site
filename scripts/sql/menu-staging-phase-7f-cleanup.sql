begin;

update public.online_menus set published=false,published_at=null where id='7f000000-0000-4000-8000-000000000003';
delete from private.menu_ai_staging_events where barbershop_id='7f000000-0000-4000-8000-000000000001';
delete from private.menu_assistant_events where barbershop_id='7f000000-0000-4000-8000-000000000001';
delete from public.menu_orders where barbershop_id='7f000000-0000-4000-8000-000000000001';
delete from private.menu_order_idempotency where menu_id='7f000000-0000-4000-8000-000000000003';
delete from public.menu_onboarding_events where barbershop_id='7f000000-0000-4000-8000-000000000001';
delete from public.menu_assistant_settings where barbershop_id='7f000000-0000-4000-8000-000000000001';
delete from public.menu_item_option_groups where barbershop_id='7f000000-0000-4000-8000-000000000001';
delete from public.menu_options where barbershop_id='7f000000-0000-4000-8000-000000000001';
delete from public.menu_option_groups where barbershop_id='7f000000-0000-4000-8000-000000000001';
delete from public.menu_availability_rules where barbershop_id='7f000000-0000-4000-8000-000000000001';
delete from public.menu_item_prices where barbershop_id='7f000000-0000-4000-8000-000000000001';
delete from public.menu_items where barbershop_id='7f000000-0000-4000-8000-000000000001';
delete from public.menu_categories where barbershop_id='7f000000-0000-4000-8000-000000000001';
delete from public.menu_delivery_zones where barbershop_id='7f000000-0000-4000-8000-000000000001';
delete from public.online_menus where id='7f000000-0000-4000-8000-000000000003';
delete from public.platform_subscriptions where billing_customer_id in (select id from public.billing_customers where saas_client_id='7f000000-0000-4000-8000-000000000002');
delete from public.billing_customers where saas_client_id='7f000000-0000-4000-8000-000000000002';
delete from public.saas_clients where id='7f000000-0000-4000-8000-000000000002';
delete from public.barbershops where id='7f000000-0000-4000-8000-000000000001';

commit;

select jsonb_build_object(
  'phase','7F','cleanup','complete',
  'businesses',(select count(*) from public.barbershops where id='7f000000-0000-4000-8000-000000000001'),
  'clients',(select count(*) from public.saas_clients where id='7f000000-0000-4000-8000-000000000002'),
  'menus',(select count(*) from public.online_menus where id='7f000000-0000-4000-8000-000000000003'),
  'orders',(select count(*) from public.menu_orders where barbershop_id='7f000000-0000-4000-8000-000000000001'),
  'assistant_events',(select count(*) from private.menu_assistant_events where barbershop_id='7f000000-0000-4000-8000-000000000001'),
  'ai_events',(select count(*) from private.menu_ai_staging_events where barbershop_id='7f000000-0000-4000-8000-000000000001')
) as result;
