-- Trial eligibility is independent of Auth logins and retained after cancellation.
alter table private.billing_signups add column responsible_tax_document text
  check (responsible_tax_document is null or responsible_tax_document ~ '^[0-9]{11}$');

create table private.menu_trial_claims (
  document_hash text primary key check (document_hash ~ '^[a-f0-9]{64}$'),
  responsible_hash text,
  phone_hash text not null,
  email_hash text not null,
  business_hash text not null,
  signup_id uuid references private.billing_signups(id) on delete set null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);
create index menu_trial_claims_responsible_idx on private.menu_trial_claims(responsible_hash);
create index menu_trial_claims_phone_idx on private.menu_trial_claims(phone_hash);
create index menu_trial_claims_email_idx on private.menu_trial_claims(email_hash);
create index menu_trial_claims_business_idx on private.menu_trial_claims(business_hash);
create index menu_trial_claims_signup_idx on private.menu_trial_claims(signup_id);
alter table private.menu_trial_claims enable row level security;
revoke all on private.menu_trial_claims from public,anon,authenticated;

create table private.menu_trial_reviews (
  id uuid primary key default gen_random_uuid(),
  identity_hash text not null unique check (identity_hash ~ '^[a-f0-9]{64}$'),
  business_name text not null check (length(business_name) between 2 and 150),
  contact_email text not null check (length(contact_email) <= 320),
  document_last_four text not null check (document_last_four ~ '^[0-9]{4}$'),
  phone_last_four text not null check (phone_last_four ~ '^[0-9]{4}$'),
  reasons text[] not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','consumed')),
  decision_note text check (length(decision_note) <= 500),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  approved_until timestamptz,
  created_at timestamptz not null default now()
);
create index menu_trial_reviews_status_created_idx on private.menu_trial_reviews(status,created_at desc);
create index menu_trial_reviews_decided_by_idx on private.menu_trial_reviews(decided_by);
alter table private.menu_trial_reviews enable row level security;
revoke all on private.menu_trial_reviews from public,anon,authenticated;

create table private.menu_trial_attempt_buckets (
  bucket_key text not null,
  window_start timestamptz not null,
  attempts integer not null default 1,
  primary key(bucket_key,window_start)
);
create index menu_trial_attempt_buckets_expiry_idx on private.menu_trial_attempt_buckets(window_start);
alter table private.menu_trial_attempt_buckets enable row level security;
revoke all on private.menu_trial_attempt_buckets from public,anon,authenticated;

create function private.menu_trial_hash(value text) returns text
language sql immutable strict set search_path='' as $$
 select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(value,'UTF8')),'hex')
