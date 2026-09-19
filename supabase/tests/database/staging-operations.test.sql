begin;
set local search_path = public, extensions;

select extensions.plan(32);
create temporary table public_booking_test_result(payload jsonb);
grant select,insert on public_booking_test_result to anon;

insert into public.barbershops (id, name, slug, segment)
values ('30000000-0000-4000-8000-000000000003', 'STAGING Operações', 'staging-operacoes', 'Teste');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('c0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operations-owner@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('f0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operations-master@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.saas_clients (
  id, name, segment, contact_name, owner_email, origin, plan,
  monthly_fee, status, barbershop_id
) values (
  '33000000-0000-4000-8000-000000000003', 'STAGING Cliente Financeiro',
  'Teste', 'Contato Teste', 'billing-test@example.invalid', 'Teste automatizado',
  'Agenda', 100, 'Ativo', '30000000-0000-4000-8000-000000000003'
);

insert into public.profiles (id, barbershop_id, full_name, role) values
  ('c0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'Owner Operações', 'owner');

insert into public.platform_admins (user_id)
values ('f0000000-0000-4000-8000-000000000002');

insert into public.services (id, barbershop_id, name, duration_minutes, price)
values ('31000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'Serviço Concorrente', 60, 100);

insert into public.employees (id, barbershop_id, name)
values ('32000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'Profissional Concorrente');



set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","email":"operations-owner@example.invalid"}', true);
select extensions.lives_ok(
  $$select public.save_staff_availability(
    '30000000-0000-4000-8000-000000000003',
    '32000000-0000-4000-8000-000000000003',
    array['31000000-0000-4000-8000-000000000003'::uuid],
    jsonb_build_array(
      jsonb_build_object('weekday', extract(dow from current_date + 7)::integer, 'start_time', '09:00', 'end_time', '12:00'),
      jsonb_build_object('weekday', extract(dow from current_date + 7)::integer, 'start_time', '13:00', 'end_time', '18:00')
    ),
    '[{"starts_at":"2099-01-02 09:00","ends_at":"2099-01-02 18:00","reason":"Folga de teste"}]'::jsonb
  )$$,
  'gestor salva serviços, jornada e folga em uma transação'
);
select extensions.is((select count(*)::integer from public.employee_services where employee_id='32000000-0000-4000-8000-000000000003'), 1, 'serviços do profissional são persistidos');
select extensions.is((select count(*)::integer from public.employee_working_hours where employee_id='32000000-0000-4000-8000-000000000003'), 2, 'dois períodos preservam o intervalo da jornada');
select extensions.is((select count(*)::integer from public.employee_time_off where employee_id='32000000-0000-4000-8000-000000000003'), 1, 'folga do profissional é persistida');
select extensions.throws_ok(
  $$select public.save_staff_availability(
    '30000000-0000-4000-8000-000000000003',
    '32000000-0000-4000-8000-000000000003',
    array['31000000-0000-4000-8000-000000000003'::uuid],
    '[{"weekday":1,"start_time":"09:00","end_time":"14:00"},{"weekday":1,"start_time":"13:00","end_time":"18:00"}]'::jsonb,
    '[]'::jsonb
  )$$,
  '22023', 'A jornada contém horários sobrepostos',
  'jornadas sobrepostas são rejeitadas'
);
select extensions.lives_ok(
  $$select public.set_public_booking_settings('30000000-0000-4000-8000-000000000003','staging-operacoes',true)$$,
  'gestor ativa endereço da agenda pública'
);

set local role anon;
select extensions.is((public.public_booking_page('staging-operacoes')->'business'->>'name'), 'STAGING Operações', 'visitante carrega somente o catálogo público');
select extensions.ok(exists(select 1 from public.public_available_slots('staging-operacoes','31000000-0000-4000-8000-000000000003','32000000-0000-4000-8000-000000000003',current_date+7) where slot_time='10:00'::time), 'visitante consulta horário realmente livre');
select extensions.throws_ok(
  $$select public.public_create_appointment('staging-operacoes','31000000-0000-4000-8000-000000000003','32000000-0000-4000-8000-000000000003',current_date+7,'10:00','Cliente Público','publico@example.invalid','11999999999',false,'')$$,
  '22023','É necessário aceitar o aviso de privacidade','consentimento é obrigatório'
);
select extensions.lives_ok(
  $$insert into public_booking_test_result select public.public_create_appointment('staging-operacoes','31000000-0000-4000-8000-000000000003','32000000-0000-4000-8000-000000000003',current_date+7,'10:00','Cliente Público','publico@example.invalid','11999999999',true,'')$$,
  'visitante solicita agendamento sem conta'
);
select extensions.is((select payload->>'status' from public_booking_test_result),'requested','solicitação pública nasce pendente');
select extensions.is((select public.public_get_appointment(payload->>'reference',payload->>'token')->>'status' from public_booking_test_result),'requested','referência e token consultam a reserva');
select extensions.lives_ok(
  $$select public.public_cancel_appointment(payload->>'reference',payload->>'token') from public_booking_test_result$$,
  'link secreto cancela a reserva'
);
select extensions.is((select public.public_get_appointment(payload->>'reference',payload->>'token')->>'status' from public_booking_test_result),'cancelled','consulta reflete cancelamento público');
reset role;
select extensions.is((select cancellation_source from public.business_appointments where public_reference=(select payload->>'reference' from public_booking_test_result)),'public_link','banco registra a origem do cancelamento');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","email":"operations-owner@example.invalid"}', true);
select extensions.lives_ok(
  $$select public.create_appointment(
    '30000000-0000-4000-8000-000000000003',
    '31000000-0000-4000-8000-000000000003',
    '32000000-0000-4000-8000-000000000003',
    current_date + 7, '10:00', 'Cliente Um', 'cliente-um@example.invalid'
  )$$,
  'primeiro agendamento ocupa o horário'
);
select extensions.throws_ok(
  $$select public.create_appointment(
    '30000000-0000-4000-8000-000000000003',
    '31000000-0000-4000-8000-000000000003',
    '32000000-0000-4000-8000-000000000003',
    current_date + 7, '10:30', 'Cliente Dois', 'cliente-dois@example.invalid'
  )$$,
  '23505', 'Horário indisponível',
  'agendamento sobreposto para o mesmo profissional é rejeitado'
);
select extensions.is(
  (select count(*)::integer from public.business_appointments where barbershop_id = '30000000-0000-4000-8000-000000000003' and status <> 'cancelled'),
  1,
  'somente um agendamento permanece no intervalo disputado'
);
select extensions.ok(
  not exists(
    select 1 from public.list_available_slots(
      '30000000-0000-4000-8000-000000000003',
      '31000000-0000-4000-8000-000000000003',
      '32000000-0000-4000-8000-000000000003',
      current_date + 7
    ) where slot_time = '10:00'::time
  ),
  'consulta de disponibilidade remove horário já ocupado'
);

select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated","email":"operations-master@example.invalid"}', true);
select extensions.lives_ok(
  $$select public.platform_create_invoice(
    '33000000-0000-4000-8000-000000000003', current_date + 10,
    '[{"item_type":"subscription","description":"Mensalidade de teste","quantity":1,"unit_amount":100}]'::jsonb,
    0, 0, 'STAGING-BILLING-TEST'
  )$$,
  'platform admin cria fatura'
);
select extensions.is((select status from public.platform_invoices where notes = 'STAGING-BILLING-TEST'), 'open', 'fatura nasce aberta');
select extensions.is((select total from public.platform_invoices where notes = 'STAGING-BILLING-TEST'), 100::numeric, 'total da fatura é calculado');
select extensions.is((select count(*)::integer from public.platform_invoice_items i join public.platform_invoices f on f.id=i.invoice_id where f.notes='STAGING-BILLING-TEST'), 1, 'item da fatura é persistido');
select extensions.ok(exists(select 1 from public.platform_billing_audit_log where action='invoice.created' and details->>'total'='100.00'), 'criação da fatura gera auditoria');

select extensions.lives_ok(
  $$select public.platform_record_payment(
    (select id from public.platform_invoices where notes='STAGING-BILLING-TEST'),
    'pix', 100, 2, 'manual', 'STAGING-PAYMENT-TEST'
  )$$,
  'platform admin registra pagamento'
);
select extensions.is((select status from public.platform_invoices where notes='STAGING-BILLING-TEST'), 'paid', 'pagamento integral quita a fatura');
select extensions.is((select net_amount from public.platform_payments where provider_payment_id='STAGING-PAYMENT-TEST'), 98::numeric, 'taxa é descontada do valor líquido');
select extensions.ok(exists(select 1 from public.platform_billing_audit_log where action='payment.approved'), 'pagamento gera auditoria');

select extensions.lives_ok(
  $$select public.platform_register_refund(
    (select id from public.platform_payments where provider_payment_id='STAGING-PAYMENT-TEST'),
    40, 'refund', 'Estorno parcial automatizado'
  )$$,
  'platform admin registra estorno parcial'
);
select extensions.is((select status from public.platform_invoices where notes='STAGING-BILLING-TEST'), 'partially_refunded', 'fatura registra estorno parcial');
select extensions.is((select status from public.platform_payments where provider_payment_id='STAGING-PAYMENT-TEST'), 'partially_refunded', 'pagamento registra estorno parcial');
select extensions.ok(exists(select 1 from public.platform_billing_audit_log where action='refund.processed'), 'estorno gera auditoria');

select * from extensions.finish();
rollback;
