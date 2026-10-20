begin;
set local search_path=public,extensions;
select extensions.no_plan();

insert into public.barbershops(id,name,slug,segment) values
('bc100000-0000-4000-8000-000000000001','Billing fixture','billing-fixture-20261019','Restaurante');
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id)
values('bc200000-0000-4000-8000-000000000001','Billing fixture','Restaurante','Fixture','fixture@example.invalid','Teste','Agenda',97,'Ativo','bc100000-0000-4000-8000-000000000001');
insert into public.platform_subscriptions(billing_customer_id,plan_id,product_id,status,base_amount,current_period_end)
select customer.id,plan.id,product.id,'trial',49.90,now()-interval '1 day'
from public.billing_customers customer,public.saas_plans plan,public.platform_products product
where customer.saas_client_id='bc200000-0000-4000-8000-000000000001'
and plan.product_id=product.id and product.code='menu' and plan.code='foundation';
insert into private.billing_signups(id,tax_document,business_name,responsible_name,email,phone,cycle,payment_method,
base_monthly_cents,cycle_months,discount_bps,total_cents,terms_version,management_token_hash,product_code,
barbershop_id,saas_client_id,trial_ends_at,status)
values('bc300000-0000-4000-8000-000000000001','00000000001901','Billing fixture','Fixture','fixture@example.invalid','11999999999',
'monthly','pix',4990,1,0,4990,'fixture','billing-fixture-token-hash-20261019','menu',
'bc100000-0000-4000-8000-000000000001','bc200000-0000-4000-8000-000000000001',now()-interval '1 day','trial_active');

select extensions.ok(not has_function_privilege('anon','public.backend_billing_webhook_apply(uuid,text,text,timestamptz)','execute'),'anon cannot confirm payment');
select extensions.ok(not has_function_privilege('authenticated','public.backend_billing_lifecycle_suspend(uuid,boolean,timestamptz)','execute'),'authenticated cannot suspend billing');
select extensions.ok(has_function_privilege('service_role','public.backend_billing_webhook_apply(uuid,text,text,timestamptz)','execute'),'service role can confirm payment');
select extensions.ok(has_table_privilege('service_role','public.saas_plans','select'),'billing backend can read commercial catalog');
select extensions.ok(has_table_privilege('service_role','public.platform_billing_events','insert'),'webhook backend can persist its inbox');
select extensions.ok(has_table_privilege('service_role','public.platform_subscriptions','update'),'billing backend can update its subscriptions');

select public.backend_billing_webhook_apply('bc300000-0000-4000-8000-000000000001','fixture-paid-1','approved',now()+interval '99 years');
select extensions.ok((select status='active' and access_until between now()+interval '27 days' and now()+interval '32 days' from private.billing_signups where id='bc300000-0000-4000-8000-000000000001'),'database calculates one monthly period');
select extensions.ok(private.business_product_is_active('bc100000-0000-4000-8000-000000000001','menu'),'payment reopens expired Cardápio entitlement');
select extensions.ok((select subscription.current_period_end=signup.access_until from public.platform_subscriptions subscription
join public.billing_customers customer on customer.id=subscription.billing_customer_id
join public.platform_products product on product.id=subscription.product_id
join private.billing_signups signup on signup.saas_client_id=customer.saas_client_id
where signup.id='bc300000-0000-4000-8000-000000000001' and product.code='menu'),'billing and product periods match');
create temporary table billing_fixture_period as select access_until from private.billing_signups where id='bc300000-0000-4000-8000-000000000001';
select public.backend_billing_webhook_apply('bc300000-0000-4000-8000-000000000001','fixture-paid-1','approved',now()+interval '199 years');
select extensions.is((select access_until from private.billing_signups where id='bc300000-0000-4000-8000-000000000001'),(select access_until from billing_fixture_period),'duplicate payment does not extend the period');
select public.backend_billing_webhook_apply('bc300000-0000-4000-8000-000000000001','fixture-paid-1','rejected',null);
select extensions.is((select status from private.billing_payment_intents where provider_payment_id='fixture-paid-1'),'approved','late rejection cannot undo approved payment');
select extensions.ok(not exists(select 1 from jsonb_array_elements(public.backend_billing_lifecycle_pix_due(now()+interval '48 hours')) value where value->>'id'='bc300000-0000-4000-8000-000000000001'),'no early Pix renewal after trial date has passed');

