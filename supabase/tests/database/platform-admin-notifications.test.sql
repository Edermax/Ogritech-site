begin;
set local search_path=public,extensions;
select extensions.no_plan();
create temporary table notification_baseline as select count(*) as total from public.platform_notifications;

select extensions.ok((select relrowsecurity from pg_class where oid='public.platform_notifications'::regclass),'notification table has RLS');
select extensions.ok(not has_table_privilege('authenticated','public.platform_notifications','SELECT'),'no direct access to notification bodies');
select extensions.ok(not has_table_privilege('authenticated','private.platform_notification_reads','INSERT'),'clients cannot acknowledge for another administrator');
select extensions.ok(not has_function_privilege('anon','public.platform_notification_inbox(integer,bigint)','EXECUTE'),'anonymous visitors cannot read inbox');
select extensions.ok(not has_function_privilege('authenticated','private.capture_platform_notification()','EXECUTE'),'event writer is internal only');

insert into public.barbershops(id,name,slug,segment) values('ef100000-0000-4000-8000-000000000001','Notification Store','notification-store','Restaurante');
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id)
select 'ef300000-0000-4000-8000-000000000001','Notification Store','Restaurante','Fixture','notification-3@example.invalid','Teste',name,monthly_fee,'Ativo','ef100000-0000-4000-8000-000000000001'
from public.saas_plans where code='foundation' and menu_offer_code='encomendas' and active limit 1;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('ef800000-0000-4000-8000-00000000000'||n)::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'notification-'||n||'@example.invalid','','{}','{"full_name":"Pessoa de teste"}',now(),now() from generate_series(1,4) n;
insert into public.profiles(id,full_name,role,active,barbershop_id) select id::uuid,full_name,role,active,'ef100000-0000-4000-8000-000000000001'::uuid from (values
 ('ef800000-0000-4000-8000-000000000001','Admin One','owner',true),
 ('ef800000-0000-4000-8000-000000000002','Admin Two','owner',true),
 ('ef800000-0000-4000-8000-000000000003','Business Owner','owner',true),
 ('ef800000-0000-4000-8000-000000000004','Inactive Admin','owner',false)) as fixture(id,full_name,role,active);
insert into public.platform_admins(user_id) values
 ('ef800000-0000-4000-8000-000000000001'),('ef800000-0000-4000-8000-000000000002'),('ef800000-0000-4000-8000-000000000004');
select extensions.is((select count(*) from public.platform_notifications where source_key like 'user:ef800000%'),4::bigint,'one notification per new login account');
update auth.users set last_sign_in_at=now(),updated_at=now() where id='ef800000-0000-4000-8000-000000000003';
select extensions.is((select count(*) from public.platform_notifications where source_key like 'user:ef800000%'),4::bigint,'ordinary sign-in does not generate another registration');

insert into public.online_menus(id,barbershop_id,slug,title) values('ef200000-0000-4000-8000-000000000001','ef100000-0000-4000-8000-000000000001','notification-store-menu','Notification Store');
insert into public.menu_onboarding_events(barbershop_id,menu_id,event_type) values
 ('ef100000-0000-4000-8000-000000000001','ef200000-0000-4000-8000-000000000001','settings_saved'),
 ('ef100000-0000-4000-8000-000000000001','ef200000-0000-4000-8000-000000000001','published'),
 ('ef100000-0000-4000-8000-000000000001','ef200000-0000-4000-8000-000000000001','unpublished'),
 ('ef100000-0000-4000-8000-000000000001','ef200000-0000-4000-8000-000000000001','published');
select extensions.is((select count(*) from public.platform_notifications where barbershop_id='ef100000-0000-4000-8000-000000000001' and event_type='menu.published'),2::bigint,'every publication counts, drafts and unpublishing do not');

set local role anon;
select extensions.lives_ok($$select public.public_submit_assistant_callback('','notification-lead@example.invalid','E-mail',true,false,'')$$,'anonymous human callback still succeeds');
reset role;
select extensions.is((select count(*) from public.platform_notifications where event_type='support.requested' and body like '%notification-lead@example.invalid%'),1::bigint,'human request produces one administrator notification');
update public.platform_callback_requests set status='contacted' where email='notification-lead@example.invalid';
select extensions.is((select count(*) from public.platform_notifications where event_type='support.requested' and body like '%notification-lead@example.invalid%'),1::bigint,'handling a request does not duplicate its notification');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ef800000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select extensions.throws_ok($$select public.platform_notification_inbox()$$,'42501','Acesso negado','business owners cannot access platform inbox');
select extensions.throws_ok($$select public.platform_mark_notifications_read(999999,null)$$,'42501','Acesso negado','business owners cannot acknowledge platform alerts');
select set_config('request.jwt.claims','{"sub":"ef800000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select extensions.throws_ok($$select public.platform_notification_inbox()$$,'42501','Acesso negado','inactive administrator is denied');
select set_config('request.jwt.claims','{"sub":"ef800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.throws_ok($$select public.platform_notification_inbox(101)$$,'22023','Paginação inválida','page size is bounded');
select extensions.is(jsonb_array_length(public.platform_notification_inbox(2)->'items'),2,'inbox pagination returns the requested number');
select extensions.is(jsonb_typeof(public.platform_notification_inbox()->'items'->0->'id'),'string','bigint cursors are sent without JavaScript precision loss');
select extensions.is(public.platform_notification_inbox(1,(public.platform_notification_inbox(1)->>'next_before_id')::bigint)->'items'->0->>'event_type','menu.published','pagination reaches earlier events');
select public.platform_mark_notifications_read((public.platform_notification_inbox()->>'latest_id')::bigint,(public.platform_notification_inbox()->>'latest_id')::bigint);
select extensions.ok(public.platform_notification_inbox()->'items'->0->>'read_at' is not null,'single notification is acknowledged');
select public.platform_mark_notifications_read((public.platform_notification_inbox()->>'latest_id')::bigint,(public.platform_notification_inbox()->>'latest_id')::bigint);
reset role;
select extensions.is((select count(*) from private.platform_notification_reads where user_id='ef800000-0000-4000-8000-000000000001'),1::bigint,'repeated acknowledgement is idempotent');
select set_config('test.notification_boundary',(select max(id)::text from public.platform_notifications),true);
-- A request arriving after the fetched inbox must survive "mark all".
insert into public.platform_callback_requests(email,contact_channel,privacy_consent_at) values('notification-race@example.invalid','E-mail',now());
set local role authenticated;
select public.platform_mark_notifications_read(current_setting('test.notification_boundary')::bigint,null);
select extensions.is((public.platform_notification_inbox()->>'unread_count')::bigint,1::bigint,'mark all preserves alerts arriving after its boundary');
select set_config('request.jwt.claims','{"sub":"ef800000-0000-4000-8000-000000000002","role":"authenticated"}',true);
reset role;
select extensions.is((select count(*) from private.platform_notification_reads where user_id='ef800000-0000-4000-8000-000000000002'),0::bigint,'read state is separate for each administrator');
select extensions.is((public.platform_notification_inbox()->>'unread_count')::bigint,(select total+8 from notification_baseline),'another administrator still sees every event as unread');

savepoint rolled_back_event;
insert into public.platform_callback_requests(email,contact_channel,privacy_consent_at) values('notification-rollback@example.invalid','E-mail',now());
rollback to savepoint rolled_back_event;
select extensions.is((select count(*) from public.platform_notifications where body like '%notification-rollback@example.invalid%'),0::bigint,'a rolled back event never produces a ghost notification');
select * from extensions.finish();
rollback;