$$;
create function private.menu_trial_business_key(value text) returns text
language sql immutable strict set search_path='' as $$
 select private.menu_trial_hash('business:' || regexp_replace(translate(lower(value),
 'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'[^a-z0-9]+','','g'))
$$;
create function private.menu_trial_identity(payload jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object(
  'document',private.menu_trial_hash('document:'||regexp_replace(payload->>'tax_document','[^0-9]','','g')),
  'responsible',case when coalesce(payload->>'responsible_tax_document','')<>'' then private.menu_trial_hash('document:'||(payload->>'responsible_tax_document'))
    when length(payload->>'tax_document')=11 then private.menu_trial_hash('document:'||(payload->>'tax_document')) end,
  'phone',private.menu_trial_hash('phone:'||(payload->>'phone')),
  'email',private.menu_trial_hash('email:'||lower(trim(payload->>'email'))),
  'business',private.menu_trial_business_key(payload->>'business_name'),
  'request',private.menu_trial_hash(jsonb_build_array(payload->>'tax_document',coalesce(payload->>'responsible_tax_document',''),
    payload->>'phone',lower(trim(payload->>'email')),private.menu_trial_business_key(payload->>'business_name'))::text)
 )
$$;

create function private.menu_trial_reasons(identity jsonb) returns text[]
language sql stable set search_path='' as $$
 select array_remove(array[
  case when exists(select 1 from private.menu_trial_claims c where c.phone_hash=identity->>'phone') then 'phone_used' end,
  case when exists(select 1 from private.menu_trial_claims c where c.email_hash=identity->>'email') then 'email_used' end,
  case when identity->>'responsible' is not null and exists(select 1 from private.menu_trial_claims c
    where c.responsible_hash=identity->>'responsible' or c.document_hash=identity->>'responsible') then 'responsible_used' end,
  case when exists(select 1 from private.menu_trial_claims c where c.responsible_hash=identity->>'document') then 'responsible_used' end,
  case when exists(select 1 from private.menu_trial_claims c where c.business_hash=identity->>'business') then 'business_used' end
 ],null)
$$;

-- Historical claim rows are private and do not retain full documents or phone numbers.
insert into private.menu_trial_claims(document_hash,responsible_hash,phone_hash,email_hash,business_hash,signup_id,used,created_at)
select private.menu_trial_hash('document:'||tax_document),
 case when length(tax_document)=11 then private.menu_trial_hash('document:'||tax_document) end,
 private.menu_trial_hash('phone:'||phone),private.menu_trial_hash('email:'||lower(trim(email))),
 private.menu_trial_business_key(business_name),id,true,created_at
from private.billing_signups where product_code='menu';

create function public.backend_menu_trial_rate_limit(action_name text, signals jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare signal record; counter integer; threshold integer; period_start timestamptz;
  allowed boolean:=true; retry_after integer:=0; current_time_value timestamptz:=clock_timestamp();
begin
 if action_name not in ('signup','phone_send','phone_check') or jsonb_typeof(signals)<>'object' then
  raise exception 'Invalid rate limit request' using errcode='22023';
 end if;
 delete from private.menu_trial_attempt_buckets where window_start<current_time_value-interval '2 days';
 for signal in select key,value from jsonb_each_text(signals) where key in ('ip','phone','document','email') order by key loop
  if signal.value !~ '^[a-f0-9]{64}$' then raise exception 'Invalid signal' using errcode='22023'; end if;
  period_start:=date_trunc('hour',current_time_value);
  threshold:=case when action_name='phone_check' then 10 when signal.key='ip' then 30 when action_name='phone_send' then 3 else 5 end;
  insert into private.menu_trial_attempt_buckets(bucket_key,window_start) values(action_name||':'||signal.key||':'||signal.value,period_start)
  on conflict(bucket_key,window_start) do update set attempts=private.menu_trial_attempt_buckets.attempts+1 returning attempts into counter;
  if counter>threshold then allowed:=false; retry_after:=greatest(retry_after,ceil(extract(epoch from period_start+interval '1 hour'-current_time_value))::integer); end if;
 end loop;
 -- A global ceiling also limits abuse using rotating addresses and phone numbers.
 insert into private.menu_trial_attempt_buckets(bucket_key,window_start) values(action_name||':global',date_trunc('hour',current_time_value))
 on conflict(bucket_key,window_start) do update set attempts=private.menu_trial_attempt_buckets.attempts+1 returning attempts into counter;
 if counter>(case when action_name='phone_send' then 60 else 300 end) then allowed:=false; retry_after:=greatest(retry_after,3600); end if;
 return jsonb_build_object('allowed',allowed,'retry_after_seconds',retry_after);
end $$;

create function public.backend_menu_trial_evaluate(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare identity jsonb:=private.menu_trial_identity(payload); reasons text[]; review private.menu_trial_reviews;
begin
 if exists(select 1 from private.menu_trial_claims where document_hash=identity->>'document') then
  return jsonb_build_object('decision','used');
 end if;
 reasons:=private.menu_trial_reasons(identity);
 if cardinality(reasons)=0 then return jsonb_build_object('decision','allow'); end if;
 insert into private.menu_trial_reviews(identity_hash,business_name,contact_email,document_last_four,phone_last_four,reasons)
 values(identity->>'request',left(payload->>'business_name',150),left(payload->>'email',320),right(payload->>'tax_document',4),right(payload->>'phone',4),reasons)
 on conflict(identity_hash) do nothing;
 select * into review from private.menu_trial_reviews where identity_hash=identity->>'request';
 if review.status='approved' and review.approved_until>now() then return jsonb_build_object('decision','allow'); end if;
 return jsonb_build_object('decision','review','review_id',review.id,'review_status',review.status);
end $$;

-- Optional provider integration: no plaintext OTP or proof token is persisted.
create table private.menu_trial_phone_challenges (
 id uuid primary key default gen_random_uuid(), identity_hash text not null,
 provider_id text not null check(provider_id ~ '^VE[a-fA-F0-9]{32}$'),
 attempts integer not null default 0, proof_hash text unique,
 verified_at timestamptz, consumed_at timestamptz,
 expires_at timestamptz not null default now()+interval '10 minutes'
);
create index menu_trial_phone_challenges_expiry_idx on private.menu_trial_phone_challenges(expires_at);
alter table private.menu_trial_phone_challenges enable row level security;
revoke all on private.menu_trial_phone_challenges from public,anon,authenticated;

create function public.backend_menu_trial_phone(action_name text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare challenge private.menu_trial_phone_challenges; identity jsonb:=private.menu_trial_identity(payload);
begin
 if action_name='create' then
  delete from private.menu_trial_phone_challenges where expires_at<now()-interval '1 day';
  insert into private.menu_trial_phone_challenges(identity_hash,provider_id) values(identity->>'request',payload->>'provider_id') returning * into challenge;
  return jsonb_build_object('challenge_id',challenge.id);
 elsif action_name='attempt' then
  update private.menu_trial_phone_challenges set attempts=attempts+1
   where id=(payload->>'challenge_id')::uuid and identity_hash=identity->>'request'
    and expires_at>now() and attempts<5 and verified_at is null and consumed_at is null returning * into challenge;
  if not found then return null; end if;
  return jsonb_build_object('provider_id',challenge.provider_id);
 elsif action_name='approve' then
  if coalesce(payload->>'proof_hash','') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid proof' using errcode='22023'; end if;
  update private.menu_trial_phone_challenges set proof_hash=payload->>'proof_hash',verified_at=now()
   where id=(payload->>'challenge_id')::uuid and identity_hash=identity->>'request'
    and expires_at>now() and attempts between 1 and 5 and verified_at is null and consumed_at is null returning * into challenge;
  return case when found then jsonb_build_object('verified',true) else null end;
 else raise exception 'Invalid phone action' using errcode='22023'; end if;
end $$;

create function private.guard_menu_trial_signup() returns trigger
language plpgsql security definer set search_path='' as $$
declare identity jsonb; lock_key text; reasons text[]; review private.menu_trial_reviews;
begin
 if new.product_code<>'menu' then return new; end if;
 if new.tax_document !~ '^([0-9]{11}|[0-9]{14})$' then raise exception 'Invalid document' using errcode='23514'; end if;
 if length(new.tax_document)=11 then new.responsible_tax_document:=new.tax_document; end if;
 identity:=private.menu_trial_identity(to_jsonb(new));
 for lock_key in select distinct value from jsonb_each_text(identity) where key<>'request' and value is not null order by value loop
  perform pg_advisory_xact_lock(hashtextextended('menu-trial:'||lock_key,0));
 end loop;
 if exists(select 1 from private.menu_trial_claims where document_hash=identity->>'document') then
  raise exception 'trial_already_used' using errcode='23505';
 end if;
 reasons:=private.menu_trial_reasons(identity);
 if cardinality(reasons)>0 then
  select * into review from private.menu_trial_reviews where identity_hash=identity->>'request' and status='approved' and approved_until>now() for update;
  if not found then raise exception 'trial_review_required' using errcode='P0001'; end if;
  update private.menu_trial_reviews set status='consumed' where id=review.id;
 end if;
 return new;
end $$;
create trigger guard_menu_trial_signup before insert on private.billing_signups for each row execute function private.guard_menu_trial_signup();

create function private.record_menu_trial_claim() returns trigger
language plpgsql security definer set search_path='' as $$
declare identity jsonb:=private.menu_trial_identity(to_jsonb(new));
begin
 if new.product_code='menu' then
  insert into private.menu_trial_claims(document_hash,responsible_hash,phone_hash,email_hash,business_hash,signup_id)
  values(identity->>'document',identity->>'responsible',identity->>'phone',identity->>'email',identity->>'business',new.id);
 end if;
 return new;
end $$;
create trigger record_menu_trial_claim after insert on private.billing_signups for each row execute function private.record_menu_trial_claim();

create function private.mark_menu_trial_claim_used() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='trial' then
  update private.menu_trial_claims c set used=true from private.billing_signups s,public.billing_customers customer
  where c.signup_id=s.id and s.saas_client_id=customer.saas_client_id and customer.id=new.billing_customer_id and s.product_code='menu';
 end if;
 return new;
end $$;
create trigger mark_menu_trial_claim_used after insert on public.platform_subscriptions for each row execute function private.mark_menu_trial_claim_used();

create function private.release_unstarted_menu_trial_claim() returns trigger
language plpgsql security definer set search_path='' as $$
declare identity jsonb:=private.menu_trial_identity(to_jsonb(old));
begin
 delete from private.menu_trial_claims where signup_id=old.id and not used;
 update private.menu_trial_reviews set status='approved' where identity_hash=identity->>'request' and status='consumed'
  and not exists(select 1 from private.menu_trial_claims where document_hash=identity->>'document' and used);
 return old;
end $$;
create trigger release_unstarted_menu_trial_claim before delete on private.billing_signups for each row execute function private.release_unstarted_menu_trial_claim();

create or replace function public.backend_billing_signup_create(payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result_id uuid;
begin
 if coalesce((payload->>'phone_verification_required')::boolean,false) then
  update private.menu_trial_phone_challenges set consumed_at=now()
   where proof_hash=payload->>'phone_proof_hash' and identity_hash=private.menu_trial_identity(payload)->>'request'
    and verified_at is not null and consumed_at is null and expires_at>now();
  if not found then raise exception 'phone_verification_required' using errcode='P0001'; end if;
 end if;
 insert into private.billing_signups(product_code,tax_document,responsible_tax_document,business_name,responsible_name,email,phone,segment,
 cycle,payment_method,base_monthly_cents,cycle_months,discount_bps,total_cents,terms_version,management_token_hash,trial_ends_at)
 values(payload->>'product_code',payload->>'tax_document',nullif(payload->>'responsible_tax_document',''),payload->>'business_name',payload->>'responsible_name',
 payload->>'email',payload->>'phone',payload->>'segment',payload->>'cycle',payload->>'payment_method',
 (payload->>'base_monthly_cents')::integer,(payload->>'cycle_months')::integer,(payload->>'discount_bps')::integer,(payload->>'total_cents')::integer,
 payload->>'terms_version',payload->>'management_token_hash',(payload->>'trial_ends_at')::timestamptz) returning id into result_id;
 return result_id;
end $$;

create function public.platform_menu_trial_reviews() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_platform_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(review) order by review.created_at desc) from
  (select id,business_name,contact_email,document_last_four,phone_last_four,reasons,status,decision_note,created_at,approved_until
   from private.menu_trial_reviews order by created_at desc limit 100) review),'[]'::jsonb);
end $$;
create function public.platform_decide_menu_trial_review(target_review_id uuid,decision text,reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_platform_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
 if coalesce(decision,'') not in ('approved','rejected') or length(trim(coalesce(reason,''))) not between 5 and 500 then raise exception 'Invalid decision' using errcode='22023'; end if;
 update private.menu_trial_reviews set status=decision,decision_note=trim(reason),decided_by=auth.uid(),decided_at=now(),
  approved_until=case when decision='approved' then now()+interval '48 hours' else null end
 where id=target_review_id and status in ('pending','approved','rejected');
 if not found then raise exception 'Review unavailable' using errcode='22023'; end if;
 insert into public.platform_admin_events(actor_id,action,target_id,success,details)
 values(auth.uid(),'trial_review.'||decision,target_review_id::text,true,jsonb_build_object('reason',trim(reason)));
end $$;

revoke all on function private.menu_trial_hash(text),private.menu_trial_business_key(text),private.menu_trial_identity(jsonb),private.menu_trial_reasons(jsonb),
 private.guard_menu_trial_signup(),private.record_menu_trial_claim(),private.mark_menu_trial_claim_used(),private.release_unstarted_menu_trial_claim(),
 public.backend_menu_trial_phone(text,jsonb),public.backend_billing_signup_create(jsonb),public.backend_menu_trial_rate_limit(text,jsonb),public.backend_menu_trial_evaluate(jsonb),
 public.platform_menu_trial_reviews(),public.platform_decide_menu_trial_review(uuid,text,text) from public,anon,authenticated;
grant execute on function public.backend_menu_trial_phone(text,jsonb),public.backend_billing_signup_create(jsonb),public.backend_menu_trial_rate_limit(text,jsonb),public.backend_menu_trial_evaluate(jsonb) to service_role;
grant execute on function public.platform_menu_trial_reviews(),public.platform_decide_menu_trial_review(uuid,text,text) to authenticated;
