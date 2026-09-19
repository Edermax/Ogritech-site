-- Fundação multiproduto da Ogritech.
-- Mantém o comportamento legado do Agenda e introduz separação explícita por produto.

create table public.platform_products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_-]{1,31}$'),
  name text not null unique,
  description text not null default '',
  launch_state text not null default 'planned'
    check (launch_state in ('priority','planned','private_beta','active','retired')),
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.platform_products(code,name,description,launch_state,display_order)
values
  ('agenda','Ogritech Agenda','Agenda e gestão operacional para negócios de serviços.','priority',1),
  ('pages','Ogritech Páginas','Presença digital e captação em canal próprio.','planned',2),
  ('quotes','Ogritech Orçamentos','Criação, envio e acompanhamento de orçamentos.','planned',3),
  ('menu','Ogritech Cardápio','Canal próprio de vendas para negócios de alimentação.','planned',4)
on conflict (code) do update set
  name=excluded.name,
  description=excluded.description,
  launch_state=excluded.launch_state,
  display_order=excluded.display_order;

alter table public.saas_plans
  add column product_id uuid,
  add column code text;

update public.saas_plans
set product_id=(select id from public.platform_products where code='agenda'),
    code=coalesce(
      nullif(trim(both '-' from regexp_replace(lower(name),'[^a-z0-9]+','-','g')),''),
      'legacy-' || left(id::text,8)
    )
where product_id is null or code is null;

alter table public.saas_plans
  alter column product_id set not null,
  alter column code set not null,
  add constraint saas_plans_product_fk foreign key(product_id)
    references public.platform_products(id) on delete restrict,
  add constraint saas_plans_code_format check (code ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  add constraint saas_plans_product_code_key unique(product_id,code),
  add constraint saas_plans_id_product_key unique(id,product_id);

create or replace function private.assign_plan_product_defaults()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.product_id is null then
    select id into new.product_id from public.platform_products where code='agenda';
  end if;
  if new.code is null or btrim(new.code)='' then
    new.code := coalesce(
      nullif(trim(both '-' from regexp_replace(lower(new.name),'[^a-z0-9_-]+','-','g')),''),
      'legacy-' || left(new.id::text,8)
    );
  end if;
  return new;
end;
$$;
revoke all on function private.assign_plan_product_defaults() from public,anon,authenticated;
drop trigger if exists saas_plans_assign_product_defaults on public.saas_plans;
create trigger saas_plans_assign_product_defaults
before insert or update of product_id,code,name on public.saas_plans
for each row execute function private.assign_plan_product_defaults();

alter table public.platform_subscriptions add column product_id uuid;

update public.platform_subscriptions subscription
set product_id=coalesce(
  (select plan.product_id from public.saas_plans plan where plan.id=subscription.plan_id),
  (select id from public.platform_products where code='agenda')
)
where product_id is null;

alter table public.platform_subscriptions
  alter column product_id set not null,
  add constraint platform_subscriptions_product_fk foreign key(product_id)
    references public.platform_products(id) on delete restrict,
  add constraint platform_subscriptions_plan_product_fk foreign key(plan_id,product_id)
    references public.saas_plans(id,product_id) on delete restrict,
  add constraint platform_subscriptions_id_product_key unique(id,product_id);

do $$
begin
  if exists (
    select 1 from public.platform_subscriptions
    where status <> 'cancelled'
    group by billing_customer_id,product_id having count(*) > 1
  ) then
    raise exception 'Existem assinaturas não canceladas duplicadas para o mesmo cliente e produto';
  end if;
end;
$$;

create unique index platform_subscriptions_one_open_product_idx
  on public.platform_subscriptions(billing_customer_id,product_id)
  where status <> 'cancelled';
create index platform_subscriptions_product_status_idx
  on public.platform_subscriptions(product_id,status);

create table public.platform_modules (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.platform_products(id) on delete restrict,
  code text not null check (code ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  name text not null,
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id,code),
  unique(id,product_id)
);

create table public.plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  product_id uuid not null,
  entitlement_key text not null check (entitlement_key ~ '^[a-z0-9][a-z0-9_.-]{0,127}$'),
  entitlement_value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_entitlements_plan_product_fk foreign key(plan_id,product_id)
    references public.saas_plans(id,product_id) on delete cascade,
  unique(plan_id,entitlement_key)
);

