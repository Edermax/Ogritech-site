create table private.menu_sales_reports (
 id uuid primary key default gen_random_uuid(),barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 kind text not null check(kind in ('weekly','monthly')),period_start date not null,period_end date not null,
 snapshot jsonb not null default '{}',created_at timestamptz not null default now(),computed_at timestamptz,
 unique(barbershop_id,kind,period_start),check(period_end>period_start)
);
create index menu_sales_reports_business_idx on private.menu_sales_reports(barbershop_id,period_end desc);
alter table private.menu_sales_reports enable row level security;
revoke all on private.menu_sales_reports from public,anon,authenticated;

create function private.menu_sales_period(target_barbershop_id uuid,starts_at timestamptz,ends_at timestamptz) returns jsonb
language sql stable security definer set search_path='' as $$
 with eligible as (
  select id,total_amount,subtotal,delivery_fee,discount_amount,payment_received_date_estimated from public.menu_orders
   where barbershop_id=target_barbershop_id and payment_status='paid' and not is_test and status not in ('rejected','cancelled')
    and payment_received_at>=starts_at and payment_received_at<ends_at
 ), best_items as (
  select i.menu_item_id,i.item_name,sum(i.quantity)::bigint quantity,sum(i.line_total) gross_amount
   from public.menu_order_items i join eligible o on o.id=i.order_id
   where i.barbershop_id=target_barbershop_id group by i.menu_item_id,i.item_name
   order by quantity desc,gross_amount desc,i.item_name limit 10
 ) select jsonb_build_object(
  'order_count',(select count(*) from eligible),
  'total_amount',(select coalesce(sum(total_amount),0) from eligible),
  'product_amount',(select coalesce(sum(subtotal),0) from eligible),
  'delivery_amount',(select coalesce(sum(delivery_fee),0) from eligible),
  'discount_amount',(select coalesce(sum(discount_amount),0) from eligible),
  'estimated_payment_dates',(select count(*) from eligible where payment_received_date_estimated),
  'top_items',coalesce((select jsonb_agg(jsonb_build_object('name',item_name,'quantity',quantity,'amount',gross_amount)
   order by quantity desc,gross_amount desc,item_name) from best_items),'[]'::jsonb)
 )
$$;

create function private.menu_sales_report_payload(target_barbershop_id uuid,report_kind text,starts_on date,ends_on date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare current_data jsonb; previous_data jsonb; previous_start date; difference numeric; percent numeric; business_name text;
begin
 previous_start:=case when report_kind='weekly' then starts_on-7 else (starts_on-interval '1 month')::date end;
 current_data:=private.menu_sales_period(target_barbershop_id,starts_on::timestamp at time zone 'America/Sao_Paulo',ends_on::timestamp at time zone 'America/Sao_Paulo');
 previous_data:=private.menu_sales_period(target_barbershop_id,previous_start::timestamp at time zone 'America/Sao_Paulo',starts_on::timestamp at time zone 'America/Sao_Paulo');
 difference:=(current_data->>'total_amount')::numeric-(previous_data->>'total_amount')::numeric;
 percent:=case when (previous_data->>'total_amount')::numeric>0 then round(difference/(previous_data->>'total_amount')::numeric*100,2)
  when difference=0 then 0 else null end;
 select coalesce(m.title,b.name) into business_name from public.barbershops b left join public.online_menus m on m.barbershop_id=b.id where b.id=target_barbershop_id;
 return jsonb_build_object('version',1,'kind',report_kind,'business_name',business_name,'currency','BRL','timezone','America/Sao_Paulo',
  'period_start',starts_on,'period_end',ends_on,'previous_period_start',previous_start,'previous_period_end',starts_on,
  'current',current_data,'previous',previous_data,'difference_amount',difference,'difference_percent',percent,
  'generated_at',now(),'basis','received_payments');
end $$;

create function private.generate_menu_sales_reports(as_of timestamptz default now()) returns integer
language plpgsql security definer set search_path='' as $$
declare today date:=(as_of at time zone 'America/Sao_Paulo')::date; weekly_end date; monthly_end date; created_count integer:=0; affected integer;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('ogritech:menu-sales-reports',0)) then return 0; end if;
 weekly_end:=date_trunc('week',today::timestamp)::date;
 monthly_end:=date_trunc('month',today::timestamp)::date;
 -- One stable notification per closed period, even after retries or missed runs.
 insert into private.menu_sales_reports(barbershop_id,kind,period_start,period_end)
 select m.barbershop_id,period.kind,period.starts_on,period.ends_on
 from public.online_menus m join public.barbershops b on b.id=m.barbershop_id
 cross join (values('weekly',weekly_end-7,weekly_end),('monthly',(monthly_end-interval '1 month')::date,monthly_end)) period(kind,starts_on,ends_on)
 where b.active and b.deleted_at is null and m.created_at<period.ends_on::timestamp at time zone 'America/Sao_Paulo'
  and private.business_product_is_active(m.barbershop_id,'menu')
 on conflict(barbershop_id,kind,period_start) do nothing;
 get diagnostics affected=row_count; created_count:=created_count+affected;
 return created_count;
