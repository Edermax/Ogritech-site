-- Historical fixture for the authorized staging run; do not apply to production.
begin;

insert into public.barbershops(id,name,slug,segment) values
('e2100000-0000-4000-8000-000000000001','Cardapio QA APRO','cardapio-qa-apro-20261020','Restaurante');
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id)
values('e2200000-0000-4000-8000-000000000001','Cardapio QA APRO','Restaurante','Fixture','test_user_7651078366654254160@testuser.com','Teste','Agenda',97,'Ativo','e2100000-0000-4000-8000-000000000001');
insert into public.platform_subscriptions(billing_customer_id,plan_id,product_id,status,base_amount,current_period_end)
select customer.id,plan.id,product.id,'trial',49.90,now()-interval '1 day'
from public.billing_customers customer,public.saas_plans plan,public.platform_products product
where customer.saas_client_id='e2200000-0000-4000-8000-000000000001'
and plan.product_id=product.id and product.code='menu' and plan.code='foundation';
insert into private.billing_signups(id,tax_document,business_name,responsible_name,email,phone,cycle,payment_method,
base_monthly_cents,cycle_months,discount_bps,total_cents,terms_version,management_token_hash,product_code,
barbershop_id,saas_client_id,trial_ends_at,status)
values('e2300000-0000-4000-8000-000000000001','00000000002002','Cardapio QA APRO','Fixture','test_user_7651078366654254160@testuser.com','11999999999',
'monthly','pix',4990,1,0,4990,'fixture','qa-disabled-management-token-no-public-access','menu',
'e2100000-0000-4000-8000-000000000001','e2200000-0000-4000-8000-000000000001',now()-interval '1 day','trial_active');

commit;