select public.backend_billing_lifecycle_suspend('bc300000-0000-4000-8000-000000000001',false,now()-interval '1 day');
select extensions.is((select status from private.billing_signups where id='bc300000-0000-4000-8000-000000000001'),'active','stale expiry worker cannot suspend newly paid account');
update private.billing_signups set access_until=now()-interval '1 minute' where id='bc300000-0000-4000-8000-000000000001';
select public.backend_billing_lifecycle_suspend('bc300000-0000-4000-8000-000000000001',false,now()-interval '1 minute');
select extensions.is((select status from private.billing_signups where id='bc300000-0000-4000-8000-000000000001'),'past_due','expired signup becomes past due');
select extensions.ok(not private.business_product_is_active('bc100000-0000-4000-8000-000000000001','menu'),'expired Cardápio is denied');
select extensions.ok(private.business_product_is_active('bc100000-0000-4000-8000-000000000001','agenda'),'Cardápio expiry preserves Agenda entitlement');
select extensions.ok((select active from public.barbershops where id='bc100000-0000-4000-8000-000000000001'),'Cardápio expiry preserves business activation');

select public.backend_billing_webhook_apply('bc300000-0000-4000-8000-000000000001','fixture-paid-2','approved',null);
select extensions.ok(private.business_product_is_active('bc100000-0000-4000-8000-000000000001','menu'),'late payment recovers Cardápio access');
update private.billing_signups set cycle='annual',cycle_months=12,discount_bps=1667,total_cents=49900,access_until=null where id='bc300000-0000-4000-8000-000000000001';
select extensions.is((select discount_bps from private.billing_signups where id='bc300000-0000-4000-8000-000000000001'),1667,'annual offer can be persisted');
select public.backend_billing_webhook_apply('bc300000-0000-4000-8000-000000000001','fixture-annual-1','approved',null);
select extensions.ok((select access_until=now()+interval '12 months' from private.billing_signups where id='bc300000-0000-4000-8000-000000000001'),'annual payment grants exactly twelve calendar months');
update private.billing_signups set access_until=now()+interval '1 day' where id='bc300000-0000-4000-8000-000000000001';
select public.backend_billing_lifecycle_record_pix('bc300000-0000-4000-8000-000000000001','{"purpose":"renewal","amount_cents":49900,"provider_payment_id":"fixture-rejected","external_reference":"fixture-rejected-ref","expires_at":"2030-01-01T00:00:00Z","qr_code":"fixture"}');
select public.backend_billing_lifecycle_record_pix('bc300000-0000-4000-8000-000000000001','{"purpose":"renewal","amount_cents":49900,"provider_payment_id":"fixture-rejected","external_reference":"fixture-rejected-ref","expires_at":"2030-01-01T00:00:00Z","qr_code":"fixture"}');
select extensions.is((select count(*) from private.billing_payment_intents where provider_payment_id='fixture-rejected'),1::bigint,'Pix persistence is idempotent');
select public.backend_billing_webhook_apply('bc300000-0000-4000-8000-000000000001','fixture-rejected','rejected',null);
select extensions.ok((select payment_requested_at is null and status='active' from private.billing_signups where id='bc300000-0000-4000-8000-000000000001'),'rejection permits retry and preserves paid access');
select extensions.ok(exists(select 1 from jsonb_array_elements(public.backend_billing_lifecycle_pix_due(now()+interval '48 hours')) value where value->>'id'='bc300000-0000-4000-8000-000000000001'),'rejected Pix can be generated again');
select public.backend_billing_webhook_apply('bc300000-0000-4000-8000-000000000001','fixture-subscription','subscription_cancelled',null);
select extensions.ok(private.business_product_is_active('bc100000-0000-4000-8000-000000000001','menu'),'cancellation preserves prepaid period');
update private.billing_signups set access_until=now()-interval '1 minute' where id='bc300000-0000-4000-8000-000000000001';
select public.backend_billing_lifecycle_suspend('bc300000-0000-4000-8000-000000000001',true,now()-interval '1 minute');
select extensions.is((select status from private.billing_signups where id='bc300000-0000-4000-8000-000000000001'),'cancelled','cancellation finalizes at period boundary');
select extensions.ok(private.business_product_is_active('bc100000-0000-4000-8000-000000000001','agenda'),'cancellation preserves other product');

select * from extensions.finish();
rollback;
