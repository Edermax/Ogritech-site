-- Prepared release step: never run until legacy provider subscriptions have been reconciled.
-- This preserves all rows; it retires product availability and public operational RPC access.
begin;
select extensions.plan(5);
update public.platform_products set active=false where code in ('agenda','pages','quotes');
do $$
declare legacy record;
begin
 for legacy in select p.oid::regprocedure as signature
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and p.proname=any(array[
  'public_booking_page','public_available_slots','public_visual_schedule','public_create_appointment',
  'public_get_appointment','public_cancel_appointment','public_record_appointment_consents',
  'client_list_my_appointments','client_claim_phone_appointments','client_cancel_my_appointment',
  'list_available_slots','create_appointment','cancel_my_appointment','list_services_catalog',
  'public_landing_page','public_submit_landing_lead','public_submit_quote_request',
  'public_get_quote_proposal','public_respond_quote_proposal'
 ]) loop
  execute format('revoke execute on function %s from public,anon,authenticated',legacy.signature);
 end loop;
end $$;
select extensions.is((select count(*) from public.platform_products where active and code in ('agenda','pages','quotes')),0::bigint,'retired products are unavailable');
select extensions.ok((select active from public.platform_products where code='menu'),'Cardapio stays available');
select extensions.ok(has_function_privilege('anon','public.public_menu(text)','execute'),'public menu access is preserved');
select extensions.ok(not has_function_privilege('anon','public.public_booking_page(text)','execute'),'public booking is retired');
select extensions.ok(not has_function_privilege('authenticated','public.public_get_quote_proposal(text,text)','execute'),'proposal access is retired');
select * from extensions.finish();
rollback;
