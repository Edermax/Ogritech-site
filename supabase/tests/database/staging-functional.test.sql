begin;
set local search_path = public, extensions;

select extensions.plan(20);

insert into public.barbershops (id, name, slug, segment) values
  ('10000000-0000-4000-8000-000000000001', 'STAGING RLS Empresa A', 'staging-rls-empresa-a', 'Teste'),
  ('20000000-0000-4000-8000-000000000002', 'STAGING RLS Empresa B', 'staging-rls-empresa-b', 'Teste');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a0000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'employee-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a0000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'client-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('b0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('f0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'platform-admin@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.saas_clients (name, segment, contact_name, origin, plan, barbershop_id) values
  ('STAGING RLS Plano A', 'Teste', 'Fixture A', 'Teste automatizado', 'Agenda', '10000000-0000-4000-8000-000000000001'),
  ('STAGING RLS Plano B', 'Teste', 'Fixture B', 'Teste automatizado', 'Agenda', '20000000-0000-4000-8000-000000000002');
insert into public.employees (id, barbershop_id, name) values
  ('e0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Funcionário A');

insert into public.profiles (id, barbershop_id, full_name, role, employee_id) values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Owner A', 'owner', null),
  ('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Admin A', 'admin', null),
  ('a0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Employee A', 'employee', 'e0000000-0000-4000-8000-000000000001'),
  ('a0000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'Client A', 'client', null),
  ('b0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'Owner B', 'owner', null);

insert into public.platform_admins (user_id) values
  ('f0000000-0000-4000-8000-000000000001');

insert into public.services (barbershop_id, name, price, duration_minutes) values
  ('10000000-0000-4000-8000-000000000001', 'Serviço A', 10, 30),
  ('20000000-0000-4000-8000-000000000002', 'Serviço B', 20, 30);

create function pg_temp.attempt_cross_business_update()
returns integer
language plpgsql
security invoker
as $$
declare affected integer;
begin
  update public.barbershops
  set name = 'Ataque cruzado admin'
  where id = '20000000-0000-4000-8000-000000000002';
  get diagnostics affected = row_count;
  return affected;
end
$$;

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","email":"owner-a@example.invalid"}', true);
select extensions.ok(public.is_business_manager('10000000-0000-4000-8000-000000000001'), 'owner gerencia a própria empresa');
select extensions.ok(not public.is_business_manager('20000000-0000-4000-8000-000000000002'), 'owner não gerencia outra empresa');
select extensions.is((select count(*)::integer from public.barbershops), 1, 'owner enxerga somente a própria empresa');
select extensions.is((select count(*)::integer from public.services), 1, 'owner enxerga somente serviços da própria empresa');
select extensions.is((select count(*)::integer from public.profiles), 4, 'owner enxerga somente perfis da própria empresa');
select extensions.lives_ok($$insert into public.services (barbershop_id, name, price, duration_minutes) values ('10000000-0000-4000-8000-000000000001', 'Criado pelo owner', 30, 30)$$, 'owner cria serviço na própria empresa');
select extensions.throws_ok($$insert into public.services (barbershop_id, name, price, duration_minutes) values ('20000000-0000-4000-8000-000000000002', 'Ataque cruzado owner', 30, 30)$$, '42501', null, 'owner não cria serviço em outra empresa');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated","email":"admin-a@example.invalid"}', true);
select extensions.ok(public.is_business_manager('10000000-0000-4000-8000-000000000001'), 'admin gerencia a própria empresa');
select extensions.is((select count(*)::integer from public.services), 2, 'admin vê serviços da própria empresa');
select extensions.is(pg_temp.attempt_cross_business_update(), 0, 'admin não altera outra empresa');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated","email":"employee-a@example.invalid"}', true);
select extensions.ok(public.is_business_team('10000000-0000-4000-8000-000000000001'), 'employee integra a equipe da própria empresa');
select extensions.ok(not public.is_business_manager('10000000-0000-4000-8000-000000000001'), 'employee não possui poder de gestor');
select extensions.is((select count(*)::integer from public.services), 2, 'employee vê somente serviços da própria empresa');
select extensions.throws_ok($$insert into public.services (barbershop_id, name, price, duration_minutes) values ('10000000-0000-4000-8000-000000000001', 'Ataque employee', 30, 30)$$, '42501', null, 'employee não cria serviços');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000004","role":"authenticated","email":"client-a@example.invalid"}', true);
select extensions.ok(public.belongs_to_barbershop('10000000-0000-4000-8000-000000000001'), 'client pertence à própria empresa');
select extensions.ok(not public.is_business_team('10000000-0000-4000-8000-000000000001'), 'client não integra equipe operacional');
select extensions.is((select count(*)::integer from public.services), 2, 'client vê somente serviços da própria empresa');

select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated","email":"owner-b@example.invalid"}', true);
select extensions.is((select count(*)::integer from public.services), 1, 'segunda empresa não enxerga serviços da primeira');

select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated","email":"platform-admin@example.invalid"}', true);
select extensions.ok(public.is_platform_admin(), 'platform admin é reconhecido');
select extensions.is((
  select count(*)::integer from public.barbershops
  where id in (
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002'
  )
), 2, 'platform admin possui visão global das empresas do ensaio');

select * from extensions.finish();
rollback;
