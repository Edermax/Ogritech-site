begin;
set local search_path=public,extensions;
select extensions.no_plan();
insert into public.barbershops(id,name,slug,segment) values('b7100000-0000-4000-8000-000000000001','Loja Autônoma','branding-fixture','Lanchonete');
insert into public.barbershops(id,name,slug,segment) values('b7100000-0000-4000-8000-000000000002','Outra Loja','branding-other','Restaurante');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('b7200000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','autonomo@example.invalid','','{}','{}',now(),now());
insert into public.platform_admins(user_id) values('b7200000-0000-4000-8000-000000000001');
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id)
values('b7300000-0000-4000-8000-000000000001','Cliente Autônomo','Lanchonete','Gestor','autonomo@example.invalid','Teste','Agenda',97,'Ativo','b7100000-0000-4000-8000-000000000001');
insert into public.profiles(id,barbershop_id,full_name,role) values('b7200000-0000-4000-8000-000000000001','b7100000-0000-4000-8000-000000000001','Gestor Autônomo','owner');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b7200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.lives_ok($$select public.platform_set_product_subscription('b7300000-0000-4000-8000-000000000001','menu',(select plan.id from public.saas_plans plan join public.platform_products product on product.id=plan.product_id where product.code='menu' and plan.code='foundation'),'active',null)$$,'ativa Cardápio');
select extensions.lives_ok($$select public.apply_menu_catalog_template('b7100000-0000-4000-8000-000000000001','snack-bar','branding-fixture-menu')$$,'aplica template');

reset role;
delete from public.platform_admins where user_id='b7200000-0000-4000-8000-000000000001';
insert into storage.objects(bucket_id,name,metadata) values
('menu-images','b7100000-0000-4000-8000-000000000001/11111111-1111-4111-8111-111111111111.png','{"mimetype":"image/png","size":1024}'),
('menu-images','b7100000-0000-4000-8000-000000000001/22222222-2222-4222-8222-222222222222.jpg','{"mimetype":"image/jpeg","size":2048}');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b7200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.ok(not has_function_privilege('anon','public.menu_branding(uuid,text,jsonb)','execute'),'anon cannot alter branding');
select extensions.throws_ok($$select public.menu_branding('b7100000-0000-4000-8000-000000000002','get')$$,'42501','Acesso negado','other tenant branding is not readable');
select extensions.throws_ok($$select public.menu_branding('b7100000-0000-4000-8000-000000000001','save','{"primary_color":"red","accent_color":"#ffffff"}')$$,'22023','Identidade visual inválida','invalid colors are rejected');
select extensions.throws_ok($$select public.menu_branding('b7100000-0000-4000-8000-000000000001','save','{"primary_color":"#111111","accent_color":"#ffffff","logo_path":"b7100000-0000-4000-8000-000000000002/11111111-1111-4111-8111-111111111111.png"}')$$,'42501','Imagem não pertence ao estabelecimento','foreign asset path rejected');
select extensions.throws_ok($$select public.menu_branding('b7100000-0000-4000-8000-000000000001','save','{"primary_color":"#111111","accent_color":"#ffffff","logo_path":"b7100000-0000-4000-8000-000000000001/33333333-3333-4333-8333-333333333333.png"}')$$,'22023','Envie uma imagem JPEG, PNG ou WebP de até 5 MB','missing file rejected');
select extensions.lives_ok($$select public.menu_branding('b7100000-0000-4000-8000-000000000001','save','{"primary_color":"#FFFFFF","accent_color":"#000000","logo_path":"b7100000-0000-4000-8000-000000000001/11111111-1111-4111-8111-111111111111.png","cover_path":"b7100000-0000-4000-8000-000000000001/22222222-2222-4222-8222-222222222222.jpg"}')$$,'manager saves colors logo and cover');
select extensions.is(public.menu_branding('b7100000-0000-4000-8000-000000000001','get')->'identity'->>'primary_color','#ffffff','color normalized');
select extensions.ok((public.menu_branding('b7100000-0000-4000-8000-000000000001','get')->>'has_draft')::boolean=false,'unpublished menu saves immediately');
select extensions.ok(private.menu_branding_asset_is_referenced('b7100000-0000-4000-8000-000000000001/11111111-1111-4111-8111-111111111111.png'),'used logo is protected from deletion');
reset role;
update public.online_menus set published=true,published_at=now() where barbershop_id='b7100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b7200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.lives_ok($$select public.menu_branding('b7100000-0000-4000-8000-000000000001','save','{"primary_color":"#112233","accent_color":"#ff0000"}')$$,'published appearance saved as draft');
select extensions.is(public.public_menu('branding-fixture-menu')->'menu'->'visual_identity'->>'primary_color','#ffffff','public keeps the old appearance');
select extensions.ok((public.menu_branding('b7100000-0000-4000-8000-000000000001','get')->>'has_draft')::boolean,'draft visible to manager');
select extensions.lives_ok($$select public.menu_branding('b7100000-0000-4000-8000-000000000001','publish')$$,'publish appearance atomically');
select extensions.is(public.public_menu('branding-fixture-menu')->'menu'->'visual_identity'->>'primary_color','#112233','public sees new appearance after publish');
select extensions.is(public.public_menu('branding-fixture-menu')->'menu'->'visual_identity'->>'logo_path','','logo removal published');
select extensions.lives_ok($$select public.menu_branding('b7100000-0000-4000-8000-000000000001','save','{"primary_color":"#445566","accent_color":"#ffffff"}')$$,'another draft saved');
select extensions.lives_ok($$select public.menu_branding('b7100000-0000-4000-8000-000000000001','discard')$$,'discard draft');
select extensions.is(public.menu_branding('b7100000-0000-4000-8000-000000000001','get')->'identity'->>'primary_color','#112233','discard restores published identity');
select * from extensions.finish();
rollback;