insert into public.plan_entitlements(plan_id,product_id,entitlement_key,entitlement_value)
select id,product_id,'limits.max_users',to_jsonb(max_users) from public.saas_plans where max_users is not null
on conflict(plan_id,entitlement_key) do update set entitlement_value=excluded.entitlement_value;
insert into public.plan_entitlements(plan_id,product_id,entitlement_key,entitlement_value)
select id,product_id,'limits.max_professionals',to_jsonb(max_professionals) from public.saas_plans where max_professionals is not null
on conflict(plan_id,entitlement_key) do update set entitlement_value=excluded.entitlement_value;
insert into public.plan_entitlements(plan_id,product_id,entitlement_key,entitlement_value)
select id,product_id,'limits.max_services',to_jsonb(max_services) from public.saas_plans where max_services is not null
on conflict(plan_id,entitlement_key) do update set entitlement_value=excluded.entitlement_value;

create table public.subscription_modules (
  id uuid primary key default gen_random_uuid(),
  platform_subscription_id uuid not null,
  module_id uuid not null,
  product_id uuid not null,
  status text not null default 'active'
    check (status in ('trial','active','past_due','suspended','cancel_at_period_end','cancelled')),
  starts_at timestamptz not null default now(),
  current_period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_modules_subscription_product_fk
    foreign key(platform_subscription_id,product_id)
    references public.platform_subscriptions(id,product_id) on delete cascade,
  constraint subscription_modules_module_product_fk
    foreign key(module_id,product_id)
    references public.platform_modules(id,product_id) on delete restrict,
  unique(platform_subscription_id,module_id)
);

create index platform_modules_product_idx on public.platform_modules(product_id,active);
create index plan_entitlements_product_idx on public.plan_entitlements(product_id,plan_id);
create index subscription_modules_product_status_idx on public.subscription_modules(product_id,status);

create or replace function private.business_has_product_access(
  target_barbershop_id uuid,
  target_product_code text
) returns boolean
language sql stable security definer set search_path=''
as $$
  select (select auth.uid()) is not null and (
    public.is_platform_admin()
    or (
      public.is_business_team(target_barbershop_id)
      and exists (
        select 1
        from public.saas_clients client
        join public.billing_customers customer on customer.saas_client_id=client.id
        join public.platform_subscriptions subscription on subscription.billing_customer_id=customer.id
        join public.platform_products product on product.id=subscription.product_id
        where client.barbershop_id=target_barbershop_id
          and client.deleted_at is null
          and product.code=target_product_code
          and product.active
          and subscription.status in ('trial','active','grace_period')
          and (subscription.current_period_end is null or subscription.current_period_end > now())
      )
    )
  );
$$;

create or replace function private.business_entitlement(
  target_barbershop_id uuid,
  target_product_code text,
  target_entitlement_key text
) returns jsonb
language sql stable security definer set search_path=''
as $$
  select entitlement.entitlement_value
  from public.saas_clients client
  join public.billing_customers customer on customer.saas_client_id=client.id
  join public.platform_subscriptions subscription on subscription.billing_customer_id=customer.id
  join public.platform_products product on product.id=subscription.product_id
  join public.plan_entitlements entitlement
    on entitlement.plan_id=subscription.plan_id and entitlement.product_id=subscription.product_id
  where (select auth.uid()) is not null
    and (public.is_platform_admin() or public.is_business_team(target_barbershop_id))
    and client.barbershop_id=target_barbershop_id
    and client.deleted_at is null
    and product.code=target_product_code
    and subscription.status in ('trial','active','grace_period')
    and entitlement.entitlement_key=target_entitlement_key
  limit 1;
$$;

revoke all on function private.business_has_product_access(uuid,text) from public,anon,authenticated;
revoke all on function private.business_entitlement(uuid,text,text) from public,anon,authenticated;
grant execute on function private.business_has_product_access(uuid,text) to authenticated;
grant execute on function private.business_entitlement(uuid,text,text) to authenticated;

alter table public.platform_products enable row level security;
alter table public.platform_modules enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.subscription_modules enable row level security;

revoke all on table public.platform_products,public.platform_modules,
  public.plan_entitlements,public.subscription_modules from anon;
grant select,insert,update,delete on table public.platform_products,public.platform_modules,
  public.plan_entitlements,public.subscription_modules to authenticated;

create policy "Authenticated users view active products" on public.platform_products
for select to authenticated using (active or public.is_platform_admin());
create policy "Platform admins create products" on public.platform_products
for insert to authenticated with check (public.is_platform_admin());
create policy "Platform admins update products" on public.platform_products
for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "Platform admins delete products" on public.platform_products
for delete to authenticated using (public.is_platform_admin());

