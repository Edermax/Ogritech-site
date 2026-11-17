begin;
-- Historical scenarios seed contracts from the preceding commercial version.
update public.saas_plans set active=true where catalog_version=1 and product_id=(select id from public.platform_products where code='menu');
select extensions.plan(45);
insert into public.barbershops(id,name,slug,segment) values('eb100000-0000-4000-8000-000000000001','Adjustment fixture','adjustments-fixture','Restaurante');
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id) values('eb200000-0000-4000-8000-000000000001','Adjustment fixture','Restaurante','Fixture','adjustment@example.invalid','Teste','Encomendas',49.90,'Ativo','eb100000-0000-4000-8000-000000000001');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('eb800000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','adjustment-admin@example.invalid','','{}','{}',now(),now()),
 ('eb800000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','adjustment-owner@example.invalid','','{}','{}',now(),now());
insert into public.profiles(id,barbershop_id,full_name,role,active) values
 ('eb800000-0000-4000-8000-000000000001','eb100000-0000-4000-8000-000000000001','Admin','admin',true),
 ('eb800000-0000-4000-8000-000000000002','eb100000-0000-4000-8000-000000000001','Owner','owner',true);
insert into public.platform_admins(user_id) values('eb800000-0000-4000-8000-000000000001');
insert into public.billing_customers(id,saas_client_id,billing_email) values('eb700000-0000-4000-8000-000000000001','eb200000-0000-4000-8000-000000000001','adjustment@example.invalid');
insert into public.platform_subscriptions(id,billing_customer_id,product_id,plan_id,status,base_amount,current_period_end,next_billing_on)
select 'eb900000-0000-4000-8000-000000000001','eb700000-0000-4000-8000-000000000001',p.product_id,p.id,'active',49.90,now()+interval '1 month',current_date+interval '1 month' from public.saas_plans p where p.code='foundation' and p.menu_offer_code='encomendas';
insert into public.platform_invoices(id,billing_customer_id,subscription_id,status,issue_date,due_date,subtotal,total,paid_total,paid_at)
values('eb400000-0000-4000-8000-000000000001','eb700000-0000-4000-8000-000000000001','eb900000-0000-4000-8000-000000000001','paid',current_date-interval '1 month',current_date-interval '1 month',49.90,49.90,49.90,now()-interval '1 month');
insert into public.platform_invoice_items(invoice_id,item_type,description,quantity,unit_amount) values('eb400000-0000-4000-8000-000000000001','subscription','Mensalidade',1,49.90);
insert into public.platform_payments(id,invoice_id,method,status,gross_amount,paid_at) values('eb500000-0000-4000-8000-000000000001','eb400000-0000-4000-8000-000000000001','pix','approved',49.90,now()-interval '1 month');
create function pg_temp.refund_payload(amount integer default 2000,reference uuid default 'eb600000-0000-4000-8000-000000000001') returns jsonb language sql as $$select jsonb_build_object('request_id',reference,'source','platform','payment_id','eb500000-0000-4000-8000-000000000001','amount_cents',amount,'key_type','email','key','customer@example.invalid','receiver_name','Cliente','receiver_city','Franca','reason','Teste')$$;
select extensions.ok(not has_function_privilege('anon','public.platform_subscription_finance(uuid)','execute'),'visitors cannot access financial data');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"eb800000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select extensions.throws_ok($$select public.platform_subscription_finance('eb900000-0000-4000-8000-000000000001')$$,'42501',null,'business owner cannot manage administrative refunds');
select extensions.throws_ok($$select public.platform_waive_subscription_month('eb900000-0000-4000-8000-000000000001','2027-01','')$$,'42501',null,'business owner cannot grant a free month');
select set_config('request.jwt.claims','{"sub":"eb800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.is((public.platform_subscription_finance('eb900000-0000-4000-8000-000000000001')->'payments'->0->>'available_cents')::integer,4990,'approved monthly payment has its actual refundable amount');
select extensions.throws_ok($$select public.platform_prepare_subscription_refund('eb900000-0000-4000-8000-000000000001',pg_temp.refund_payload(5000))$$,'23514',null,'refund cannot exceed received monthly payment');
select extensions.lives_ok($$select public.platform_prepare_subscription_refund('eb900000-0000-4000-8000-000000000001',pg_temp.refund_payload())$$,'administrator prepares outgoing Pix');
select extensions.is((public.platform_subscription_finance('eb900000-0000-4000-8000-000000000001')->'payments'->0->>'available_cents')::integer,2990,'pending transfer reserves its amount');
select extensions.lives_ok($$select public.platform_prepare_subscription_refund('eb900000-0000-4000-8000-000000000001',pg_temp.refund_payload())$$,'retry reuses the same preparation');
select extensions.throws_ok($$select public.platform_prepare_subscription_refund('eb900000-0000-4000-8000-000000000001',pg_temp.refund_payload(2100))$$,'23514',null,'retry cannot change the reserved amount');
select extensions.throws_ok($$select public.platform_register_refund('eb500000-0000-4000-8000-000000000001',30,'refund','Teste')$$,'P0001',null,'legacy refund also respects the reserved transfer');
select extensions.throws_ok($$select public.platform_finish_subscription_refund('eb600000-0000-4000-8000-000000000001',true,'')$$,'22023',null,'payment completion requires a bank reference');
select extensions.lives_ok($$select public.platform_finish_subscription_refund('eb600000-0000-4000-8000-000000000001',true,'BANK-REF-ADJUSTMENT-1')$$,'administrator confirms a paid transfer');
select extensions.lives_ok($$select public.platform_finish_subscription_refund('eb600000-0000-4000-8000-000000000001',true,'BANK-REF-ADJUSTMENT-1')$$,'repeated confirmation is idempotent');
reset role;
select extensions.is((select refunded_total from public.platform_invoices where id='eb400000-0000-4000-8000-000000000001'),20::numeric,'only the completed transfer affects financial totals');
set local role authenticated;
select extensions.lives_ok($$select public.platform_prepare_subscription_refund('eb900000-0000-4000-8000-000000000001',pg_temp.refund_payload(2990,'eb600000-0000-4000-8000-000000000002'))$$,'remaining amount can be prepared');
select extensions.lives_ok($$select public.platform_finish_subscription_refund('eb600000-0000-4000-8000-000000000002',false)$$,'preparation can be cancelled without marking it paid');
select extensions.is((public.platform_subscription_finance('eb900000-0000-4000-8000-000000000001')->'payments'->0->>'available_cents')::integer,2990,'cancelling restores the available balance');
select set_config('test.waiver_month',public.platform_subscription_finance('eb900000-0000-4000-8000-000000000001')->>'next_competence',true);
select extensions.lives_ok($$select public.platform_waive_subscription_month('eb900000-0000-4000-8000-000000000001',current_setting('test.waiver_month'),'')$$,'monthly waiver accepts an empty optional note');
select extensions.lives_ok($$select public.platform_waive_subscription_month('eb900000-0000-4000-8000-000000000001',current_setting('test.waiver_month'),'')$$,'repeating the same month does not grant another month');
reset role;
select extensions.is((select count(*) from public.subscription_month_waivers where subscription_id='eb900000-0000-4000-8000-000000000001'),1::bigint,'waiver has a single monthly audit record');
select extensions.ok(exists(select 1 from public.platform_invoices i join public.subscription_month_waivers w on w.invoice_id=i.id where w.subscription_id='eb900000-0000-4000-8000-000000000001' and i.total=0 and i.paid_total=0 and i.discount_total=49.90),'waiver creates a zero-charge invoice without inventing revenue');
update public.billing_customers set provider_subscription_id='provider-card-protected' where id='eb700000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_ok($$select public.platform_waive_subscription_month('eb900000-0000-4000-8000-000000000001',public.platform_subscription_finance('eb900000-0000-4000-8000-000000000001')->>'next_competence','')$$,'23514',null,'automatic card subscription cannot be waived or modified');
reset role;
select extensions.is((select provider_subscription_id from public.billing_customers where id='eb700000-0000-4000-8000-000000000001'),'provider-card-protected','automatic card identity stays unchanged');
update public.billing_customers set provider_subscription_id=null where id='eb700000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_ok($$select public.platform_waive_subscription_month('eb900000-0000-4000-8000-000000000001','2020-01','')$$,'40001',null,'wrong or stale month cannot forgive a different installment');
select extensions.throws_ok($$select public.platform_create_invoice('eb200000-0000-4000-8000-000000000001',(current_setting('test.waiver_month')||'-10')::date,'[{"item_type":"subscription","description":"Mensalidade","quantity":1,"unit_amount":49.90}]'::jsonb,0,0,'')$$,'23514',null,'waived month cannot be charged again through the legacy invoice form');
reset role;
select extensions.is((select sum(amount) from public.platform_refunds where payment_id='eb500000-0000-4000-8000-000000000001' and status='processed'),20::numeric,'refunds and waivers remain separate financial events');
-- Self-service payments are reconciled into the ledger only when preparing a real refund.
insert into private.billing_signups(id,tax_document,business_name,responsible_name,email,phone,cycle,payment_method,base_monthly_cents,cycle_months,discount_bps,total_cents,terms_version,management_token_hash,product_code,barbershop_id,saas_client_id,status,access_until)
values('eb300000-0000-4000-8000-000000000001','00000000001671','Adjustment fixture','Fixture','adjustment@example.invalid','11999999999','monthly','pix',4990,1,0,4990,'fixture','subscription-adjustment-token','menu','eb100000-0000-4000-8000-000000000001','eb200000-0000-4000-8000-000000000001','active',now()+interval '2 months');
insert into private.billing_payment_intents(id,signup_id,purpose,amount_cents,status,provider_payment_id,external_reference,paid_at)
values('eb510000-0000-4000-8000-000000000001','eb300000-0000-4000-8000-000000000001','renewal',4990,'approved','adjustment-online-payment','adjustment-online-reference',now());
set local role authenticated;
select extensions.lives_ok($$select public.platform_prepare_subscription_refund('eb900000-0000-4000-8000-000000000001',pg_temp.refund_payload(1000,'eb600000-0000-4000-8000-000000000003')||jsonb_build_object('source','online','payment_id','eb510000-0000-4000-8000-000000000001'))$$,'approved self-service payment can generate a manual refund preparation');
select extensions.throws_ok($$select public.platform_finish_subscription_refund('eb600000-0000-4000-8000-000000000003',true,'BANK-REF-ADJUSTMENT-1')$$,'23514',null,'a bank reference cannot be reused for another completed transfer');
select extensions.lives_ok($$select public.platform_finish_subscription_refund('eb600000-0000-4000-8000-000000000003',false)$$,'online refund preparation can be cancelled without reversing the original payment');
reset role;
select extensions.is((select count(*) from public.platform_payments where provider='mercado_pago' and provider_payment_id='adjustment-online-payment'),1::bigint,'online payment is reconciled exactly once');
select extensions.ok(not has_function_privilege('authenticated','public.backend_billing_payment_choice_claim(uuid,timestamptz)','execute'),'payment-selection reservations are backend-only');
select extensions.lives_ok($$select public.backend_billing_payment_choice_claim('eb300000-0000-4000-8000-000000000001',(select updated_at from private.billing_signups where id='eb300000-0000-4000-8000-000000000001'))$$,'checkout reserves the signup before creating a provider subscription');
set local role authenticated;
select extensions.throws_ok($$select public.platform_waive_subscription_month('eb900000-0000-4000-8000-000000000001',public.platform_subscription_finance('eb900000-0000-4000-8000-000000000001')->>'next_competence','')$$,'55000',null,'waiver cannot race an in-progress checkout');
reset role;
select extensions.lives_ok($$select public.backend_billing_payment_choice_release('eb300000-0000-4000-8000-000000000001',(select payment_selection_token from private.billing_signups where id='eb300000-0000-4000-8000-000000000001'))$$,'known completed checkout can release its own reservation');
select extensions.throws_ok($$select public.backend_billing_payment_choice_claim('eb300000-0000-4000-8000-000000000001',now()-interval '1 day')$$,'40001',null,'stale checkout cannot charge a boundary changed by a waiver');
update private.billing_signups set access_until=now()+interval '1 day' where id='eb300000-0000-4000-8000-000000000001';
select extensions.ok(public.backend_billing_lifecycle_prepare_pix('eb300000-0000-4000-8000-000000000001') is not null,'billing worker reserves an upcoming Pix before the provider call');
set local role authenticated;
select extensions.throws_ok($$select public.platform_waive_subscription_month('eb900000-0000-4000-8000-000000000001',public.platform_subscription_finance('eb900000-0000-4000-8000-000000000001')->>'next_competence','')$$,'55000',null,'waiver cannot race Pix generation before its payment intent exists');
reset role;
update private.billing_pix_requests set expires_at=now()-interval '1 second' where signup_id='eb300000-0000-4000-8000-000000000001';
update private.billing_signups set access_until=now()+interval '2 months' where id='eb300000-0000-4000-8000-000000000001';
select set_config('test.original_trial',(select trial_ends_at::text from private.billing_signups where id='eb300000-0000-4000-8000-000000000001'),true);
set local role authenticated;
select extensions.lives_ok($$select public.platform_waive_subscription_month('eb900000-0000-4000-8000-000000000001',public.platform_subscription_finance('eb900000-0000-4000-8000-000000000001')->>'next_competence','Concessão de atendimento')$$,'self-service Pix receives one waived month after pending work finishes');
reset role;
select extensions.is((select trial_ends_at::text from private.billing_signups where id='eb300000-0000-4000-8000-000000000001'),current_setting('test.original_trial'),'waiver never resets the unique free-trial deadline');
select extensions.ok(public.backend_billing_lifecycle_prepare_pix('eb300000-0000-4000-8000-000000000001') is null,'billing worker does not charge the waived period');
select set_config('test.online_ledger_id',(select id::text from public.platform_payments where provider='mercado_pago' and provider_payment_id='adjustment-online-payment'),true);
set local role authenticated;
select extensions.lives_ok($$select public.platform_prepare_subscription_refund('eb900000-0000-4000-8000-000000000001',pg_temp.refund_payload(1000,'eb600000-0000-4000-8000-000000000004')||jsonb_build_object('payment_id',current_setting('test.online_ledger_id')))$$,'unreversed online receipt can still be prepared through its reconciled ledger entry');
reset role;
update private.billing_payment_intents set status='refunded' where id='eb510000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.is((select item->>'payment_valid' from jsonb_array_elements(public.platform_subscription_finance('eb900000-0000-4000-8000-000000000001')->'transfers') item where item->>'id'='eb600000-0000-4000-8000-000000000004'),'false','pending transfer is flagged when its original payment is reversed');
select extensions.throws_ok($$select public.platform_prepare_subscription_refund('eb900000-0000-4000-8000-000000000001',pg_temp.refund_payload(1000,'eb600000-0000-4000-8000-000000000005')||jsonb_build_object('payment_id',current_setting('test.online_ledger_id')))$$,'23514',null,'a reconciled but reversed payment cannot fund a second payout');
select extensions.ok(not exists(select 1 from jsonb_array_elements(public.platform_subscription_finance('eb900000-0000-4000-8000-000000000001')->'payments') item where item->>'id'=current_setting('test.online_ledger_id')),'reversed original is removed from selectable paid receipts');
reset role;
update private.billing_payment_intents set status='approved' where id='eb510000-0000-4000-8000-000000000001';
update public.platform_payments set gross_amount=55 where id=current_setting('test.online_ledger_id')::uuid;
set local role authenticated;
select extensions.throws_ok($$select public.platform_prepare_subscription_refund('eb900000-0000-4000-8000-000000000001',pg_temp.refund_payload(1000,'eb600000-0000-4000-8000-000000000005')||jsonb_build_object('payment_id',current_setting('test.online_ledger_id')))$$,'23514',null,'ledger amount must match the authoritative online payment');
reset role;
select * from extensions.finish();
rollback;
