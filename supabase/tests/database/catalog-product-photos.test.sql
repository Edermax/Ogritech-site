begin;
set local search_path=public,extensions;
select extensions.no_plan();
insert into public.barbershops(id,name,slug,segment) values('cf100000-0000-4000-8000-000000000001','Fotos Teste','photos-fixture','Confeitaria');
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id)
values('cf200000-0000-4000-8000-000000000001','Fotos Teste','Confeitaria','Fixture','photos@example.invalid','Teste','Catálogo Completo',29.90,'Ativo','cf100000-0000-4000-8000-000000000001');
insert into public.billing_customers(saas_client_id,billing_email) values('cf200000-0000-4000-8000-000000000001','photos@example.invalid');
insert into public.platform_subscriptions(billing_customer_id,product_id,plan_id,status,billing_cycle,base_amount,current_period_start,current_period_end)
select bc.id,p.product_id,p.id,'active','monthly',29.90,now(),now()+interval '30 days' from public.billing_customers bc,public.saas_plans p where bc.saas_client_id='cf200000-0000-4000-8000-000000000001' and p.code='catalogo-completo';
insert into public.business_whatsapp_shares(barbershop_id,phone) values('cf100000-0000-4000-8000-000000000001','5511999999999');
insert into auth.users(id,instance_id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('cf800000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','photos@example.invalid','{}','{}',now(),now());
insert into public.profiles(id,barbershop_id,full_name,role,active) values('cf800000-0000-4000-8000-000000000001','cf100000-0000-4000-8000-000000000001','Photo owner','owner',true);
insert into storage.objects(bucket_id,name,metadata) select 'menu-images','cf100000-0000-4000-8000-000000000001/'||n||n||n||n||n||n||n||n||'-1111-4111-8111-111111111111.webp','{"mimetype":"image/webp","size":1024}'::jsonb from unnest(array['1','2','3','4']) n;
insert into storage.objects(bucket_id,name,metadata) values
 ('menu-images','cf100000-0000-4000-8000-000000000001/55555555-1111-4111-8111-111111111111.webp','{"mimetype":"image/webp","size":5242881}'),
 ('menu-images','cf100000-0000-4000-8000-000000000001/66666666-1111-4111-8111-111111111111.webp','{"mimetype":"application/pdf","size":1024}');
create function pg_temp.photo_path(n text) returns text language sql immutable as $$select 'cf100000-0000-4000-8000-000000000001/'||repeat(n,8)||'-1111-4111-8111-111111111111.webp'$$;
create function pg_temp.photo_payload(images jsonb,principal text default '1') returns jsonb language sql as $$
 select jsonb_build_object('id',(select id from public.menu_items where barbershop_id='cf100000-0000-4000-8000-000000000001' and name='Produto de teste'),'category_name','Produtos','name','Produto de teste','image_url','https://fixture.supabase.co/storage/v1/object/public/menu-images/'||pg_temp.photo_path(principal),'prices','[{"label":"Unidade","price":25}]'::jsonb,'metadata',jsonb_build_object('gallery_images',images))
$$;
-- Exercise Storage RLS directly inside this rolled-back test transaction.
grant select,delete on storage.objects to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"cf800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.apply_menu_catalog_template('cf100000-0000-4000-8000-000000000001','confectionery','photos-fixture');
select extensions.is(public.menu_onboarding_status('cf100000-0000-4000-8000-000000000001')->>'product_image_limit','3','Complete receives three photos');
select extensions.lives_ok($$select public.save_menu_catalog_item('cf100000-0000-4000-8000-000000000001',pg_temp.photo_payload(jsonb_build_array(pg_temp.photo_path('2'),pg_temp.photo_path('3'))))$$,'Complete saves cover plus two images');
select extensions.is((select jsonb_array_length(metadata->'gallery_images') from public.menu_items where barbershop_id='cf100000-0000-4000-8000-000000000001'),2,'additional photos persisted');
select extensions.throws_ok($$select public.save_menu_catalog_item('cf100000-0000-4000-8000-000000000001',pg_temp.photo_payload(jsonb_build_array(pg_temp.photo_path('2'),pg_temp.photo_path('3'),pg_temp.photo_path('4'))))$$,'22023',null,'fourth photo rejected');
select extensions.throws_ok($$select public.save_menu_catalog_item('cf100000-0000-4000-8000-000000000001',pg_temp.photo_payload(jsonb_build_array(pg_temp.photo_path('1'))))$$,'22023',null,'duplicate cover rejected');
select extensions.throws_ok($$select public.save_menu_catalog_item('cf100000-0000-4000-8000-000000000001',pg_temp.photo_payload(jsonb_build_array(pg_temp.photo_path('2'),pg_temp.photo_path('2'))))$$,'22023',null,'repeated gallery photo rejected');
select extensions.throws_ok($$select public.save_menu_catalog_item('cf100000-0000-4000-8000-000000000001',pg_temp.photo_payload('["cf100000-0000-4000-8000-000000000002/11111111-1111-4111-8111-111111111111.webp"]'))$$,'22023',null,'cross-tenant photo rejected');
select extensions.throws_ok($$select public.save_menu_catalog_item('cf100000-0000-4000-8000-000000000001',pg_temp.photo_payload(jsonb_build_array(pg_temp.photo_path('5'))))$$,'22023',null,'oversized stored object rejected');
select extensions.throws_ok($$select public.save_menu_catalog_item('cf100000-0000-4000-8000-000000000001',pg_temp.photo_payload(jsonb_build_array(pg_temp.photo_path('6'))))$$,'22023',null,'wrong stored MIME rejected');
select extensions.throws_ok($$select public.save_menu_catalog_item('cf100000-0000-4000-8000-000000000001',pg_temp.photo_payload(jsonb_build_array(pg_temp.photo_path('7'))))$$,'22023',null,'missing storage object rejected');
select extensions.throws_ok($$select public.save_menu_catalog_item('cf100000-0000-4000-8000-000000000001',pg_temp.photo_payload('null'))$$,'22023',null,'null gallery rejected');
select extensions.ok(private.menu_branding_asset_is_referenced(pg_temp.photo_path('2')),'gallery photos protected from deletion');
-- Hosted Storage also rejects direct SQL deletion before checking RLS.
-- Both protections must leave the referenced fixture object intact.
do $delete$ begin
 delete from storage.objects where bucket_id='menu-images' and name=pg_temp.photo_path('2');
exception when insufficient_privilege then
 if sqlerrm not like 'Direct deletion from storage tables is not allowed%' then raise; end if;
end $delete$;
reset role;
select extensions.ok(exists(select 1 from storage.objects where bucket_id='menu-images' and name=pg_temp.photo_path('2')),'Storage RLS blocks deleting a referenced gallery photo');
select extensions.ok(not has_function_privilege('authenticated','private.validate_catalog_product_images(uuid,text,jsonb,jsonb)','execute'),'validator is internal');
update public.platform_subscriptions set plan_id=(select id from public.saas_plans where code='catalogo-essencial') where billing_customer_id=(select id from public.billing_customers where saas_client_id='cf200000-0000-4000-8000-000000000001');
set local role authenticated;
select extensions.is(public.menu_onboarding_status('cf100000-0000-4000-8000-000000000001')->>'product_image_limit','1','Essential receives one photo');
select extensions.lives_ok($$select public.save_menu_catalog_item('cf100000-0000-4000-8000-000000000001',pg_temp.photo_payload(jsonb_build_array(pg_temp.photo_path('2'),pg_temp.photo_path('3')),'4'))$$,'downgrade preserves existing extra photos and permits cover replacement');
select extensions.throws_ok($$select public.save_menu_catalog_item('cf100000-0000-4000-8000-000000000001',pg_temp.photo_payload(jsonb_build_array(pg_temp.photo_path('1'),pg_temp.photo_path('3')),'4'))$$,'22023',null,'Essential cannot replace a preserved gallery photo');
select extensions.throws_ok($$update public.menu_items set metadata=jsonb_set(metadata,'{gallery_images}',jsonb_build_array(pg_temp.photo_path('1'))) where barbershop_id='cf100000-0000-4000-8000-000000000001'$$,'22023',null,'direct table mutation cannot bypass plan limit');
reset role;
update public.online_menus set published=true,published_at=now() where barbershop_id='cf100000-0000-4000-8000-000000000001';
select extensions.is(public.public_menu('photos-fixture')->'menu'->>'product_image_limit','1','public Essential limit is explicit');
select extensions.ok(not(jsonb_path_query_first(public.public_menu('photos-fixture'),'$.categories[*].items[*].metadata') ? 'gallery_images'),'Essential public API omits preserved gallery paths');
select extensions.is((select jsonb_array_length(metadata->'gallery_images') from public.menu_items where barbershop_id='cf100000-0000-4000-8000-000000000001'),2,'downgrade never deletes stored photos');
update public.platform_subscriptions set plan_id=(select id from public.saas_plans where code='catalogo-completo'),status='trial' where billing_customer_id=(select id from public.billing_customers where saas_client_id='cf200000-0000-4000-8000-000000000001');
select extensions.is(public.public_menu('photos-fixture')->'menu'->>'product_image_limit','3','Complete trial includes three photos');
select extensions.is(jsonb_array_length(jsonb_path_query_first(public.public_menu('photos-fixture'),'$.categories[*].items[*].metadata.gallery_images')),2,'upgrade exposes preserved gallery again');
set local role authenticated;
select extensions.lives_ok($$select public.save_menu_catalog_draft('cf100000-0000-4000-8000-000000000001',jsonb_build_object('categories',jsonb_build_array(jsonb_build_object('name','Produtos','menu_items',(select jsonb_agg(to_jsonb(i)||jsonb_build_object('metadata',jsonb_build_object('gallery_images',jsonb_build_array(pg_temp.photo_path('1'),pg_temp.photo_path('3'))),'menu_item_prices','[{"label":"Unidade","price":30}]'::jsonb)) from public.menu_items i where i.barbershop_id='cf100000-0000-4000-8000-000000000001')))))$$,'published draft validates its gallery');
select extensions.ok(private.menu_branding_asset_is_referenced(pg_temp.photo_path('1')),'saved draft protects photos even before publication');
select extensions.lives_ok($$select public.publish_menu_catalog_draft('cf100000-0000-4000-8000-000000000001')$$,'atomic publication persists gallery');
select extensions.is((select metadata->'gallery_images'->>0 from public.menu_items where barbershop_id='cf100000-0000-4000-8000-000000000001'),pg_temp.photo_path('1'),'gallery order survives publication');
reset role;
update public.platform_subscriptions set plan_id=(select id from public.saas_plans where code='catalogo-essencial'),status='active' where billing_customer_id=(select id from public.billing_customers where saas_client_id='cf200000-0000-4000-8000-000000000001');
set local role authenticated;
select extensions.throws_ok($$select public.save_menu_catalog_draft('cf100000-0000-4000-8000-000000000001',jsonb_build_object('categories',jsonb_build_array(jsonb_build_object('name','Produtos','menu_items',(select jsonb_agg(to_jsonb(i)||jsonb_build_object('metadata',jsonb_build_object('gallery_images',jsonb_build_array(pg_temp.photo_path('2'))),'menu_item_prices','[{"label":"Unidade","price":30}]'::jsonb)) from public.menu_items i where i.barbershop_id='cf100000-0000-4000-8000-000000000001')))))$$,'22023',null,'Essential cannot bypass limit with a published draft');
select * from extensions.finish();
rollback;
