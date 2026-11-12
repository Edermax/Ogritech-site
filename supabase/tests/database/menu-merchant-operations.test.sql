begin;
set local search_path=public,extensions;
select extensions.no_plan();
insert into public.barbershops(id,name,slug,segment) values
 ('e1100000-0000-4000-8000-000000000001','Merchant A fixture','merchant-ops-a','Restaurante'),
 ('e1100000-0000-4000-8000-000000000002','Merchant B fixture','merchant-ops-b','Restaurante');
insert into auth.users(id,email,role,aud) values
 ('e1300000-0000-4000-8000-000000000001','merchant-a@example.invalid','authenticated','authenticated'),
 ('e1300000-0000-4000-8000-000000000002','merchant-b@example.invalid','authenticated','authenticated'),
 ('e1300000-0000-4000-8000-000000000003','merchant-staff@example.invalid','authenticated','authenticated');
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id) values
 ('e1200000-0000-4000-8000-000000000001','Merchant A','Restaurante','Owner A','merchant-a@example.invalid','Teste','Agenda',97,'Ativo','e1100000-0000-4000-8000-000000000001'),
 ('e1200000-0000-4000-8000-000000000002','Merchant B','Restaurante','Owner B','merchant-b@example.invalid','Teste','Agenda',97,'Ativo','e1100000-0000-4000-8000-000000000002');
insert into public.platform_admins(user_id) values('e1300000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims','{"sub":"e1300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.platform_set_product_subscription('e1200000-0000-4000-8000-000000000001','menu',
 (select plan.id from public.saas_plans plan join public.platform_products product on product.id=plan.product_id where product.code='menu' and plan.code='foundation'),'active',null);
select public.platform_set_product_subscription('e1200000-0000-4000-8000-000000000002','menu',
 (select plan.id from public.saas_plans plan join public.platform_products product on product.id=plan.product_id where product.code='menu' and plan.code='foundation'),'active',null);
delete from public.platform_admins where user_id='e1300000-0000-4000-8000-000000000001';
insert into public.profiles(id,barbershop_id,full_name,role) values
 ('e1300000-0000-4000-8000-000000000001','e1100000-0000-4000-8000-000000000001','Owner A','owner'),
 ('e1300000-0000-4000-8000-000000000002','e1100000-0000-4000-8000-000000000002','Owner B','owner'),
 ('e1300000-0000-4000-8000-000000000003','e1100000-0000-4000-8000-000000000001','Staff A','employee');
insert into public.online_menus(id,barbershop_id,slug,title,published,published_at,created_at) values
 ('e1400000-0000-4000-8000-000000000001','e1100000-0000-4000-8000-000000000001','merchant-ops-a','Merchant A',false,null,'2025-01-01'),
 ('e1400000-0000-4000-8000-000000000002','e1100000-0000-4000-8000-000000000002','merchant-ops-b','Merchant B',false,null,'2025-01-01');
insert into public.menu_categories(id,barbershop_id,menu_id,name) values('e1500000-0000-4000-8000-000000000001','e1100000-0000-4000-8000-000000000001','e1400000-0000-4000-8000-000000000001','Fixture');
insert into public.menu_items(id,barbershop_id,category_id,name,item_type) values('e1600000-0000-4000-8000-000000000001','e1100000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000001','Most sold fixture','simple');
insert into public.menu_item_prices(id,barbershop_id,menu_item_id,label,price) values('e1700000-0000-4000-8000-000000000001','e1100000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000001','Unidade',50);
update public.online_menus set published=true,published_at=now() where id in ('e1400000-0000-4000-8000-000000000001','e1400000-0000-4000-8000-000000000002');
create temporary table order_response as select public.public_create_menu_order_v2('merchant-ops-a','Client A','','11999999999','pickup',null,'',
 '[{"menu_item_price_id":"e1700000-0000-4000-8000-000000000001","quantity":2,"selections":[]}]',true,'e1800000-0000-4000-8000-000000000001') payload;
select extensions.is((select payload->>'order_code' from order_response),'#1','first real order displays #1');
select extensions.is((public.public_create_menu_order_v2('merchant-ops-a','Client A','','11999999999','pickup',null,'',
 '[{"menu_item_price_id":"e1700000-0000-4000-8000-000000000001","quantity":2,"selections":[]}]',true,'e1800000-0000-4000-8000-000000000001')->>'order_number')::integer,1,'idempotent retry keeps the same sequential number');
