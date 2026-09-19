begin;
set local search_path = public, extensions;
select extensions.plan(16);
insert into public.saas_plans(name,monthly_fee,description,max_users,max_professionals,max_services)
values ('TESTE_CAPACIDADE_FASE03',0,'Somente teste transacional',1,1,1);
insert into public.barbershops(id,name,slug,segment)
values ('61000000-0000-4000-8000-000000000001','Teste Capacidade','teste-capacidade-fase03','Teste');
insert into public.saas_clients(name,segment,contact_name,origin,plan,barbershop_id)
values ('Teste Capacidade Fase03','Teste','Fixture','Teste','TESTE_CAPACIDADE_FASE03','61000000-0000-4000-8000-000000000001');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('62000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','capacity-owner@example.invalid','','{}','{}',now(),now()),
('62000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','capacity-client@example.invalid','','{}','{}',now(),now());

select extensions.lives_ok($$insert into public.services(id,barbershop_id,name,price,duration_minutes) values('63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','Teste 1',10,30)$$,'primeiro serviço cabe no plano');
select extensions.throws_ok($$insert into public.services(id,barbershop_id,name,price,duration_minutes) values('63000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','Teste 2',10,30)$$,'P0001',null,'segundo serviço ativo excede limite');
update public.services set active=false where id='63000000-0000-4000-8000-000000000001';
select extensions.lives_ok($$insert into public.services(id,barbershop_id,name,price,duration_minutes) values('63000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','Teste 2',10,30)$$,'inativação libera capacidade');
select extensions.throws_ok($$update public.services set active=true where id='63000000-0000-4000-8000-000000000001'$$,'P0001',null,'reativação também respeita limite');
update public.saas_plans set max_services=2 where name='TESTE_CAPACIDADE_FASE03';
select extensions.lives_ok($$update public.services set active=true where id='63000000-0000-4000-8000-000000000001'$$,'aumento do limite permite reativar');
select extensions.throws_ok($$update public.saas_plans set max_services=1 where name='TESTE_CAPACIDADE_FASE03'$$,'P0001',null,'redução abaixo do consumo é rejeitada');
select extensions.is((select max_services from public.saas_plans where name='TESTE_CAPACIDADE_FASE03'),2,'redução rejeitada preserva limite anterior');
select extensions.lives_ok($$insert into public.employees(barbershop_id,name) values('61000000-0000-4000-8000-000000000001','Profissional 1')$$,'primeiro profissional cabe no plano');
select extensions.throws_ok($$insert into public.employees(barbershop_id,name) values('61000000-0000-4000-8000-000000000001','Profissional 2')$$,'P0001',null,'segundo profissional excede limite');
select extensions.lives_ok($$insert into public.profiles(id,barbershop_id,full_name,role) values('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','Owner Teste','owner')$$,'primeiro acesso operacional cabe no plano');
select extensions.throws_ok($$insert into public.profiles(id,barbershop_id,full_name,role) values('62000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','Segundo Acesso','admin')$$,'P0001',null,'segundo acesso operacional excede limite');
select extensions.lives_ok($$insert into public.profiles(id,barbershop_id,full_name,role) values('62000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','Cliente Teste','client')$$,'cliente final não consome acesso operacional');
select extensions.throws_ok($$update public.profiles set role='admin' where id='62000000-0000-4000-8000-000000000002'$$,'P0001',null,'promoção de cliente respeita limite');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"62000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.is((public.business_plan_capacity('61000000-0000-4000-8000-000000000001')->>'active_users')::integer,1,'gestor consulta consumo real');
select set_config('request.jwt.claims','{"sub":"62000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select extensions.throws_ok($$select public.business_plan_capacity('61000000-0000-4000-8000-000000000001')$$,'42501',null,'cliente não consulta capacidade administrativa');
reset role;
update public.profiles set active=false where id='62000000-0000-4000-8000-000000000001';
select extensions.lives_ok($$update public.profiles set role='admin' where id='62000000-0000-4000-8000-000000000002'$$,'inativação de acesso libera promoção');
select * from extensions.finish();
rollback;
