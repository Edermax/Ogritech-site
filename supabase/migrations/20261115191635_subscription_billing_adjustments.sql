-- Administrative monthly waivers and manual outgoing Pix preparations.
alter table public.platform_invoices add column is_monthly_waived boolean not null default false;
alter table private.billing_signups add column payment_selection_token uuid;
alter table private.billing_signups add column payment_selection_started_at timestamptz;

-- Hold the billing choice across the provider call. A waiver cannot race a new checkout.
create function public.backend_billing_payment_choice_claim(target_signup_id uuid,expected_updated_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare signup private.billing_signups; token uuid:=gen_random_uuid();
begin
 select * into strict signup from private.billing_signups where id=target_signup_id for update;
 if signup.payment_selection_token is not null then raise exception 'Uma configuração de pagamento está em andamento. Atualize a assinatura ou procure o suporte.' using errcode='55000'; end if;
 if exists(select 1 from private.billing_pix_requests pr where pr.signup_id=signup.id and pr.boundary=coalesce(signup.access_until,signup.trial_ends_at) and pr.previous_payment_id is not distinct from signup.provider_payment_id and pr.expires_at>now()) then raise exception 'Uma cobrança Pix está sendo preparada. Atualize a assinatura antes de alterar o pagamento.' using errcode='55000'; end if;
 if signup.updated_at is distinct from expected_updated_at then raise exception 'A mensalidade foi atualizada. Confira os dados antes de configurar o pagamento.' using errcode='40001'; end if;
 update private.billing_signups set payment_selection_token=token,payment_selection_started_at=now() where id=signup.id;
 return jsonb_build_object('token',token);
end $$;
create function public.backend_billing_payment_choice_release(target_signup_id uuid,target_token uuid) returns void language sql security definer set search_path='' as $$
 update private.billing_signups set payment_selection_token=null,payment_selection_started_at=null where id=target_signup_id and payment_selection_token=target_token
$$;
revoke all on function public.backend_billing_payment_choice_claim(uuid,timestamptz),public.backend_billing_payment_choice_release(uuid,uuid) from public,anon,authenticated;
grant execute on function public.backend_billing_payment_choice_claim(uuid,timestamptz),public.backend_billing_payment_choice_release(uuid,uuid) to service_role;
create table private.subscription_refund_transfers (
 id uuid primary key,
 subscription_id uuid not null references public.platform_subscriptions(id) on delete restrict,
 refund_id uuid not null unique references public.platform_refunds(id) on delete restrict,
 key_type text not null check(key_type in ('cpf','cnpj','email','phone','random')),
 pix_key text not null check(length(pix_key) between 1 and 77),
 receiver_name text not null check(length(receiver_name) between 2 and 80),
 receiver_city text not null check(length(receiver_city) between 2 and 60),
 status text not null default 'prepared' check(status in ('prepared','completed','cancelled')),
 bank_reference text,
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 created_by uuid not null references auth.users(id) on delete restrict,
 check(status<>'completed' or (bank_reference is not null and completed_at is not null))
);
create index subscription_refund_transfers_subscription_idx on private.subscription_refund_transfers(subscription_id,created_at desc);
create unique index subscription_refund_bank_reference_idx on private.subscription_refund_transfers(bank_reference) where status='completed';
create index subscription_refund_transfers_creator_idx on private.subscription_refund_transfers(created_by);
alter table private.subscription_refund_transfers enable row level security;
revoke all on private.subscription_refund_transfers from public,anon,authenticated;

create table public.subscription_month_waivers (
 id uuid primary key default gen_random_uuid(),
 subscription_id uuid not null references public.platform_subscriptions(id) on delete restrict,
 competence date not null check(extract(day from competence)=1),
 amount_cents integer not null check(amount_cents>0),
 period_start timestamptz not null,
 period_end timestamptz not null check(period_end>period_start),
 invoice_id uuid not null references public.platform_invoices(id) on delete restrict,
 note text not null default '' check(length(note)<=500),
 created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 unique(subscription_id,competence)
);
create index subscription_month_waivers_invoice_idx on public.subscription_month_waivers(invoice_id);
create index subscription_month_waivers_creator_idx on public.subscription_month_waivers(created_by);
alter table public.subscription_month_waivers enable row level security;
revoke all on public.subscription_month_waivers from public,anon,authenticated;
grant select on public.subscription_month_waivers to authenticated;
create policy "Platform admins read monthly waivers" on public.subscription_month_waivers for select to authenticated using((select public.is_platform_admin()));

-- All entrypoints below are platform-admin only. No caller-selected tenant is trusted.
create function private.subscription_finance(target_subscription_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare subscription public.platform_subscriptions; customer public.billing_customers; signup private.billing_signups; boundary timestamptz; result jsonb;
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
 select s.* into strict subscription from public.platform_subscriptions s join public.platform_products p on p.id=s.product_id where s.id=target_subscription_id and p.code='menu';
 select * into strict customer from public.billing_customers where id=subscription.billing_customer_id;
 select * into signup from private.billing_signups where saas_client_id=customer.saas_client_id and product_code='menu';
 boundary:=coalesce(signup.access_until,signup.trial_ends_at,subscription.current_period_end,(subscription.next_billing_on::timestamp at time zone 'America/Sao_Paulo'),now());
 select jsonb_build_object('subscription_id',subscription.id,'monthly_cents',(subscription.base_amount*100)::integer,'cycle',subscription.billing_cycle,
 'next_competence',to_char(boundary at time zone 'America/Sao_Paulo','YYYY-MM'),
 'period_start',boundary,'period_end',boundary+interval '1 month',
 'waiver_amount_cents',coalesce((select (i.total*100)::integer from public.platform_invoices i where i.billing_customer_id=customer.id and (i.subscription_id is null or i.subscription_id=subscription.id) and i.status in ('open','overdue','draft') and to_char(i.due_date,'YYYY-MM')=to_char(boundary at time zone 'America/Sao_Paulo','YYYY-MM') and exists(select 1 from public.platform_invoice_items it where it.invoice_id=i.id and it.item_type='subscription') order by i.created_at limit 1),(subscription.base_amount*100)::integer),
 'waiver_block_reason',case when subscription.billing_cycle<>'monthly' then 'Esta assinatura é anual. O abono é exclusivo da cobrança mensal.' when subscription.status='cancelled' or subscription.cancel_at_period_end then 'Esta assinatura está cancelada ou com cancelamento agendado.' when signup.provider_subscription_id is not null or customer.provider_subscription_id is not null then 'O cartão automático permanece inalterado. Abono disponível somente para Pix e cobrança manual.' when signup.payment_selection_token is not null then 'Existe uma configuração de pagamento em andamento. Atualize a assinatura ou procure o suporte.' when exists(select 1 from private.billing_pix_requests pr where pr.signup_id=signup.id and pr.boundary=coalesce(signup.access_until,signup.trial_ends_at) and pr.previous_payment_id is not distinct from signup.provider_payment_id and pr.expires_at>now()) then 'Uma cobrança Pix está sendo preparada. Aguarde a atualização antes de abonar.' when signup.status='payment_pending' or exists(select 1 from private.billing_payment_intents where signup_id=signup.id and status='pending') then 'Há uma cobrança Pix em andamento. Cancele-a no provedor e aguarde a atualização antes de abonar.' else '' end,
 'waiver_allowed',subscription.billing_cycle='monthly' and subscription.status<>'cancelled' and not subscription.cancel_at_period_end
  and signup.provider_subscription_id is null and customer.provider_subscription_id is null and signup.payment_selection_token is null and not exists(select 1 from private.billing_pix_requests pr where pr.signup_id=signup.id and pr.boundary=coalesce(signup.access_until,signup.trial_ends_at) and pr.previous_payment_id is not distinct from signup.provider_payment_id and pr.expires_at>now()) and coalesce(signup.status,'')<>'payment_pending' and not exists(select 1 from private.billing_payment_intents where signup_id=signup.id and status='pending'),
 'payments',coalesce((select jsonb_agg(row order by row.paid_at desc nulls last) from (
  select 'platform'::text as source,p.id,p.paid_at,(p.gross_amount*100)::integer as amount_cents,i.invoice_number as label,
   greatest(0,round((least(p.gross_amount,(select coalesce(sum(it.line_total),0) from public.platform_invoice_items it where it.invoice_id=i.id and it.item_type='subscription'))-
    coalesce((select sum(r.amount) from public.platform_refunds r where r.payment_id=p.id and r.status in ('requested','approved','processed')),0))*100))::integer as available_cents
  from public.platform_payments p join public.platform_invoices i on i.id=p.invoice_id
  where i.billing_customer_id=customer.id and (i.subscription_id is null or i.subscription_id=subscription.id)
   and p.status in ('approved','partially_refunded') and exists(select 1 from public.platform_invoice_items it where it.invoice_id=i.id and it.item_type='subscription')
  union all
  select 'online'::text,intent.id,intent.paid_at,intent.amount_cents,'Pagamento online '||coalesce(intent.provider_payment_id,''),intent.amount_cents
  from private.billing_payment_intents intent where intent.signup_id=signup.id and intent.status='approved'
   and not exists(select 1 from public.platform_payments p where p.provider='mercado_pago' and p.provider_payment_id=intent.provider_payment_id)
 ) row),'[]'::jsonb),
 'transfers',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'status',t.status,'amount_cents',(r.amount*100)::integer,'reason',r.reason,'key',t.pix_key,'key_type',t.key_type,
 'receiver_name',t.receiver_name,'receiver_city',t.receiver_city,'reference',left(replace(t.id::text,'-',''),25),'bank_reference',t.bank_reference,'created_at',t.created_at) order by t.created_at desc)
 from private.subscription_refund_transfers t join public.platform_refunds r on r.id=t.refund_id where t.subscription_id=subscription.id),'[]'::jsonb),
 'waivers',coalesce((select jsonb_agg(to_jsonb(w) order by w.competence desc) from public.subscription_month_waivers w where w.subscription_id=subscription.id),'[]'::jsonb)) into result;
 return result;