select extensions.is((public.public_get_menu_order((select payload->>'reference' from order_response),(select payload->>'token' from order_response))->>'order_number')::integer,1,'existing tokenized tracking returns the short number');
select extensions.ok(public.public_get_menu_order('#1',(select payload->>'token' from order_response)) is null,'number alone never grants tracking access');
insert into public.menu_orders(id,barbershop_id,menu_id,customer_name,customer_phone,fulfillment_type,public_token_hash,is_test,subtotal,consent_at) values
 ('e1900000-0000-4000-8000-000000000001','e1100000-0000-4000-8000-000000000001','e1400000-0000-4000-8000-000000000001','Test','00000000000','pickup','fixture',true,999,now()),
 ('e1900000-0000-4000-8000-000000000002','e1100000-0000-4000-8000-000000000001','e1400000-0000-4000-8000-000000000001','Second A','11999999999','pickup','fixture',false,50,now()),
 ('e1900000-0000-4000-8000-000000000003','e1100000-0000-4000-8000-000000000002','e1400000-0000-4000-8000-000000000002','First B','11999999998','pickup','fixture',false,999,now()),
 ('e1900000-0000-4000-8000-000000000004','e1100000-0000-4000-8000-000000000001','e1400000-0000-4000-8000-000000000001','Third A','11999999999','pickup','fixture',false,20,now());
select extensions.is((select order_number from public.menu_orders where id='e1900000-0000-4000-8000-000000000002'),2::bigint,'test orders do not consume real numbers');
select extensions.is((select order_number from public.menu_orders where id='e1900000-0000-4000-8000-000000000003'),1::bigint,'another business starts its own sequence at #1');
select extensions.throws_ok($$update public.menu_orders set order_number=99 where id='e1900000-0000-4000-8000-000000000002'$$,'23514','Order identity is immutable','order number cannot be rewritten');
select extensions.ok(not has_table_privilege('authenticated','public.menu_orders','update'),'clients cannot bypass the checked operation RPCs');
select extensions.ok(not has_function_privilege('authenticated','public.backend_menu_receipt_state(uuid,text,integer,text)','execute'),'clients cannot forge storage verification');
select extensions.ok((select not public from storage.buckets where id='menu-payment-receipts'),'receipt bucket is private');