end $$;

create function private.menu_sales_reports(target_barbershop_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_business_manager(target_barbershop_id) or not private.business_has_product_access(target_barbershop_id,'menu')
  then raise exception 'Access denied' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(report) order by period_end desc,kind) from (
  select id,kind,period_start,period_end,created_at from (
   select id,kind,period_start,period_end,created_at,row_number() over(partition by kind order by period_end desc) position
    from private.menu_sales_reports where barbershop_id=target_barbershop_id
  ) recent where position<=12
 ) report),'[]'::jsonb);
end $$;
create function private.menu_sales_report(target_barbershop_id uuid,target_report_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare report private.menu_sales_reports; payload jsonb;
begin
 if auth.uid() is null or not public.is_business_manager(target_barbershop_id) or not private.business_has_product_access(target_barbershop_id,'menu')
  then raise exception 'Access denied' using errcode='42501'; end if;
 select * into report from private.menu_sales_reports where id=target_report_id and barbershop_id=target_barbershop_id;
 if not found then raise exception 'Report unavailable' using errcode='22023'; end if;
 -- Recompute on open so a later refund/review never leaves an outdated export.
 payload:=private.menu_sales_report_payload(target_barbershop_id,report.kind,report.period_start,report.period_end);
 update private.menu_sales_reports set snapshot=payload,computed_at=now() where id=report.id;
 return payload||jsonb_build_object('id',report.id,'notified_at',report.created_at);
end $$;
create function public.menu_sales_reports(target_barbershop_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.menu_sales_reports(target_barbershop_id) $$;
create function public.menu_sales_report(target_barbershop_id uuid,target_report_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.menu_sales_report(target_barbershop_id,target_report_id) $$;
revoke all on function private.menu_sales_period(uuid,timestamptz,timestamptz),private.menu_sales_report_payload(uuid,text,date,date),
 private.generate_menu_sales_reports(timestamptz),private.menu_sales_reports(uuid),private.menu_sales_report(uuid,uuid),
 public.menu_sales_reports(uuid),public.menu_sales_report(uuid,uuid) from public,anon,authenticated;
grant execute on function private.menu_sales_reports(uuid),private.menu_sales_report(uuid,uuid),public.menu_sales_reports(uuid),public.menu_sales_report(uuid,uuid) to authenticated;
grant execute on function private.generate_menu_sales_reports(timestamptz) to service_role;

-- 08:00 in Brasília. The daily catch-up is idempotent; only weekly/monthly
-- boundaries create a new notification. No email or external message is sent.
select cron.schedule('ogritech-menu-sales-reports','0 11 * * *','select private.generate_menu_sales_reports();');