exception when no_data_found then raise exception 'Assinatura não encontrada' using errcode='22023';
end $$;

create function private.prepare_subscription_refund(target_subscription_id uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare subscription public.platform_subscriptions; customer public.billing_customers; signup private.billing_signups; intent private.billing_payment_intents;
 payment public.platform_payments; invoice public.platform_invoices; refund public.platform_refunds; transfer private.subscription_refund_transfers;
 request_id uuid; source_id uuid; amount integer; reserved numeric; monthly_total numeric; key text; kind text; name text; city text;
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
 if jsonb_typeof(payload) is distinct from 'object' or exists(select 1 from jsonb_object_keys(payload) k where k<>all(array['request_id','source','payment_id','amount_cents','key_type','key','receiver_name','receiver_city','reason'])) then raise exception 'Dados de devolução inválidos' using errcode='22023'; end if;
 request_id:=(payload->>'request_id')::uuid;source_id:=(payload->>'payment_id')::uuid;amount:=(payload->>'amount_cents')::integer;
 kind:=payload->>'key_type';key:=btrim(payload->>'key');name:=btrim(payload->>'receiver_name');city:=btrim(payload->>'receiver_city');
 if request_id is null or source_id is null or jsonb_typeof(payload->'amount_cents') is distinct from 'number' or (payload->>'amount_cents')::numeric<>amount or amount not between 1 and 100000000
  or payload->>'source' is null or payload->>'source' not in ('platform','online') or kind is null or kind not in ('cpf','cnpj','email','phone','random') or key is null or octet_length(key) not between 1 and 77
  or name is null or length(name) not between 2 and 80 or name !~ '[[:alnum:]]' or city is null or length(city) not between 2 and 60 or city !~ '[[:alnum:]]'
  or length(coalesce(payload->>'reason',''))>500 then raise exception 'Confira valor, chave e favorecido da devolução' using errcode='22023'; end if;
 if (kind='cpf' and key!~'^[0-9]{11}$') or (kind='cnpj' and key!~'^[0-9]{14}$') or (kind='phone' and key!~'^\+[1-9][0-9]{7,14}$')
  or (kind='email' and key!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or (kind='random' and key!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'Chave Pix inválida para o tipo selecionado' using errcode='22023'; end if;
 if kind='email' then key:=lower(key); end if;
 select s.* into strict subscription from public.platform_subscriptions s join public.platform_products p on p.id=s.product_id where s.id=target_subscription_id and p.code='menu';
 select * into strict customer from public.billing_customers where id=subscription.billing_customer_id;
 -- Serialize retries and confirmations for the same payment, including online ledger materialization.
 perform pg_advisory_xact_lock(hashtextextended('subscription-refund:'||source_id::text,0));
 select * into transfer from private.subscription_refund_transfers where id=request_id;
 if transfer.id is not null then
  select * into strict refund from public.platform_refunds where id=transfer.refund_id;
  if not ((payload->>'source'='platform' and refund.payment_id=source_id) or (payload->>'source'='online' and exists(select 1 from private.billing_payment_intents pi join public.platform_payments pp on pp.provider='mercado_pago' and pp.provider_payment_id=pi.provider_payment_id where pi.id=source_id and pp.id=refund.payment_id))) or transfer.subscription_id<>subscription.id or refund.amount<>amount::numeric/100 or transfer.pix_key<>key or transfer.receiver_name<>name or transfer.receiver_city<>city then raise exception 'A referência já foi utilizada para outra devolução' using errcode='23514'; end if;
  return jsonb_build_object('id',transfer.id,'status',transfer.status,'amount_cents',amount,'key',key,'receiver_name',name,'receiver_city',city,'reference',left(replace(transfer.id::text,'-',''),25));
 end if;
 if payload->>'source'='online' then
  select b.* into strict signup from private.billing_signups b where b.saas_client_id=customer.saas_client_id and b.product_code='menu' for update;
  select * into strict intent from private.billing_payment_intents where id=source_id and signup_id=signup.id and status='approved' for update;
  select * into payment from public.platform_payments where provider='mercado_pago' and provider_payment_id=intent.provider_payment_id for update;
  if payment.id is null then
   insert into public.platform_invoices(billing_customer_id,subscription_id,status,issue_date,due_date,subtotal,total,paid_total,paid_at,notes)
   values(customer.id,subscription.id,'paid',intent.paid_at::date,intent.paid_at::date,intent.amount_cents::numeric/100,intent.amount_cents::numeric/100,intent.amount_cents::numeric/100,intent.paid_at,'Pagamento online conciliado para devolução administrativa') returning * into invoice;
   insert into public.platform_invoice_items(invoice_id,item_type,description,quantity,unit_amount) values(invoice.id,'subscription','Mensalidade paga online',1,intent.amount_cents::numeric/100);
   insert into public.platform_payments(invoice_id,provider,provider_payment_id,method,status,gross_amount,paid_at)
   values(invoice.id,'mercado_pago',intent.provider_payment_id,case when signup.payment_method='card' then 'credit_card' else 'pix' end,'approved',intent.amount_cents::numeric/100,intent.paid_at) returning * into payment;
  end if;
 else select * into strict payment from public.platform_payments where id=source_id for update; end if;
 select * into strict invoice from public.platform_invoices where id=payment.invoice_id;
 if invoice.billing_customer_id<>customer.id or (invoice.subscription_id is not null and invoice.subscription_id<>subscription.id) or payment.status not in ('approved','partially_refunded') then raise exception 'Pagamento não pertence a esta assinatura ou não está disponível' using errcode='42501'; end if;
 select coalesce(sum(line_total),0) into monthly_total from public.platform_invoice_items where invoice_id=invoice.id and item_type='subscription';
 select coalesce(sum(r.amount),0) into reserved from public.platform_refunds r where r.payment_id=payment.id and r.status in ('requested','approved','processed');
 if amount::numeric/100>least(payment.gross_amount,monthly_total)-reserved then raise exception 'O valor supera o saldo disponível da mensalidade. Confira devoluções já realizadas ou pendentes.' using errcode='23514'; end if;
 insert into public.platform_refunds(payment_id,refund_type,status,amount,reason,requested_by) values(payment.id,'refund','requested',amount::numeric/100,coalesce(btrim(payload->>'reason'),''),auth.uid()) returning * into refund;
 insert into private.subscription_refund_transfers(id,subscription_id,refund_id,key_type,pix_key,receiver_name,receiver_city,created_by) values(request_id,subscription.id,refund.id,kind,key,name,city,auth.uid()) returning * into transfer;
 insert into public.platform_billing_audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'refund.pix_prepared','refund',refund.id,jsonb_build_object('transfer_id',transfer.id,'subscription_id',subscription.id,'amount_cents',amount));
 return jsonb_build_object('id',transfer.id,'status',transfer.status,'amount_cents',amount,'key',key,'receiver_name',name,'receiver_city',city,'reference',left(replace(transfer.id::text,'-',''),25));
exception when no_data_found then raise exception 'Pagamento ou assinatura não encontrados' using errcode='22023';
 when invalid_text_representation or numeric_value_out_of_range then raise exception 'Dados de devolução inválidos' using errcode='22023';
end $$;

create function private.finish_subscription_refund(target_transfer_id uuid,complete boolean,supplied_bank_reference text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare transfer private.subscription_refund_transfers; refund public.platform_refunds; payment public.platform_payments; total_refunded numeric;
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
 if complete is null then raise exception 'Informe a ação desejada' using errcode='22023'; end if;
 select * into strict transfer from private.subscription_refund_transfers where id=target_transfer_id;
 select * into strict refund from public.platform_refunds where id=transfer.refund_id;
 select * into strict payment from public.platform_payments where id=refund.payment_id for update;
 select * into strict transfer from private.subscription_refund_transfers where id=target_transfer_id for update;
 if transfer.status=(case when complete then 'completed' else 'cancelled' end) then return jsonb_build_object('id',transfer.id,'status',transfer.status); end if;
 if transfer.status<>'prepared' or refund.status<>'requested' then raise exception 'Esta devolução não está pendente' using errcode='23514'; end if;
 if complete and (supplied_bank_reference is null or length(btrim(supplied_bank_reference)) not between 6 and 120) then raise exception 'Informe a referência do pagamento realizado no banco' using errcode='22023'; end if;
 update private.subscription_refund_transfers set status=case when complete then 'completed' else 'cancelled' end,bank_reference=case when complete then btrim(supplied_bank_reference) else null end,completed_at=case when complete then now() else null end where id=transfer.id;
 update public.platform_refunds set status=case when complete then 'processed' else 'rejected' end,approved_by=case when complete then auth.uid() else null end,processed_at=case when complete then now() else null end,provider_refund_id=case when complete then btrim(supplied_bank_reference) else null end where id=refund.id;
 if complete then
  select coalesce(sum(amount),0) into total_refunded from public.platform_refunds where payment_id=payment.id and status in ('approved','processed');
  update public.platform_payments set status=case when total_refunded>=gross_amount then 'refunded' else 'partially_refunded' end where id=payment.id;
  update public.platform_invoices i set refunded_total=(select coalesce(sum(r.amount),0) from public.platform_refunds r join public.platform_payments p on p.id=r.payment_id where p.invoice_id=i.id and r.status in ('approved','processed')),
   status=case when (select coalesce(sum(r.amount),0) from public.platform_refunds r join public.platform_payments p on p.id=r.payment_id where p.invoice_id=i.id and r.status in ('approved','processed'))>=i.paid_total then 'refunded' else 'partially_refunded' end where i.id=payment.invoice_id;
 end if;
 insert into public.platform_billing_audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),case when complete then 'refund.pix_completed' else 'refund.pix_cancelled' end,'refund',refund.id,jsonb_build_object('transfer_id',transfer.id,'amount',refund.amount));
 return jsonb_build_object('id',transfer.id,'status',case when complete then 'completed' else 'cancelled' end);
exception when no_data_found then raise exception 'Devolução não encontrada' using errcode='22023';
 when unique_violation then raise exception 'Esta referência bancária já foi registrada em outra devolução' using errcode='23514';
end $$;

create function private.waive_subscription_month(target_subscription_id uuid,competence text,note text default '',expected_amount_cents integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare subscription public.platform_subscriptions; customer public.billing_customers; signup private.billing_signups; invoice public.platform_invoices;
 waiver public.subscription_month_waivers; boundary timestamptz; until_date timestamptz; month_date date; amount numeric;
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
 if competence is null or competence!~'^[0-9]{4}-(0[1-9]|1[0-2])$' or length(coalesce(note,''))>500 then raise exception 'Confira a competência e a observação' using errcode='22023'; end if;
 month_date:=(competence||'-01')::date;
 -- Waivers serialize on the subscription. Automatic card billing is intentionally never changed.
 select s.* into strict subscription from public.platform_subscriptions s join public.platform_products p on p.id=s.product_id where s.id=target_subscription_id and p.code='menu' for update of s nowait;
 select * into strict customer from public.billing_customers where id=subscription.billing_customer_id;
 select * into waiver from public.subscription_month_waivers w where w.subscription_id=subscription.id and w.competence=month_date;
 if waiver.id is not null then return to_jsonb(waiver); end if;
 select * into signup from private.billing_signups where saas_client_id=customer.saas_client_id and product_code='menu' for update nowait;
 if signup.payment_selection_token is not null or exists(select 1 from private.billing_pix_requests pr where pr.signup_id=signup.id and pr.boundary=coalesce(signup.access_until,signup.trial_ends_at) and pr.previous_payment_id is not distinct from signup.provider_payment_id and pr.expires_at>now()) then raise exception 'Uma cobrança está sendo preparada. Aguarde a atualização antes de abonar esta mensalidade.' using errcode='55000'; end if;
 if signup.provider_subscription_id is not null or customer.provider_subscription_id is not null then raise exception 'O cartão automático permanece inalterado. O abono está disponível somente para Pix e cobrança manual.' using errcode='23514'; end if;
 if subscription.billing_cycle<>'monthly' or subscription.status='cancelled' or subscription.cancel_at_period_end or coalesce(signup.status,'') in ('cancel_at_period_end','cancelled','failed') then raise exception 'O abono é de uma mensalidade; esta assinatura não está disponível para abono mensal.' using errcode='23514'; end if;
 if signup.id is not null and (signup.status='payment_pending' or exists(select 1 from private.billing_payment_intents where signup_id=signup.id and status='pending')) then raise exception 'Já existe uma cobrança Pix em andamento. Cancele-a no provedor e aguarde a atualização antes de abonar, para evitar pagamento indevido.' using errcode='23514'; end if;
 if signup.id is not null and exists(select 1 from private.menu_offer_changes where signup_id=signup.id) then raise exception 'Existe uma troca de plano em andamento. Conclua-a antes do abono.' using errcode='55000'; end if;
 boundary:=coalesce(signup.access_until,signup.trial_ends_at,subscription.current_period_end,(subscription.next_billing_on::timestamp at time zone 'America/Sao_Paulo'),now());
 if to_char(boundary at time zone 'America/Sao_Paulo','YYYY-MM')<>competence then raise exception 'O abono deve corresponder à próxima mensalidade. Atualize os dados da assinatura.' using errcode='40001'; end if;
 until_date:=boundary+interval '1 month';amount:=coalesce(signup.base_monthly_cents::numeric/100,subscription.base_amount);
 if amount is null or amount<=0 then raise exception 'Esta assinatura não possui uma mensalidade a abonar' using errcode='23514'; end if;
 -- Do not forgive unrelated services or a previously paid installment.
 if exists(select 1 from public.platform_invoices i where i.billing_customer_id=customer.id and i.status<>'void' and (i.subscription_id=subscription.id or i.subscription_id is null)
  and date_trunc('month',i.due_date)::date=month_date and exists(select 1 from public.platform_invoice_items it where it.invoice_id=i.id and it.item_type='subscription') and i.paid_total>0) then raise exception 'Esta competência já possui pagamento. Use Devolver mensalidade para valores recebidos.' using errcode='23514'; end if;
 select i.* into invoice from public.platform_invoices i where i.billing_customer_id=customer.id and i.status in ('open','overdue','draft') and (i.subscription_id=subscription.id or i.subscription_id is null)
  and date_trunc('month',i.due_date)::date=month_date and exists(select 1 from public.platform_invoice_items it where it.invoice_id=i.id and it.item_type='subscription') order by i.created_at limit 1 for update;
 if invoice.id is not null then
  if exists(select 1 from public.platform_invoice_items where invoice_id=invoice.id and item_type not in ('subscription','discount','credit'))
   or invoice.credit_total>0 or invoice.total<=0 or exists(select 1 from public.platform_payments p where p.invoice_id=invoice.id and p.status='pending') or exists(select 1 from public.platform_invoices i where i.id<>invoice.id and i.billing_customer_id=customer.id and i.status in ('open','overdue','draft') and date_trunc('month',i.due_date)::date=month_date and exists(select 1 from public.platform_invoice_items it where it.invoice_id=i.id and it.item_type='subscription')) then raise exception 'A competência contém serviços, créditos ou mais de uma fatura. Ajuste a cobrança antes de abonar a mensalidade.' using errcode='23514'; end if;
  amount:=invoice.total;
  if expected_amount_cents is not null and expected_amount_cents<>(amount*100)::integer then raise exception 'O valor da mensalidade mudou. Atualize a assinatura antes de confirmar.' using errcode='40001'; end if;
  update public.platform_invoices set subscription_id=subscription.id,is_monthly_waived=true,discount_total=subtotal,total=0,status='paid',paid_at=null,
   notes=concat_ws(E'\n',nullif(notes,''),'Mensalidade abonada '||competence,nullif(btrim(note),'')) where id=invoice.id;
 else
  if expected_amount_cents is not null and expected_amount_cents<>(amount*100)::integer then raise exception 'O valor da mensalidade mudou. Atualize a assinatura antes de confirmar.' using errcode='40001'; end if;
  insert into public.platform_invoices(billing_customer_id,subscription_id,status,issue_date,due_date,subtotal,discount_total,total,paid_total,notes,is_monthly_waived)
  values(customer.id,subscription.id,'paid',least(current_date,(boundary at time zone 'America/Sao_Paulo')::date),(boundary at time zone 'America/Sao_Paulo')::date,amount,amount,0,0,'Mensalidade abonada '||competence||case when coalesce(btrim(note),'')='' then '' else E'\n'||btrim(note) end,true) returning * into invoice;
  insert into public.platform_invoice_items(invoice_id,item_type,description,quantity,unit_amount) values(invoice.id,'subscription','Mensalidade abonada '||competence,1,amount);
 end if;
 insert into public.subscription_month_waivers(subscription_id,competence,amount_cents,period_start,period_end,invoice_id,note,created_by)
 values(subscription.id,month_date,(amount*100)::integer,boundary,until_date,invoice.id,coalesce(btrim(note),''),auth.uid()) returning * into waiver;
 if signup.id is not null then
  update private.billing_signups set access_until=until_date,status=case when until_date>now() then 'active' else 'past_due' end,suspended_at=case when until_date>now() then null else suspended_at end where id=signup.id;
  perform private.sync_menu_billing_access(signup.id);
 else
  update public.platform_subscriptions set current_period_end=until_date,next_billing_on=(until_date at time zone 'America/Sao_Paulo')::date,status=case when until_date>now() then 'active' else 'suspended' end where id=subscription.id;
 end if;
 insert into public.platform_billing_audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'subscription.month_waived','subscription',subscription.id,jsonb_build_object('waiver_id',waiver.id,'competence',competence,'amount_cents',(amount*100)::integer,'period_end',until_date,'note',coalesce(btrim(note),'')));
 return to_jsonb(waiver);
exception when no_data_found then raise exception 'Assinatura não encontrada' using errcode='22023';
 when lock_not_available then raise exception 'Existe uma atualização de pagamento em andamento. Atualize a assinatura e tente novamente.' using errcode='55000';
end $$;

-- Legacy refund and invoice flows must respect the new reservations and waived periods too.
do $compatibility$ declare definition text; patched text;
begin
 definition:=pg_get_functiondef('public.backend_billing_choose_payment_update(uuid,jsonb)'::regprocedure);
 patched:=replace(definition,'  update private.billing_signups set','  perform 1 from private.billing_signups where id=target_signup_id and payment_selection_token=(payload->>''selection_token'')::uuid for update;
  if not found then raise exception ''Configuração de pagamento alterada; atualize a assinatura'' using errcode=''40001''; end if;
  update private.billing_signups set');
 if patched=definition then raise exception 'Payment selection anchor missing'; end if;execute patched;
 definition:=pg_get_functiondef('private.billing_pix_can_replace(uuid)'::regprocedure);
 patched:=replace(definition,'and s.payment_method=''pix''','and s.payment_selection_token is null and s.payment_method=''pix''');
 if patched=definition then raise exception 'Pix selection anchor missing'; end if;execute patched;
 definition:=pg_get_functiondef('public.backend_billing_offer_change_claim(uuid,text,timestamptz)'::regprocedure);
 patched:=replace(definition,'if signup.updated_at is distinct from expected_updated_at then','if signup.payment_selection_token is not null then raise exception ''Existe uma configuração de pagamento em andamento'' using errcode=''55000''; end if;
 if signup.updated_at is distinct from expected_updated_at then');
 if patched=definition then raise exception 'Offer checkout anchor missing'; end if;execute patched;
 definition:=pg_get_functiondef('private.platform_register_refund(uuid,numeric,text,text)'::regprocedure);
 patched:=replace(definition,'if refund_amount <= 0 or refunded + refund_amount > payment.gross_amount then','if refund_amount <= 0 or (select coalesce(sum(r.amount),0) from public.platform_refunds r where r.payment_id=payment.id and r.status in (''requested'',''approved'',''processed'')) + refund_amount > payment.gross_amount then');
 if patched=definition then raise exception 'Refund reservation anchor missing'; end if;execute patched;
 definition:=pg_get_functiondef('private.platform_create_invoice(uuid,date,jsonb,numeric,numeric,text)'::regprocedure);
 patched:=replace(definition,'if not public.is_platform_admin() then raise exception ''Acesso negado''; end if;',
 'if not public.is_platform_admin() then raise exception ''Acesso negado''; end if;
 if exists(select 1 from jsonb_array_elements(invoice_items) waiver_item(value) where waiver_item.value->>''item_type''=''subscription'') and exists(select 1 from public.subscription_month_waivers w join public.platform_subscriptions s on s.id=w.subscription_id join public.billing_customers bc on bc.id=s.billing_customer_id where bc.saas_client_id=target_saas_client_id and w.competence=date_trunc(''month'',invoice_due_date)::date) then raise exception ''Esta mensalidade já foi abonada. Escolha outra competência.'' using errcode=''23514''; end if;');
 if patched=definition then raise exception 'Waived invoice anchor missing'; end if;execute patched;
end $compatibility$;

create function public.platform_subscription_finance(target_subscription_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.subscription_finance(target_subscription_id) $$;
create function public.platform_prepare_subscription_refund(target_subscription_id uuid,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.prepare_subscription_refund(target_subscription_id,payload) $$;
create function public.platform_finish_subscription_refund(target_transfer_id uuid,complete boolean,supplied_bank_reference text default '') returns jsonb language sql security invoker set search_path='' as $$ select private.finish_subscription_refund(target_transfer_id,complete,supplied_bank_reference) $$;
create function public.platform_waive_subscription_month(target_subscription_id uuid,competence text,note text default '',expected_amount_cents integer default null) returns jsonb language sql security invoker set search_path='' as $$ select private.waive_subscription_month(target_subscription_id,competence,note,expected_amount_cents) $$;
revoke all on function private.subscription_finance(uuid),private.prepare_subscription_refund(uuid,jsonb),private.finish_subscription_refund(uuid,boolean,text),private.waive_subscription_month(uuid,text,text,integer),public.platform_subscription_finance(uuid),public.platform_prepare_subscription_refund(uuid,jsonb),public.platform_finish_subscription_refund(uuid,boolean,text),public.platform_waive_subscription_month(uuid,text,text,integer) from public,anon;
grant execute on function private.subscription_finance(uuid),private.prepare_subscription_refund(uuid,jsonb),private.finish_subscription_refund(uuid,boolean,text),private.waive_subscription_month(uuid,text,text,integer),public.platform_subscription_finance(uuid),public.platform_prepare_subscription_refund(uuid,jsonb),public.platform_finish_subscription_refund(uuid,boolean,text),public.platform_waive_subscription_month(uuid,text,text,integer) to authenticated;
notify pgrst,'reload schema';
