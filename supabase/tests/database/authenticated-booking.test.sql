begin;
set local search_path = public, extensions;
select extensions.plan(14);

insert into public.barbershops(id,name,slug,segment)
values ('51000000-0000-4000-8000-000000000001','Teste Agenda Autenticada','teste-agenda-autenticada','Teste');
insert into public.business_settings(barbershop_id,display_name,public_slug,segment)
values ('51000000-0000-4000-8000-000000000001','Teste Agenda Autenticada','teste-agenda-autenticada','Teste')
on conflict (barbershop_id) do update set public_slug=excluded.public_slug;
insert into auth.users(id,instance_id,aud,role,email,phone,phone_confirmed_at,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('52000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','booking-a@example.invalid','5500000000001',null,'','{}','{}',now(),now()),
('52000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','booking-b@example.invalid',null,null,'','{}','{}',now(),now());

insert into public.business_appointments(id,barbershop_id,client_user_id,client_name,client_email,client_phone,service,professional,appointment_date,appointment_time,status,created_by)
values
('53000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','Cliente A','booking-a@example.invalid','','Teste','Teste',current_date+10,'10:00','requested','public'),
('53000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000002','Cliente B','booking-b@example.invalid','','Teste','Teste',current_date+10,'11:00','requested','public'),
('53000000-0000-4000-8000-000000000003','51000000-0000-4000-8000-000000000001',null,'Cliente Telefone','phone@example.invalid','5500000000001','Teste','Teste',current_date+10,'12:00','requested','public');

select extensions.ok(not has_function_privilege('anon','public.client_cancel_my_appointment(uuid)','EXECUTE'),'anon não executa cancelamento autenticado');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"52000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.is(jsonb_array_length(public.client_list_my_appointments('teste-agenda-autenticada')),1,'cliente lista somente sua reserva');
select extensions.is(public.client_cancel_my_appointment('53000000-0000-4000-8000-000000000002'),false,'cliente não cancela reserva alheia');
select extensions.lives_ok($$select public.client_cancel_my_appointment('53000000-0000-4000-8000-000000000001')$$,'cliente cancela a própria reserva sem contexto prévio de painel');
reset role;
select extensions.is((select status from public.business_appointments where id='53000000-0000-4000-8000-000000000001'),'cancelled','cancelamento persiste');
select extensions.is((select count(*)::integer from public.appointment_status_events where appointment_id='53000000-0000-4000-8000-000000000001' and to_status='cancelled'),1,'cancelamento gera um evento de auditoria');
select extensions.is((select source from public.appointment_status_events where appointment_id='53000000-0000-4000-8000-000000000001' and to_status='cancelled'),'public_link','origem de autoatendimento é registrada');
select extensions.is(coalesce(current_setting('ogritech.operation_source',true),''),'','RPC restaura contexto de operação');
set local role authenticated;
select extensions.is(public.client_cancel_my_appointment('53000000-0000-4000-8000-000000000001'),false,'repetição não cancela novamente');
select extensions.throws_ok($$select public.client_claim_phone_appointments('teste-agenda-autenticada')$$,'22023','Celular confirmado necessário','telefone não confirmado não permite apropriar reservas');
reset role;
update auth.users set phone_confirmed_at=now() where id='52000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.is(public.client_claim_phone_appointments('teste-agenda-autenticada'),1,'telefone confirmado vincula a reserva correspondente');
select extensions.is(public.client_claim_phone_appointments('teste-agenda-autenticada'),0,'vínculo por telefone é idempotente');
select set_config('request.jwt.claims','{"sub":"52000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select extensions.is(public.client_cancel_my_appointment('53000000-0000-4000-8000-000000000003'),false,'outro usuário não cancela reserva vinculada por telefone');
select extensions.is(jsonb_array_length(public.client_list_my_appointments('teste-agenda-autenticada')),1,'outro usuário continua vendo somente sua reserva');
select * from extensions.finish();
rollback;

