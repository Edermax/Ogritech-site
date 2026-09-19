-- Ogritech Billing: uma oferta, teste único por CNPJ e contratação self-service.
insert into public.saas_plans (name, monthly_fee, description, features, featured, active, display_order, max_users, max_professionals, max_services)
values ('Agenda', 97, 'Ogritech Agenda com contratação e gestão self-service.',
        '["Agenda online","Cadastro de clientes","Serviços e profissionais","Suporte pelo Assistente Ogritech"]'::jsonb,
        true, true, 1, null, null, null)
on conflict (name) do update set monthly_fee=excluded.monthly_fee, description=excluded.description,
  features=excluded.features, featured=true, active=true, display_order=1;

update public.saas_clients set plan='Agenda', monthly_fee=97 where deleted_at is null and plan <> 'Agenda';
update public.saas_plans set active=(name='Agenda'), featured=(name='Agenda') where name in ('Agenda','Essencial','Pro','Premium');

create table if not exists private.billing_signups (
  id uuid primary key default gen_random_uuid(),
  tax_document text not null unique check (tax_document ~ '^[0-9]{14}$'),
  business_name text not null check (char_length(business_name) between 2 and 150),
  responsible_name text not null check (char_length(responsible_name) between 2 and 150),
  email text not null check (char_length(email) between 5 and 320),
  phone text not null check (phone ~ '^[0-9]{10,11}$'),
  segment text not null default 'Serviços',
  cycle text not null check (cycle in ('monthly','quarterly','semiannual','annual')),
  payment_method text not null check (payment_method in ('card','pix')),
  base_monthly_cents integer not null default 9700 check (base_monthly_cents=9700),
  cycle_months integer not null check (cycle_months in (1,3,6,12)),
  discount_bps integer not null check (discount_bps in (0,300,500,1000)),
  total_cents integer not null check (total_cents > 0),
  terms_version text not null,
  management_token_hash text not null unique,
  status text not null default 'trial_active' check (status in ('trial_active','payment_pending','active','past_due','cancel_at_period_end','cancelled','failed')),
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  access_until timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  barbershop_id uuid references public.barbershops(id) on delete restrict,
  saas_client_id uuid references public.saas_clients(id) on delete restrict,
  provider text not null default 'mercado_pago',
  provider_plan_id text,
  provider_subscription_id text,
  provider_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.billing_term_acceptances (
  id uuid primary key default gen_random_uuid(),
  signup_id uuid not null references private.billing_signups(id) on delete restrict,
  terms_version text not null,
  terms_sha256 text not null check (terms_sha256 ~ '^[0-9a-f]{64}$'),
  recurring_authorized boolean not null,
  privacy_accepted boolean not null,
  accepted_at timestamptz not null default now(),
  ip_address inet,
  user_agent text not null default '',
  unique (signup_id, terms_version)
);

create table if not exists private.billing_payment_intents (
  id uuid primary key default gen_random_uuid(),
  signup_id uuid not null references private.billing_signups(id) on delete restrict,
  purpose text not null check (purpose in ('initial','renewal')),
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','expired','refunded')),
  provider_payment_id text unique,
  external_reference text not null unique,
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists private.billing_outbox (
  id uuid primary key default gen_random_uuid(),
  signup_id uuid not null references private.billing_signups(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (signup_id,event_type)
);

create index if not exists billing_signups_due_idx on private.billing_signups(status,trial_ends_at,access_until);
create index if not exists billing_outbox_due_idx on private.billing_outbox(available_at) where processed_at is null;

alter table public.billing_customers add column if not exists provider_subscription_id text;
alter table public.platform_subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table public.platform_subscriptions add column if not exists current_period_start timestamptz;
alter table public.platform_subscriptions add column if not exists current_period_end timestamptz;

-- Somente funções backend com service_role acessam os cadastros pré-autenticação.
revoke all on table private.billing_signups, private.billing_term_acceptances,
  private.billing_payment_intents, private.billing_outbox from public, anon, authenticated;
grant select,insert,update,delete on table private.billing_signups, private.billing_term_acceptances,
  private.billing_payment_intents, private.billing_outbox to service_role;

comment on table private.billing_signups is 'Contratações self-service. O CNPJ único impede repetição do teste gratuito.';
