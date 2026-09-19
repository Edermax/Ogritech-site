begin;
set local search_path = public, extensions;
select extensions.plan(20);

select extensions.has_table('public','appointment_status_events','auditoria operacional existe');
select extensions.has_table('public','appointment_notifications','central de notificacoes existe');
select extensions.has_function('public','transition_appointment_status',array['uuid','text','timestamp with time zone','text'],'RPC atomica de status existe');
select extensions.has_function('public','mark_appointment_notification_read',array['uuid'],'RPC de leitura existe');
select extensions.is((select relrowsecurity from pg_class where oid='public.appointment_status_events'::regclass),true,'RLS ativa na auditoria');
select extensions.is((select relrowsecurity from pg_class where oid='public.appointment_notifications'::regclass),true,'RLS ativa nas notificacoes');
select extensions.ok(not has_function_privilege('anon','public.transition_appointment_status(uuid,text,timestamp with time zone,text)','EXECUTE'),'anon nao altera status');
select extensions.ok(has_function_privilege('authenticated','public.transition_appointment_status(uuid,text,timestamp with time zone,text)','EXECUTE'),'equipe autenticada usa a RPC');

insert into public.barbershops(id,name,slug,segment)
values('41000000-0000-4000-8000-000000000001','Operacoes Atomicas','operacoes-atomicas','Teste');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('42000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','atomic-owner@example.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
insert into public.saas_clients(name,segment,contact_name,origin,plan,barbershop_id)
values('STAGING Plano Atomico','Teste','Fixture','Teste automatizado','Agenda','41000000-0000-4000-8000-000000000001');
insert into public.profiles(id,barbershop_id,full_name,role)
values('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','Owner Atomico','owner');
insert into public.business_appointments(
  id,barbershop_id,client_name,client_email,service,professional,
  appointment_date,appointment_time,status,created_by
) values(
  '43000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',
  'Cliente Atomico','cliente-atomico@example.invalid','Servico Teste','Profissional Teste',
  current_date+10,'15:00','requested','public'
);

create temporary table atomic_versions(initial_updated_at timestamptz);
insert into atomic_versions select updated_at from public.business_appointments where id='43000000-0000-4000-8000-000000000001';
grant select on atomic_versions to authenticated;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"42000000-0000-4000-8000-000000000001","role":"authenticated","email":"atomic-owner@example.invalid"}',true);

select extensions.throws_ok(
  $$update public.business_appointments set status='confirmed' where id='43000000-0000-4000-8000-000000000001'$$,
  '42501','Use a operacao atomica para alterar o status do agendamento',
  'alteracao direta de status e bloqueada'
);

select extensions.lives_ok(
  $$select public.transition_appointment_status(
    '43000000-0000-4000-8000-000000000001','confirmed',
    (select initial_updated_at from atomic_versions),'Confirmado por telefone'
  )$$,
  'confirmacao conclui em uma transacao'
);
select extensions.is((select status from public.business_appointments where id='43000000-0000-4000-8000-000000000001'),'confirmed','status confirmado foi persistido');
select extensions.is((select count(*)::integer from public.appointment_status_events where appointment_id='43000000-0000-4000-8000-000000000001'),2,'criacao e confirmacao possuem auditoria');
select extensions.is((select note from public.appointment_status_events where appointment_id='43000000-0000-4000-8000-000000000001' and to_status='confirmed'),'Confirmado por telefone','observacao integra a auditoria');
select extensions.is((select count(*)::integer from public.appointment_notifications where appointment_id='43000000-0000-4000-8000-000000000001' and channel='in_app'),2,'notificacoes internas acompanham os eventos');
select extensions.is((select count(*)::integer from public.appointment_notifications where appointment_id='43000000-0000-4000-8000-000000000001' and channel='email' and status='queued'),2,'emails ficam na fila duravel');

select extensions.throws_ok(
  $$select public.transition_appointment_status(
    '43000000-0000-4000-8000-000000000001','completed',
    (select initial_updated_at from atomic_versions),''
  )$$,
  '40001','Este agendamento foi alterado por outra pessoa. Atualize a agenda e tente novamente.',
  'versao antiga nao sobrescreve atualizacao concorrente'
);

select extensions.lives_ok(
  $$select public.transition_appointment_status(
    '43000000-0000-4000-8000-000000000001','completed',
    (select updated_at from public.business_appointments where id='43000000-0000-4000-8000-000000000001'),'Atendimento realizado'
  )$$,
  'estado confirmado pode ser concluido'
);
select extensions.throws_ok(
  $$select public.transition_appointment_status(
    '43000000-0000-4000-8000-000000000001','cancelled',
    (select updated_at from public.business_appointments where id='43000000-0000-4000-8000-000000000001'),''
  )$$,
  '22023','Transicao de status invalida: completed -> cancelled',
  'estado terminal nao pode ser reaberto'
);
select extensions.ok(public.mark_appointment_notification_read((select id from public.appointment_notifications where appointment_id='43000000-0000-4000-8000-000000000001' and channel='in_app' and status='unread' order by created_at limit 1)),'notificacao e marcada como lida pela equipe');
select extensions.is((select count(*)::integer from public.appointment_notifications where appointment_id='43000000-0000-4000-8000-000000000001' and channel='in_app' and status='read'),1,'leitura e registrada com estado proprio');

select * from extensions.finish();
rollback;