set local role authenticated;
select public.update_menu_order_operation('e1100000-0000-4000-8000-000000000001',(select id from public.menu_orders where client_request_id='e1800000-0000-4000-8000-000000000001'),'confirm');
select extensions.throws_ok($$select public.review_menu_order_decision('e1100000-0000-4000-8000-000000000001',(select id from public.menu_orders where client_request_id='e1800000-0000-4000-8000-000000000001'),'rejected','2020-01-01','Outdated screen')$$,'40001','order_changed','stale decisions cannot overwrite a newer order');
select extensions.lives_ok($$select public.review_menu_order_decision('e1100000-0000-4000-8000-000000000001',(select id from public.menu_orders where client_request_id='e1800000-0000-4000-8000-000000000001'),'rejected',(select updated_at from public.menu_orders where client_request_id='e1800000-0000-4000-8000-000000000001'),'Customer changed their decision')$$,'confirmed order can be refused after explicit review');
select extensions.lives_ok($$select public.review_menu_order_decision('e1100000-0000-4000-8000-000000000001',(select id from public.menu_orders where client_request_id='e1800000-0000-4000-8000-000000000001'),'confirmed',(select updated_at from public.menu_orders where client_request_id='e1800000-0000-4000-8000-000000000001'),'Customer confirmed again')$$,'refused order can be confirmed again');
select extensions.lives_ok($$select public.record_menu_order_payment('e1100000-0000-4000-8000-000000000001',(select id from public.menu_orders where client_request_id='e1800000-0000-4000-8000-000000000001'),(select updated_at from public.menu_orders where client_request_id='e1800000-0000-4000-8000-000000000001'))$$,'payment receipt file is optional');
select extensions.throws_ok($$select public.menu_order_receipt_access('e1100000-0000-4000-8000-000000000002','e1900000-0000-4000-8000-000000000003','read')$$,'42501','Access denied','receipt access cannot cross businesses');
create temporary table reserved_receipt as select (public.menu_order_receipt_access('e1100000-0000-4000-8000-000000000001','e1900000-0000-4000-8000-000000000002','reserve','{"original_name":"receipt.png","content_type":"image/png","file_size":8}')->>'id')::uuid id;
reset role;
select extensions.ok(exists(select 1 from private.menu_order_operation_events where new_status='rejected' and reason='Customer changed their decision'),'decision audit records the actor and reason');
select public.backend_menu_receipt_state((select id from reserved_receipt),'verify',8,'image/png');
set local role authenticated;
select extensions.throws_ok($$select public.record_menu_order_payment('e1100000-0000-4000-8000-000000000001','e1900000-0000-4000-8000-000000000004',(select updated_at from public.menu_orders where id='e1900000-0000-4000-8000-000000000004'),(select id from reserved_receipt))$$,'22023','Receipt unavailable','receipt from another order cannot be attached');
select extensions.lives_ok($$select public.record_menu_order_payment('e1100000-0000-4000-8000-000000000001','e1900000-0000-4000-8000-000000000002',(select updated_at from public.menu_orders where id='e1900000-0000-4000-8000-000000000002'),(select id from reserved_receipt))$$,'verified receipt and payment attach atomically to their own order');
select extensions.throws_ok($$select public.menu_order_receipt_access('e1100000-0000-4000-8000-000000000001','e1900000-0000-4000-8000-000000000002','cancel',jsonb_build_object('receipt_id',(select id from reserved_receipt)))$$,'22023','Receipt unavailable','attached receipt cannot be cancelled or removed by the pending-upload path');
select set_config('request.jwt.claims','{"sub":"e1300000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select extensions.throws_ok($$select public.menu_sales_reports('e1100000-0000-4000-8000-000000000001')$$,'42501','Access denied','staff cannot view financial summaries');
reset role;
select set_config('request.jwt.claims','{"sub":"e1300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update public.menu_orders set payment_status='paid' where id in ('e1900000-0000-4000-8000-000000000001','e1900000-0000-4000-8000-000000000003');
update public.menu_orders set payment_received_at='2026-11-03T12:00:00Z' where barbershop_id='e1100000-0000-4000-8000-000000000001' and payment_status='paid';
insert into public.menu_order_items(barbershop_id,order_id,menu_item_id,item_name,quantity,unit_price)
 values('e1100000-0000-4000-8000-000000000001','e1900000-0000-4000-8000-000000000002','e1600000-0000-4000-8000-000000000001','Most sold fixture',1,50);
select extensions.is((private.menu_sales_period('e1100000-0000-4000-8000-000000000001','2026-11-02','2026-11-09')->>'total_amount')::numeric,150::numeric,'sales include only received payments from this business, excluding test and pending orders');
select extensions.is((private.menu_sales_period('e1100000-0000-4000-8000-000000000001','2026-11-02','2026-11-09')->>'order_count')::integer,2,'paid order count matches the financial basis');
select extensions.is((private.menu_sales_period('e1100000-0000-4000-8000-000000000001','2026-11-02','2026-11-09')->'top_items'->0->>'quantity')::integer,3,'top products aggregate quantities from eligible paid orders');
update public.menu_orders set status='rejected' where id='e1900000-0000-4000-8000-000000000002';
select extensions.is((private.menu_sales_period('e1100000-0000-4000-8000-000000000001','2026-11-02','2026-11-09')->>'total_amount')::numeric,100::numeric,'later refusal removes the payment from the next report view without pretending to refund it');
update public.menu_orders set subtotal=80,payment_status='paid' where id='e1900000-0000-4000-8000-000000000004';
update public.menu_orders set payment_received_at='2026-10-28T12:00:00Z' where id='e1900000-0000-4000-8000-000000000004';
select extensions.is((private.menu_sales_report_payload('e1100000-0000-4000-8000-000000000001','weekly','2026-11-02','2026-11-09')->>'difference_amount')::numeric,20::numeric,'financial comparison uses the actual BRL difference');
select extensions.is((private.menu_sales_report_payload('e1100000-0000-4000-8000-000000000001','weekly','2026-11-02','2026-11-09')->>'difference_percent')::numeric,25::numeric,'100 versus 80 is exactly a 25 percent increase');
select extensions.ok(private.menu_sales_report_payload('e1100000-0000-4000-8000-000000000001','monthly','2026-10-01','2026-11-01')->>'difference_percent' is null,'zero prior revenue does not produce a misleading percentage');
insert into private.menu_sales_reports(barbershop_id,kind,period_start,period_end) values('e1100000-0000-4000-8000-000000000001','weekly','2026-11-02','2026-11-09');
set local role authenticated;
select extensions.is((public.menu_sales_report('e1100000-0000-4000-8000-000000000001',(public.menu_sales_reports('e1100000-0000-4000-8000-000000000001')->0->>'id')::uuid)->>'difference_percent')::numeric,25::numeric,'authorized report view uses the same verified financial comparison');
select extensions.throws_ok($$select public.menu_sales_reports('e1100000-0000-4000-8000-000000000002')$$,'42501','Access denied','financial reports remain isolated between businesses');
reset role;
select private.generate_menu_sales_reports('2026-12-01T12:00:00Z');
create temporary table report_total as select count(*) count from private.menu_sales_reports;
select private.generate_menu_sales_reports('2026-12-01T12:00:00Z');
select extensions.is((select count(*) from private.menu_sales_reports),(select count from report_total),'scheduler retries never duplicate weekly/monthly notifications');
select extensions.ok(exists(select 1 from cron.job where jobname='ogritech-menu-sales-reports' and active),'recurring report generation is actually scheduled');
select * from extensions.finish();
rollback;
