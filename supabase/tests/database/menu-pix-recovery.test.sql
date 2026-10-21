begin;
set local search_path=public,extensions;
select extensions.no_plan();

insert into public.barbershops(id,name,slug,segment) values
('bd100000-0000-4000-8000-000000000001','Billing fixture','pix-recovery-fixture-20261019','Restaurante');
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id)
values('bd200000-0000-4000-8000-000000000001','Billing fixture','Restaurante','Fixture','fixture@example.invalid','Teste','Agenda',97,'Ativo','bd100000-0000-4000-8000-000000000001');
insert into public.platform_subscriptions(billing_customer_id,plan_id,product_id,status,base_amount,current_period_end)
select customer.id,plan.id,product.id,'trial',49.90,now()-interval '1 day'
from public.billing_customers customer,public.saas_plans plan,public.platform_products product
where customer.saas_client_id='bd200000-0000-4000-8000-000000000001'
and plan.product_id=product.id and product.code='menu' and plan.code='foundation';
insert into private.billing_signups(id,tax_document,business_name,responsible_name,email,phone,cycle,payment_method,
base_monthly_cents,cycle_months,discount_bps,total_cents,terms_version,management_token_hash,product_code,
barbershop_id,saas_client_id,trial_ends_at,status)
values('bd300000-0000-4000-8000-000000000001','00000000001901','Billing fixture','Fixture','fixture@example.invalid','11999999999',
'monthly','pix',4990,1,0,4990,'fixture','pix-recovery-fixture-token-hash-20261019','menu',
'bd100000-0000-4000-8000-000000000001','bd200000-0000-4000-8000-000000000001',now()-interval '1 day','trial_active');

select extensions.ok(not has_function_privilege('authenticated','private.billing_pix_can_replace(uuid)','execute'),'clients cannot inspect backend billing eligibility');
select extensions.ok(private.billing_pix_can_replace('bd300000-0000-4000-8000-000000000001'),'initial Pix eligible');
select extensions.lives_ok($$select public.backend_billing_lifecycle_record_pix('bd300000-0000-4000-8000-000000000001',jsonb_build_object('amount_cents',4990,'provider_payment_id','pix-first','external_reference','pix-first-reference','purpose','initial','qr_code','first-qr','expires_at',now()+interval '1 day'))$$,'first QR persisted');
select extensions.ok(not private.billing_pix_can_replace('bd300000-0000-4000-8000-000000000001'),'valid pending QR blocks replacement');
update private.billing_payment_intents set expires_at=now()-interval '1 minute' where provider_payment_id='pix-first';
select extensions.ok(private.billing_pix_can_replace('bd300000-0000-4000-8000-000000000001'),'expired pending QR eligible again');
select extensions.ok(exists(select 1 from jsonb_array_elements(public.backend_billing_lifecycle_pix_due(now()+interval '48 hours')) s where s->>'id'='bd300000-0000-4000-8000-000000000001'),'worker selects expired pending payment');
select extensions.lives_ok($$select public.backend_billing_lifecycle_record_pix('bd300000-0000-4000-8000-000000000001',jsonb_build_object('amount_cents',4990,'provider_payment_id','pix-second','external_reference','pix-second-reference','purpose','initial','qr_code','second-qr','expires_at',now()+interval '1 day'))$$,'replacement QR persisted');
select extensions.is((select count(*)::integer from private.billing_payment_intents where signup_id='bd300000-0000-4000-8000-000000000001'),2,'both attempts remain in history');
select extensions.is(public.backend_billing_status('bd100000-0000-4000-8000-000000000001','menu')->'pix_payload'->>'qr_code','second-qr','status returns current QR even with equal timestamps');
select extensions.lives_ok($$select public.backend_billing_lifecycle_record_pix('bd300000-0000-4000-8000-000000000001',jsonb_build_object('amount_cents',4990,'provider_payment_id','pix-third','external_reference','pix-third-reference','purpose','initial','qr_code','third-qr','expires_at',now()+interval '1 day'))$$,'stale worker does not replace valid QR');
select extensions.is((select provider_payment_id from private.billing_signups where id='bd300000-0000-4000-8000-000000000001'),'pix-second','current payment unchanged');
update private.billing_payment_intents set status='approved',expires_at=now()-interval '1 minute' where provider_payment_id='pix-second';
select extensions.ok(not private.billing_pix_can_replace('bd300000-0000-4000-8000-000000000001'),'approved payment is not regenerated');
update private.billing_signups set payment_method='card' where id='bd300000-0000-4000-8000-000000000001';
select extensions.ok(public.backend_billing_status('bd100000-0000-4000-8000-000000000001','menu')->'pix_payload'='null'::jsonb,'card choice hides stale Pix');
update private.billing_signups set payment_method='pix',status='cancelled',payment_requested_at=null where id='bd300000-0000-4000-8000-000000000001';
select extensions.ok(not private.billing_pix_can_replace('bd300000-0000-4000-8000-000000000001'),'cancelled signup cannot generate Pix');
update private.billing_signups set status='past_due' where id='bd300000-0000-4000-8000-000000000001';
select extensions.throws_ok($$select public.backend_billing_lifecycle_record_pix('bd300000-0000-4000-8000-000000000001',jsonb_build_object('amount_cents',4990,'provider_payment_id','pix-invalid','external_reference','pix-invalid-reference','purpose','initial','qr_code','','expires_at',now()+interval '1 day'))$$,'22023','Invalid Pix payment','empty QR rejected');
select extensions.ok(not has_table_privilege('authenticated','private.billing_pix_requests','select'),'Pix reservations are private');
select public.backend_billing_lifecycle_prepare_pix('bd300000-0000-4000-8000-000000000001');
select extensions.is(public.backend_billing_lifecycle_prepare_pix('bd300000-0000-4000-8000-000000000001')->>'request_id',(select request_id::text from private.billing_pix_requests where signup_id='bd300000-0000-4000-8000-000000000001'),'concurrent/repeated preparations reuse one key');
select extensions.ok((select expires_at>now()+interval '30 minutes' and expires_at<now()+interval '30 days' from private.billing_pix_requests where signup_id='bd300000-0000-4000-8000-000000000001'),'prepared expiry is within provider limits');
select extensions.lives_ok($$select public.backend_billing_lifecycle_record_pix('bd300000-0000-4000-8000-000000000001',(select jsonb_build_object('purpose','initial','amount_cents',amount_cents,'provider_payment_id','pix-prepared','external_reference',external_reference,'expires_at',expires_at,'qr_code','prepared-qr') from private.billing_pix_requests where signup_id='bd300000-0000-4000-8000-000000000001'))$$,'prepared payment records with stable expiry');
select extensions.is(public.backend_billing_status('bd100000-0000-4000-8000-000000000001','menu')->'pix_payload'->>'qr_code','prepared-qr','prepared QR becomes the current payload');
select * from extensions.finish();
rollback;