create policy "Authenticated users view active modules" on public.platform_modules
for select to authenticated using (active or public.is_platform_admin());
create policy "Platform admins create modules" on public.platform_modules
for insert to authenticated with check (public.is_platform_admin());
create policy "Platform admins update modules" on public.platform_modules
for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "Platform admins delete modules" on public.platform_modules
for delete to authenticated using (public.is_platform_admin());

create policy "Authenticated users view active plan entitlements" on public.plan_entitlements
for select to authenticated using (
  public.is_platform_admin() or exists (
    select 1 from public.saas_plans plan where plan.id=plan_id and plan.active
  )
);
create policy "Platform admins create plan entitlements" on public.plan_entitlements
for insert to authenticated with check (public.is_platform_admin());
create policy "Platform admins update plan entitlements" on public.plan_entitlements
for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "Platform admins delete plan entitlements" on public.plan_entitlements
for delete to authenticated using (public.is_platform_admin());

create policy "Businesses view their subscribed modules" on public.subscription_modules
for select to authenticated using (
  public.is_platform_admin() or exists (
    select 1
    from public.platform_subscriptions subscription
    join public.billing_customers customer on customer.id=subscription.billing_customer_id
    join public.saas_clients client on client.id=customer.saas_client_id
    where subscription.id=platform_subscription_id
      and public.is_business_team(client.barbershop_id)
  )
);
create policy "Platform admins create subscribed modules" on public.subscription_modules
for insert to authenticated with check (public.is_platform_admin());
create policy "Platform admins update subscribed modules" on public.subscription_modules
for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "Platform admins delete subscribed modules" on public.subscription_modules
for delete to authenticated using (public.is_platform_admin());

drop trigger if exists platform_products_set_updated_at on public.platform_products;
create trigger platform_products_set_updated_at before update on public.platform_products
for each row execute function public.ogritech_set_updated_at();
drop trigger if exists platform_modules_set_updated_at on public.platform_modules;
create trigger platform_modules_set_updated_at before update on public.platform_modules
for each row execute function public.ogritech_set_updated_at();
drop trigger if exists plan_entitlements_set_updated_at on public.plan_entitlements;
create trigger plan_entitlements_set_updated_at before update on public.plan_entitlements
for each row execute function public.ogritech_set_updated_at();
drop trigger if exists subscription_modules_set_updated_at on public.subscription_modules;
create trigger subscription_modules_set_updated_at before update on public.subscription_modules
for each row execute function public.ogritech_set_updated_at();

-- Compatibilidade: o campo legado saas_clients.plan continua sincronizando apenas Agenda.
create or replace function public.platform_sync_client_subscription()
returns trigger language plpgsql security definer set search_path=public
as $$
declare
  customer public.billing_customers;
  selected_plan uuid;
  agenda_product uuid;
begin
  if new.deleted_at is not null then return new; end if;

  select id into agenda_product from public.platform_products where code='agenda';
  insert into public.billing_customers(saas_client_id,billing_email)
  values(new.id,coalesce(new.owner_email,''))
  on conflict(saas_client_id) do update set billing_email=excluded.billing_email
  returning * into customer;

  select id into selected_plan
  from public.saas_plans
  where product_id=agenda_product and name=new.plan;

  if selected_plan is null then
    select id into selected_plan
    from public.saas_plans
    where product_id=agenda_product and code='agenda';
  end if;

  if exists(
    select 1 from public.platform_subscriptions
    where billing_customer_id=customer.id and product_id=agenda_product and status<>'cancelled'
  ) then
    update public.platform_subscriptions
    set plan_id=selected_plan,
        base_amount=new.monthly_fee,
        status=case when new.status='Ativo' then 'active' when new.status='Suspenso' then 'suspended' else status end
    where billing_customer_id=customer.id and product_id=agenda_product and status<>'cancelled';
  else
    insert into public.platform_subscriptions(
      billing_customer_id,plan_id,product_id,status,base_amount,next_billing_on
    ) values(
      customer.id,selected_plan,agenda_product,
      case when new.status='Ativo' then 'active' else 'pending_activation' end,
      new.monthly_fee,current_date+interval '1 month'
    );
  end if;
  return new;
end;
$$;

comment on table public.platform_products is 'Catálogo canônico das quatro soluções Ogritech.';
comment on table public.plan_entitlements is 'Direitos de plano avaliados no servidor; ausência significa negado.';
comment on function private.business_has_product_access(uuid,text) is 'Autorização multiproduto centralizada e negada por padrão.';
