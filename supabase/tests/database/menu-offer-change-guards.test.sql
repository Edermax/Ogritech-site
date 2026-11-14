begin;
set local search_path=public,extensions;
select extensions.no_plan();
select extensions.is((select monthly_fee from public.saas_plans where product_id=(select id from public.platform_products where code='menu') and code='cardapio'),29.90::numeric,'Cardápio monthly price');
select extensions.is((select monthly_fee from public.saas_plans where product_id=(select id from public.platform_products where code='menu') and code='foundation'),49.90::numeric,'Encomendas monthly price');
insert into public.barbershops(id,name,slug,segment) values('dd100000-0000-4000-8000-000000000001','Offers fixture','offers-fixture','Restaurante');
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id)
values('dd200000-0000-4000-8000-000000000001','Offers fixture','Restaurante','Fixture','offers@example.invalid','Teste','Encomendas',49.90,'Ativo','dd100000-0000-4000-8000-000000000001');
insert into public.billing_customers(saas_client_id,billing_email) values('dd200000-0000-4000-8000-000000000001','offers@example.invalid');
insert into public.platform_subscriptions(billing_customer_id,product_id,plan_id,status,base_amount,current_period_end)
select customer.id,product.id,plan.id,'trial',49.90,now()+interval '7 days' from public.billing_customers customer,public.platform_products product,public.saas_plans plan
where customer.saas_client_id='dd200000-0000-4000-8000-000000000001' and product.code='menu' and plan.product_id=product.id and plan.code='foundation';
insert into private.billing_signups(id,tax_document,business_name,responsible_name,email,phone,cycle,payment_method,base_monthly_cents,cycle_months,discount_bps,total_cents,terms_version,management_token_hash,product_code,barbershop_id,saas_client_id,trial_ends_at)
values('dd300000-0000-4000-8000-000000000001','00000000001301','Offers fixture','Fixture','offers@example.invalid','11999999999','monthly','pix',4990,1,0,4990,'fixture','offers-fixture-token','menu','dd100000-0000-4000-8000-000000000001','dd200000-0000-4000-8000-000000000001',now()+interval '7 days');
insert into public.business_whatsapp_shares(barbershop_id,phone) values('dd100000-0000-4000-8000-000000000001','5511999999999');
insert into public.online_menus(id,barbershop_id,slug,title,template_code,settings_completed_at,visual_identity,weekly_hours,accepted_payment_methods,accepts_delivery,accepts_pickup)
values('dd400000-0000-4000-8000-000000000001','dd100000-0000-4000-8000-000000000001','offers-fixture','Offers fixture','pizzeria',now(),'{"primary_color":"#111827","accent_color":"#f59e0b"}','{"weekdays":[1,2,3],"opens_at":"10:00","closes_at":"22:00"}',array['pix'],false,true);
insert into public.menu_categories(id,barbershop_id,menu_id,name) values('dd500000-0000-4000-8000-000000000001','dd100000-0000-4000-8000-000000000001','dd400000-0000-4000-8000-000000000001','Fixture');
insert into public.menu_items(id,barbershop_id,category_id,name) values('dd600000-0000-4000-8000-000000000001','dd100000-0000-4000-8000-000000000001','dd500000-0000-4000-8000-000000000001','Fixture item');
insert into public.menu_item_prices(id,barbershop_id,menu_item_id,label,price) values('dd700000-0000-4000-8000-000000000001','dd100000-0000-4000-8000-000000000001','dd600000-0000-4000-8000-000000000001','500 g',25);
insert into auth.users(id,instance_id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('dd800000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','offers-owner@example.invalid','{}','{}',now(),now());
insert into public.profiles(id,barbershop_id,full_name,role,active) values('dd800000-0000-4000-8000-000000000001','dd100000-0000-4000-8000-000000000001','Offers owner','owner',true);

-- Full plan can be published without WhatsApp; a downgrade must not break its consumer flow.
delete from public.business_whatsapp_shares where barbershop_id='dd100000-0000-4000-8000-000000000001';
update public.online_menus set published=true,published_at=now(),review_confirmed_at=now() where id='dd400000-0000-4000-8000-000000000001';
select extensions.throws_ok($$select public.backend_billing_offer_change_claim('dd100000-0000-4000-8000-000000000001','cardapio',(select updated_at from private.billing_signups where id='dd300000-0000-4000-8000-000000000001'))$$,'23514',null,'claim requires valid public WhatsApp before provider mutation');
select extensions.throws_ok($$select public.backend_billing_change_offer('dd100000-0000-4000-8000-000000000001','cardapio',(select updated_at from private.billing_signups where id='dd300000-0000-4000-8000-000000000001'))$$,'23514',null,'direct plan edit cannot bypass the publication invariant');
select extensions.is(private.menu_offer('dd100000-0000-4000-8000-000000000001'),'encomendas','blocked downgrade preserves full plan');
select extensions.is((select count(*) from private.menu_offer_changes),0::bigint,'failed precondition leaves no reservation');
update public.online_menus set whatsapp_phone='11999999999' where id='dd400000-0000-4000-8000-000000000001';
create temporary table guarded_operation as select public.backend_billing_offer_change_claim('dd100000-0000-4000-8000-000000000001','cardapio',(select updated_at from private.billing_signups where id='dd300000-0000-4000-8000-000000000001')) as payload;
select extensions.is((select count(*) from private.menu_offer_changes),1::bigint,'one durable reservation');
select extensions.throws_ok($$select public.backend_billing_offer_change_claim('dd100000-0000-4000-8000-000000000001','cardapio',(select updated_at from private.billing_signups where id='dd300000-0000-4000-8000-000000000001'))$$,'55000',null,'overlapping request cannot reserve again');
select extensions.throws_ok($$select public.backend_billing_change_offer('dd100000-0000-4000-8000-000000000001','cardapio',(select updated_at from private.billing_signups where id='dd300000-0000-4000-8000-000000000001'))$$,'55000',null,'another plan path cannot write through an active reservation');
select extensions.throws_ok($$update private.billing_signups set cycle='annual',cycle_months=12,discount_bps=1667,total_cents=49900 where id='dd300000-0000-4000-8000-000000000001'$$,'55000',null,'pricing cannot change outside the reservation');
select extensions.ok(not has_function_privilege('service_role','public.backend_billing_change_offer(uuid,text,timestamptz)','execute'),'unreserved legacy service endpoint is closed');
select extensions.ok(not has_function_privilege('authenticated','public.backend_billing_offer_change_claim(uuid,text,timestamptz)','execute'),'customer cannot claim without the authenticated handler');
select extensions.ok(not has_function_privilege('anon','public.backend_billing_offer_change_commit(uuid,uuid)','execute'),'anonymous cannot commit');
select extensions.throws_ok($$select public.backend_billing_offer_change_commit((select (payload->>'operation_id')::uuid from guarded_operation),'00000000-0000-4000-8000-000000000001')$$,'P0002',null,'wrong operation token cannot commit');
select extensions.lives_ok($$select public.backend_billing_offer_change_commit((select (payload->>'operation_id')::uuid from guarded_operation),(select (payload->>'lease_token')::uuid from guarded_operation))$$,'reserved commit succeeds');
select extensions.is(private.menu_offer('dd100000-0000-4000-8000-000000000001'),'cardapio','commit changes actual entitlement');
select extensions.is(public.public_menu('offers-fixture')->'menu'->>'whatsapp_phone','5511999999999','local contact is canonical in the public response');
select extensions.is((select count(*) from private.menu_offer_changes),1::bigint,'commit keeps reservation until response is reconciled');
select extensions.ok(public.backend_billing_offer_change_finish((select (payload->>'operation_id')::uuid from guarded_operation),(select (payload->>'lease_token')::uuid from guarded_operation),false),'verified completion releases the reservation');
select extensions.is((select count(*) from private.menu_offer_changes),0::bigint,'completed operation no longer blocks changes');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dd800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.throws_ok($$select public.save_menu_contact('dd100000-0000-4000-8000-000000000001','')$$,'23514',null,'owner cannot erase the last contact from a published Cardápio');
select extensions.throws_ok($$select public.save_menu_contact('dd100000-0000-4000-8000-000000000001','123')$$,'22023',null,'invalid short contact is rejected');
reset role;
insert into public.business_whatsapp_shares(barbershop_id,phone) values('dd100000-0000-4000-8000-000000000001','5511988887777');
select extensions.lives_ok($$update public.online_menus set whatsapp_phone='' where id='dd400000-0000-4000-8000-000000000001'$$,'valid fallback permits changing the canonical source');
select extensions.is(public.public_menu('offers-fixture')->'menu'->>'whatsapp_phone','5511988887777','public catalog uses the valid fallback');
select extensions.throws_ok($$delete from public.business_whatsapp_shares where barbershop_id='dd100000-0000-4000-8000-000000000001'$$,'23514',null,'deleting the last fallback is rejected');
select extensions.throws_ok($$update public.business_whatsapp_shares set phone=null where barbershop_id='dd100000-0000-4000-8000-000000000001'$$,'23514',null,'clearing the last fallback is rejected');
update public.online_menus set published=false,published_at=null where id='dd400000-0000-4000-8000-000000000001';
select extensions.lives_ok($$delete from public.business_whatsapp_shares where barbershop_id='dd100000-0000-4000-8000-000000000001'$$,'unpublished menu may remove the last contact');
select extensions.throws_ok($$update public.online_menus set published=true,published_at=now() where id='dd400000-0000-4000-8000-000000000001'$$,'23514',null,'republishing without contact is rejected');
select extensions.is(private.normalized_menu_whatsapp('+55 (11) 99999-9999'),'5511999999999','formatted international contact normalizes');
select extensions.is(private.normalized_menu_whatsapp('+1 212 555 1234'),null::text,'non-Brazilian explicit country cannot become a Brazilian recipient');
-- Recovery retains a lease, uses current committed pricing and fences stale workers.
truncate guarded_operation;
insert into guarded_operation select public.backend_billing_offer_change_claim('dd100000-0000-4000-8000-000000000001','encomendas',(select updated_at from private.billing_signups where id='dd300000-0000-4000-8000-000000000001'));
select extensions.is(jsonb_array_length(public.backend_billing_offer_change_recover()),0,'live operation cannot be recovered early');
update private.menu_offer_changes set updated_at=clock_timestamp()-interval '16 minutes';
create temporary table recovered_operation as select public.backend_billing_offer_change_recover()->0 payload;
select extensions.is((select (payload->>'total_cents')::integer from recovered_operation),2990,'recovery reads canonical DB amount');
select extensions.ok((select payload->>'lease_token' from recovered_operation)<>(select payload->>'lease_token' from guarded_operation),'recovery rotates the lease token');
select extensions.throws_ok($$select public.backend_billing_offer_change_commit((select (payload->>'operation_id')::uuid from guarded_operation),(select (payload->>'lease_token')::uuid from guarded_operation))$$,'P0002',null,'stale worker cannot commit after recovery claimed the operation');
select extensions.ok(not public.backend_billing_offer_change_finish((select (payload->>'operation_id')::uuid from guarded_operation),(select (payload->>'lease_token')::uuid from guarded_operation),false),'stale worker cannot release a recovered operation');
select extensions.is(jsonb_array_length(public.backend_billing_offer_change_recover()),0,'second worker cannot recover an active lease');
select extensions.ok(public.backend_billing_offer_change_finish((select (payload->>'operation_id')::uuid from recovered_operation),(select (payload->>'lease_token')::uuid from recovered_operation),true),'failed recovery remains reserved');
select extensions.is((select state from private.menu_offer_changes),'reconciliation_required','failed recovery is inspectable');
select extensions.throws_ok($$select public.backend_billing_offer_change_claim('dd100000-0000-4000-8000-000000000001','encomendas',(select updated_at from private.billing_signups where id='dd300000-0000-4000-8000-000000000001'))$$,'55000',null,'failed recovery does not silently unlock the account');
do $retries$ declare attempt integer; recovered jsonb; begin
 for attempt in 2..10 loop
  update private.menu_offer_changes set updated_at=clock_timestamp()-interval '16 minutes';
  recovered:=public.backend_billing_offer_change_recover()->0;
  perform public.backend_billing_offer_change_finish((recovered->>'operation_id')::uuid,(recovered->>'lease_token')::uuid,true);
  update recovered_operation set payload=recovered;
 end loop;
end $retries$;
select extensions.is((select state from private.menu_offer_changes),'manual_review','bounded recovery failures remain blocked for manual review');
update private.menu_offer_changes set updated_at=clock_timestamp()-interval '16 minutes';
select extensions.is(jsonb_array_length(public.backend_billing_offer_change_recover()),0,'exhausted operation does not silently retry or unlock');
select extensions.ok(public.backend_billing_offer_change_finish((select (payload->>'operation_id')::uuid from recovered_operation),(select (payload->>'lease_token')::uuid from recovered_operation),false),'verified recovery releases the account');
select * from extensions.finish();
rollback;
