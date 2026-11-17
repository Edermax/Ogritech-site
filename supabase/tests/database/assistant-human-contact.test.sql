begin;
-- Historical scenarios seed contracts from the preceding commercial version.
update public.saas_plans set active=true where catalog_version=1 and product_id=(select id from public.platform_products where code='menu');
select extensions.plan(22);
insert into public.barbershops(id,name,slug,segment) values('ea100000-0000-4000-8000-000000000001','Support fixture','support-fixture','Restaurante');
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id)
values('ea200000-0000-4000-8000-000000000001','Support fixture','Restaurante','Fixture','support@example.invalid','Teste','Encomendas',49.90,'Ativo','ea100000-0000-4000-8000-000000000001');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('ea800000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','support@example.invalid','','{}','{}',now(),now()),
 ('ea800000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','visitor@example.invalid','','{}','{}',now(),now());
insert into public.profiles(id,barbershop_id,full_name,role,active) values
 ('ea800000-0000-4000-8000-000000000001','ea100000-0000-4000-8000-000000000001','Support owner','owner',true),
 ('ea800000-0000-4000-8000-000000000002',null,'Visitor','client',true);
insert into public.billing_customers(saas_client_id,billing_email) values('ea200000-0000-4000-8000-000000000001','support@example.invalid');
insert into public.platform_subscriptions(billing_customer_id,product_id,plan_id,status,base_amount,current_period_end)
select bc.id,p.product_id,p.id,'active',p.monthly_fee,now()+interval '7 days' from public.billing_customers bc,public.saas_plans p
where bc.saas_client_id='ea200000-0000-4000-8000-000000000001' and p.code='foundation' and p.menu_offer_code='encomendas';
create temporary table outbox_counts as select (select count(*) from private.platform_whatsapp_outbox) as wa,(select count(*) from private.platform_email_outbox) as email;
set local role anon;
select extensions.is(public.assistant_contact_options()->'channels','["E-mail"]'::jsonb,'visitors only receive email');
select extensions.ok(not public.assistant_contact_options() ? 'phone','official phone is not included for visitors');
select extensions.throws_ok($$select public.public_submit_assistant_callback('11988887777','','Ligação',true,false,'')$$,'42501',null,'anonymous phone callbacks are blocked');
select extensions.throws_ok($$select public.public_submit_assistant_callback('11988887777','','WhatsApp',true,true,'')$$,'42501',null,'anonymous WhatsApp callbacks are blocked');
select extensions.lives_ok($$select public.public_submit_assistant_callback('','support-lead@example.invalid','E-mail',true,false,'')$$,'visitor can request human email return');
select extensions.lives_ok($$select public.public_submit_platform_contact('Email lead','','','lead-contact@example.invalid','','E-mail','','','','','',array['Ogritech Cardápio'],'{}'::text[],'','','','{}'::jsonb,true,'')$$,'lead contact accepts email without a telephone');
select extensions.throws_ok($$select public.public_submit_platform_contact('Phone lead','','11988887777','lead-call@example.invalid','','WhatsApp','','','','','',array['Ogritech Cardápio'],'{}'::text[],'','','','{}'::jsonb,true,'')$$,'22023',null,'lead contact does not offer phone or WhatsApp');
reset role;
select extensions.ok(exists(select 1 from public.platform_callback_requests where email='support-lead@example.invalid' and status='new' and requested_by is null),'visitor request waits for a human');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ea800000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select extensions.is(public.assistant_contact_options()->'channels','["E-mail"]'::jsonb,'authenticated lead cannot borrow another business subscription');
select set_config('request.jwt.claims','{"sub":"ea800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.is(jsonb_array_length(public.assistant_contact_options()->'channels'),3,'active subscriber receives all three channels');
select extensions.is(public.assistant_contact_options()->>'phone','5516994577762','only the supplied official number is returned');
select extensions.throws_ok($$select public.public_submit_assistant_callback('11988887777','','WhatsApp',true,false,'')$$,'22023',null,'WhatsApp requires its own consent');
select extensions.lives_ok($$select public.public_submit_assistant_callback('11988887777','','WhatsApp',true,true,'')$$,'customer can request WhatsApp return');
reset role;
select extensions.ok(exists(select 1 from public.platform_callback_requests where phone='11988887777' and barbershop_id='ea100000-0000-4000-8000-000000000001' and requested_by='ea800000-0000-4000-8000-000000000001'),'request is associated with the authenticated business');
select extensions.is((select count(*) from private.platform_whatsapp_outbox),(select wa from outbox_counts),'no automatic WhatsApp message replaces a human request');
select extensions.is((select count(*) from private.platform_email_outbox),(select email from outbox_counts),'no automatic email replaces a human request');
update public.platform_subscriptions set status='trial' where billing_customer_id=(select id from public.billing_customers where saas_client_id='ea200000-0000-4000-8000-000000000001');
set local role authenticated;
select extensions.is(jsonb_array_length(public.assistant_contact_options()->'channels'),3,'ongoing free trial receives the same support channels');
reset role;
update public.platform_subscriptions set current_period_end=now()-interval '1 second' where billing_customer_id=(select id from public.billing_customers where saas_client_id='ea200000-0000-4000-8000-000000000001');
set local role authenticated;
select extensions.is(jsonb_array_length(public.assistant_contact_options()->'channels'),1,'expired trial only receives email');
select extensions.throws_ok($$select public.public_submit_assistant_callback('11988887777','','Ligação',true,false,'')$$,'42501',null,'server rechecks expired eligibility at submission');
reset role;
update public.platform_subscriptions set status='active',current_period_end=now()+interval '1 day' where billing_customer_id=(select id from public.billing_customers where saas_client_id='ea200000-0000-4000-8000-000000000001');
update public.profiles set active=false where id='ea800000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.is(jsonb_array_length(public.assistant_contact_options()->'channels'),1,'disabled profile does not retain phone support');
select extensions.is((select count(*) from public.platform_callback_requests),0::bigint,'business team cannot read support queue or other people contacts');
reset role;
select extensions.ok(not has_function_privilege('anon','private.claim_assistant_email(uuid)','EXECUTE'),'visitors still cannot dispatch email');
select * from extensions.finish();
rollback;
