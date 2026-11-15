-- Plans are commercial variants of the two supported capability families.
alter table public.saas_plans add column menu_offer_code text check(menu_offer_code in ('cardapio','encomendas'));
alter table public.saas_plans add column annual_fee numeric(12,2);
update public.saas_plans p set menu_offer_code=case when p.code='cardapio' then 'cardapio' else 'encomendas' end,
 annual_fee=case when p.code='cardapio' then 299.00 else 499.00 end
where p.product_id=(select id from public.platform_products where code='menu');

create function private.validate_menu_plan() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.product_id,new.code,new.menu_offer_code,new.name) is distinct from (old.product_id,old.code,old.menu_offer_code,old.name) then
  raise exception 'O nome, código, produto e base do plano não podem ser alterados. Crie outro plano.' using errcode='23514';
 end if;
 if not exists(select 1 from public.platform_products where id=new.product_id and code='menu') then return new; end if;
 if new.menu_offer_code is null or new.menu_offer_code not in ('cardapio','encomendas')
   or length(btrim(new.name)) not between 2 and 80 or length(btrim(new.description)) not between 2 and 300
   or new.monthly_fee is null or new.monthly_fee not between 0.01 and 100000
   or new.annual_fee is null or new.annual_fee not between 0.01 and 1200000 or new.annual_fee>new.monthly_fee*12
   or new.display_order not between 0 and 99999
   or jsonb_typeof(new.features) is distinct from 'array' then
  raise exception 'Confira o nome, a base, os valores, a descrição e a ordem do plano.' using errcode='22023';
 end if;
 if jsonb_array_length(new.features)>30 or exists(select 1 from jsonb_array_elements(new.features) f where jsonb_typeof(f)<>'string' or length(btrim(f#>>'{}')) not between 1 and 160) then
  raise exception 'Informe até 30 recursos, com até 160 caracteres cada.' using errcode='22023';
 end if;
 if new.code='encomendas' then raise exception 'Esse código é reservado. Escolha outro código para o plano.' using errcode='23514'; end if;
 if (new.code='cardapio' and (new.menu_offer_code<>'cardapio' or new.annual_fee<>299.00))
   or (new.code='foundation' and (new.menu_offer_code<>'encomendas' or new.annual_fee<>499.00)) then
  raise exception 'Os valores e a base dos planos principais são preservados. Crie um novo plano para outra oferta.' using errcode='23514';
 end if;
 new.name:=btrim(new.name); new.description:=btrim(new.description);
 return new;
end $$;
revoke all on function private.validate_menu_plan() from public,anon,authenticated;
create trigger validate_menu_plan before insert or update on public.saas_plans for each row execute function private.validate_menu_plan();

create function private.save_menu_plan(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid; product uuid; saved public.saas_plans; previous public.saas_plans;
begin
 if (select auth.uid()) is null or not public.is_platform_admin() then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
 if jsonb_typeof(payload) is distinct from 'object' or exists(select 1 from jsonb_object_keys(payload) k where k<>all(array['id','code','name','offer_code','monthly_fee','annual_fee','description','features','featured','active','display_order','max_users'])) then
  raise exception 'Dados do plano inválidos' using errcode='22023';
 end if;
 if coalesce(payload->>'code','') !~ '^[a-z0-9][a-z0-9_-]{2,63}$' or payload->>'offer_code' not in ('cardapio','encomendas')
   or jsonb_typeof(payload->'name') is distinct from 'string' or jsonb_typeof(payload->'description') is distinct from 'string'
   or jsonb_typeof(payload->'features') is distinct from 'array' or jsonb_typeof(payload->'monthly_fee') is distinct from 'number' or jsonb_typeof(payload->'annual_fee') is distinct from 'number'
   or jsonb_typeof(payload->'active') is distinct from 'boolean' or jsonb_typeof(payload->'featured') is distinct from 'boolean'
   or jsonb_typeof(payload->'display_order') is distinct from 'number'
   or (payload->'max_users' is not null and payload->'max_users'<>'null'::jsonb and jsonb_typeof(payload->'max_users')<>'number') then
  raise exception 'Confira os campos do plano' using errcode='22023';
 end if;
 select id into strict product from public.platform_products where code='menu';
 target:=nullif(payload->>'id','')::uuid;
 if target is not null then
  select * into strict previous from public.saas_plans where id=target and product_id=product for update;
 end if;
 insert into public.saas_plans(id,product_id,code,name,menu_offer_code,monthly_fee,annual_fee,description,features,featured,active,display_order,max_users)
 values(coalesce(target,gen_random_uuid()),product,payload->>'code',payload->>'name',payload->>'offer_code',
 (payload->>'monthly_fee')::numeric,(payload->>'annual_fee')::numeric,payload->>'description',payload->'features',
 (payload->>'featured')::boolean,(payload->>'active')::boolean,(payload->>'display_order')::integer,nullif(payload->>'max_users','')::integer)
 on conflict(id) do update set code=excluded.code,name=excluded.name,menu_offer_code=excluded.menu_offer_code,
 monthly_fee=excluded.monthly_fee,annual_fee=excluded.annual_fee,description=excluded.description,features=excluded.features,
 featured=excluded.featured,active=excluded.active,display_order=excluded.display_order,max_users=excluded.max_users returning * into saved;
 insert into public.platform_billing_audit_log(action,entity_type,entity_id,details)
 values(case when target is null then 'plan.created' else 'plan.updated' end,'plan',saved.id,
 jsonb_build_object('code',saved.code,'offer_code',saved.menu_offer_code,'monthly_fee',saved.monthly_fee,'annual_fee',saved.annual_fee,'active',saved.active));
 return to_jsonb(saved);
exception when unique_violation then raise exception 'Já existe um plano com esse nome ou código.' using errcode='23505';
 when invalid_text_representation or numeric_value_out_of_range or check_violation then raise exception 'Confira os valores, limites e código do plano.' using errcode='22023';
 when no_data_found then raise exception 'Plano não encontrado' using errcode='22023';
end $$;
create function public.platform_save_menu_plan(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.save_menu_plan(payload) $$;
revoke all on function private.save_menu_plan(jsonb),public.platform_save_menu_plan(jsonb) from public,anon;
grant execute on function private.save_menu_plan(jsonb),public.platform_save_menu_plan(jsonb) to authenticated;

create function private.public_menu_plans() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'code',p.code,'name',p.name,'offer_code',p.menu_offer_code,
 'monthly_fee',p.monthly_fee,'annual_fee',p.annual_fee,'description',p.description,'features',p.features,
 'featured',p.featured,'max_users',p.max_users) order by p.display_order,p.monthly_fee,p.name),'[]'::jsonb)
 from public.saas_plans p join public.platform_products product on product.id=p.product_id
 where product.code='menu' and product.active and p.active and p.menu_offer_code is not null
$$;
create function public.public_menu_plans() returns jsonb language sql stable security invoker set search_path='' as $$ select private.public_menu_plans() $$;
revoke all on function private.public_menu_plans(),public.public_menu_plans() from public;
grant execute on function private.public_menu_plans(),public.public_menu_plans() to anon,authenticated;

-- Existing contracts keep their agreed prices even if a catalog price changes.
alter table private.billing_signups add column saas_plan_id uuid references public.saas_plans(id) on delete restrict;
alter table private.billing_signups add column plan_name_snapshot text;
alter table private.billing_signups add column plan_annual_cents integer;
update private.billing_signups b set saas_plan_id=coalesce((
 select s.plan_id from public.platform_subscriptions s join public.billing_customers bc on bc.id=s.billing_customer_id
 join public.platform_products pr on pr.id=s.product_id where bc.saas_client_id=b.saas_client_id and pr.code='menu'
 order by s.created_at desc limit 1),(
 select p.id from public.saas_plans p join public.platform_products pr on pr.id=p.product_id
 where pr.code='menu' and p.code=case when b.offer_code='cardapio' then 'cardapio' else 'foundation' end)),
 plan_annual_cents=case when cycle='annual' then total_cents else base_monthly_cents*10 end where product_code='menu';
update private.billing_signups b set plan_name_snapshot=p.name from public.saas_plans p where p.id=b.saas_plan_id;
create index billing_signups_saas_plan_idx on private.billing_signups(saas_plan_id) where saas_plan_id is not null;
alter table private.billing_signups drop constraint billing_signups_offer_price_check;
alter table private.billing_signups drop constraint billing_signups_discount_bps_check;
alter table private.billing_signups add constraint billing_signups_discount_bps_check check(discount_bps between 0 and 10000);
alter table private.billing_signups add constraint billing_signups_offer_price_check check(
 (product_code='agenda' and base_monthly_cents=9700) or
 (product_code='menu' and saas_plan_id is not null and plan_name_snapshot is not null and base_monthly_cents>0 and plan_annual_cents>0
  and ((cycle='monthly' and cycle_months=1 and total_cents=base_monthly_cents and discount_bps=0)
   or (cycle='annual' and cycle_months=12 and total_cents=plan_annual_cents
    and discount_bps=round((base_monthly_cents::numeric*12-plan_annual_cents)*10000/(base_monthly_cents*12)))))
);

create or replace function private.assign_menu_signup_offer() returns trigger language plpgsql security definer set search_path='' as $$
declare plan public.saas_plans;
begin
 if new.product_code<>'menu' then return new; end if;
 select p.* into strict plan from public.saas_plans p join public.platform_products pr on pr.id=p.product_id
 where pr.code='menu' and p.active and (p.id=new.saas_plan_id or (new.saas_plan_id is null and p.code=case when new.base_monthly_cents=2990 then 'cardapio' else 'foundation' end)) for share of p;
 if new.base_monthly_cents<>(plan.monthly_fee*100)::integer or new.total_cents<>(case when new.cycle='annual' then (plan.annual_fee*100)::integer else (plan.monthly_fee*100)::integer end) then
  raise exception 'O preço do plano mudou. Atualize a página e tente novamente.' using errcode='40001';
 end if;
 new.saas_plan_id:=plan.id; new.offer_code:=plan.menu_offer_code; new.plan_name_snapshot:=plan.name; new.plan_annual_cents:=(plan.annual_fee*100)::integer;
 return new;
exception when no_data_found then raise exception 'Plano indisponível para contratação' using errcode='22023';
end $$;

create or replace function public.backend_billing_signup_create(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result_id uuid;
begin
 if coalesce((payload->>'phone_verification_required')::boolean,false) then
  update private.menu_trial_phone_challenges set consumed_at=now()
   where proof_hash=payload->>'phone_proof_hash' and identity_hash=private.menu_trial_identity(payload)->>'request'
    and verified_at is not null and consumed_at is null and expires_at>now();
  if not found then raise exception 'phone_verification_required' using errcode='P0001'; end if;
 end if;
 insert into private.billing_signups(product_code,saas_plan_id,tax_document,responsible_tax_document,business_name,responsible_name,email,phone,segment,
 cycle,payment_method,base_monthly_cents,cycle_months,discount_bps,total_cents,terms_version,management_token_hash,trial_ends_at)
 values(payload->>'product_code',nullif(payload->>'plan_id','')::uuid,payload->>'tax_document',nullif(payload->>'responsible_tax_document',''),payload->>'business_name',payload->>'responsible_name',
 payload->>'email',payload->>'phone',payload->>'segment',payload->>'cycle',payload->>'payment_method',
 (payload->>'base_monthly_cents')::integer,(payload->>'cycle_months')::integer,(payload->>'discount_bps')::integer,(payload->>'total_cents')::integer,
 payload->>'terms_version',payload->>'management_token_hash',(payload->>'trial_ends_at')::timestamptz) returning id into result_id;
 return result_id;
end $$;

create or replace function private.menu_offer(target_barbershop_id uuid) returns text language sql stable security definer set search_path='' as $$
 select p.menu_offer_code from public.platform_subscriptions s join public.billing_customers bc on bc.id=s.billing_customer_id
 join public.saas_clients c on c.id=bc.saas_client_id join public.platform_products product on product.id=s.product_id join public.saas_plans p on p.id=s.plan_id
 where c.barbershop_id=target_barbershop_id and c.deleted_at is null and product.code='menu' and s.status<>'cancelled'
 order by s.created_at desc limit 1
$$;

create or replace function private.sync_menu_offer() returns trigger language plpgsql security definer set search_path='' as $$
declare plan public.saas_plans; signup private.billing_signups; client_id uuid; amount integer;
begin
 if new.plan_id is not distinct from old.plan_id then return new; end if;
 if not exists(select 1 from public.platform_products where id=new.product_id and code='menu') then return new; end if;
 select * into strict plan from public.saas_plans where id=new.plan_id and product_id=new.product_id and active;
 if plan.menu_offer_code is null then raise exception 'Plano incompatível' using errcode='22023'; end if;
 select saas_client_id into client_id from public.billing_customers where id=new.billing_customer_id;
 select * into signup from private.billing_signups where saas_client_id=client_id and product_code='menu' for update;
 if signup.id is not null then
  if signup.status='payment_pending' or exists(select 1 from private.billing_payment_intents where signup_id=signup.id and status='pending') then raise exception 'Conclua o pagamento pendente antes de trocar de plano' using errcode='23514'; end if;
  if signup.provider_subscription_id is not null and coalesce(current_setting('ogritech.offer_change',true),'')<>'provider_updated' then raise exception 'Use a alteração de plano na central de assinatura' using errcode='23514'; end if;
  amount:=(plan.monthly_fee*100)::integer;
  update private.billing_signups set saas_plan_id=plan.id,plan_name_snapshot=plan.name,plan_annual_cents=(plan.annual_fee*100)::integer,
   offer_code=plan.menu_offer_code,base_monthly_cents=amount,total_cents=case when cycle='annual' then (plan.annual_fee*100)::integer else amount end,
   discount_bps=case when cycle='annual' then round((plan.monthly_fee*12-plan.annual_fee)*10000/(plan.monthly_fee*12))::integer else 0 end where id=signup.id;
 end if;
 new.base_amount:=plan.monthly_fee;
 update public.saas_clients set plan=plan.name,monthly_fee=plan.monthly_fee where id=client_id;
 return new;
end $$;

-- Include inactive current plans for accurate contract identity, but not as choices.
do $patch$ declare definition text; patched text;
begin
 definition:=pg_get_functiondef('private.business_subscription_center(uuid)'::regprocedure);
 patched:=replace(definition,'''monthly_fee'',plan.monthly_fee,', '''monthly_fee'',plan.monthly_fee,''annual_fee'',plan.annual_fee,''offer_code'',plan.menu_offer_code,''active'',plan.active,');
 patched:=replace(patched,'plan.product_id=product.id and plan.active',
  'plan.product_id=product.id and (plan.active or exists(select 1 from public.platform_subscriptions current_sub join public.billing_customers current_bc on current_bc.id=current_sub.billing_customer_id join public.saas_clients current_client on current_client.id=current_bc.saas_client_id where current_sub.plan_id=plan.id and current_client.barbershop_id=target_barbershop_id and current_client.deleted_at is null))');
 patched:=replace(patched,'''plan_name'',plan.name,',
  '''plan_name'',plan.name,''plan_name_snapshot'',coalesce((select b.plan_name_snapshot from private.billing_signups b where b.barbershop_id=target_barbershop_id and b.product_code=product.code limit 1),plan.name),''contract_monthly_cents'',coalesce((select b.base_monthly_cents from private.billing_signups b where b.barbershop_id=target_barbershop_id and b.product_code=product.code limit 1),(subscription.base_amount*100)::integer),''contract_annual_cents'',coalesce((select b.plan_annual_cents from private.billing_signups b where b.barbershop_id=target_barbershop_id and b.product_code=product.code limit 1),case when subscription.base_amount=0 then 0 else (plan.annual_fee*100)::integer end),');
 if patched=definition then raise exception 'Subscription catalog anchor missing'; end if; execute patched;
end $patch$;

-- Existing durable reservations and provider reconciliation also protect custom plans.
alter table private.menu_offer_changes add column target_plan_id uuid references public.saas_plans(id) on delete restrict;
alter table private.menu_offer_changes add column target_monthly_cents integer;
alter table private.menu_offer_changes add column target_annual_cents integer;
create index menu_offer_changes_plan_idx on private.menu_offer_changes(target_plan_id) where target_plan_id is not null;
create or replace function public.backend_billing_offer_change_claim(target_barbershop_id uuid,target_offer text,expected_updated_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare signup private.billing_signups; operation private.menu_offer_changes; subscription public.platform_subscriptions; plan public.saas_plans;
begin
 select s.* into strict subscription from public.platform_subscriptions s join public.billing_customers bc on bc.id=s.billing_customer_id
 join public.saas_clients c on c.id=bc.saas_client_id join public.platform_products p on p.id=s.product_id
 where c.barbershop_id=target_barbershop_id and c.deleted_at is null and p.code='menu' and s.status<>'cancelled' for update of s;
 select * into strict signup from private.billing_signups where barbershop_id=target_barbershop_id and product_code='menu' for update;
 if exists(select 1 from private.menu_offer_changes where signup_id=signup.id) then raise exception 'Existe uma alteração de plano em processamento. Atualize sua assinatura em instantes.' using errcode='55000'; end if;
 if signup.updated_at is distinct from expected_updated_at then raise exception 'Assinatura alterada; atualize a página e tente novamente' using errcode='40001'; end if;
 if signup.status in ('cancelled','failed','payment_pending','cancel_at_period_end') or subscription.cancel_at_period_end
  or exists(select 1 from private.billing_payment_intents where signup_id=signup.id and status='pending') then raise exception 'Regularize o pagamento ou a assinatura antes de trocar de plano' using errcode='23514'; end if;
 select p.* into strict plan from public.saas_plans p join public.platform_products pr on pr.id=p.product_id where pr.code='menu' and p.active and p.code=case when target_offer='encomendas' then 'foundation' else target_offer end for share of p;
 if plan.menu_offer_code='cardapio' then perform private.assert_cardapio_contact(target_barbershop_id,true); end if;
 if subscription.plan_id=plan.id then return jsonb_build_object('unchanged',true,'signup',to_jsonb(signup)); end if;
 insert into private.menu_offer_changes(signup_id,target_offer,expected_updated_at,target_plan_id,target_monthly_cents,target_annual_cents) values(signup.id,plan.menu_offer_code,signup.updated_at,plan.id,(plan.monthly_fee*100)::integer,(plan.annual_fee*100)::integer) returning * into operation;
 return jsonb_build_object('operation_id',operation.id,'lease_token',operation.lease_token,'signup',to_jsonb(signup),'target_plan',to_jsonb(plan));
end $$;

create or replace function public.backend_billing_change_offer(target_barbershop_id uuid,target_offer text,expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare signup private.billing_signups; plan public.saas_plans; subscription public.platform_subscriptions;
begin
 if target_offer is null then raise exception 'Plano inválido' using errcode='22023'; end if;
 -- Lock subscriptions before signup, consistently with the plan-edit trigger.
 select s.* into strict subscription from public.platform_subscriptions s join public.billing_customers c on c.id=s.billing_customer_id
 join public.saas_clients sc on sc.id=c.saas_client_id join public.platform_products p on p.id=s.product_id
 where sc.barbershop_id=target_barbershop_id and sc.deleted_at is null and p.code='menu' and s.status<>'cancelled' for update of s;
 select * into strict signup from private.billing_signups where barbershop_id=target_barbershop_id and product_code='menu' for update;
 if signup.updated_at is distinct from expected_updated_at then raise exception 'Assinatura alterada; atualize a página e tente novamente' using errcode='40001'; end if;
 if signup.status in ('cancelled','failed','payment_pending','cancel_at_period_end') or subscription.cancel_at_period_end then raise exception 'Regularize a assinatura antes de trocar de plano' using errcode='23514'; end if;
 select p.* into strict plan from public.saas_plans p where product_id=subscription.product_id
 and code=case when target_offer='encomendas' then 'foundation' else target_offer end and active;
 perform set_config('ogritech.offer_change','provider_updated',true);
 update public.platform_subscriptions set plan_id=plan.id,base_amount=plan.monthly_fee where id=subscription.id;
 insert into public.platform_billing_audit_log(action,entity_type,entity_id,details)
 values('subscription.offer_changed','subscription',subscription.id,jsonb_build_object('previous_offer',signup.offer_code,'offer',plan.menu_offer_code,'plan_id',plan.id,'plan_name',plan.name,'trial_ends_at',signup.trial_ends_at));
 return jsonb_build_object('offer',plan.menu_offer_code,'plan_id',plan.id,'plan_name',plan.name,'trial_ends_at',signup.trial_ends_at,'access_until',signup.access_until,'cycle',signup.cycle);
end $$;

create or replace function public.backend_billing_offer_change_commit(target_operation_id uuid,target_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare operation private.menu_offer_changes; signup private.billing_signups; result jsonb; plan public.saas_plans;
begin
 select * into strict operation from private.menu_offer_changes where id=target_operation_id and lease_token=target_token and state='processing' for update;
 select * into strict signup from private.billing_signups where id=operation.signup_id;
 perform 1 from public.platform_subscriptions s join public.billing_customers bc on bc.id=s.billing_customer_id
 join public.saas_clients c on c.id=bc.saas_client_id join public.platform_products pr on pr.id=s.product_id
 where c.barbershop_id=signup.barbershop_id and c.deleted_at is null and pr.code='menu' and s.status<>'cancelled' for update of s;
 perform 1 from private.billing_signups where id=signup.id for update;
 if operation.target_plan_id is not null then
  select * into strict plan from public.saas_plans where id=operation.target_plan_id and active for share;
  if (plan.monthly_fee*100)::integer<>operation.target_monthly_cents or (plan.annual_fee*100)::integer<>operation.target_annual_cents then raise exception 'O preço do plano mudou. Atualize sua assinatura.' using errcode='40001'; end if;
 end if;
 perform set_config('ogritech.offer_operation',target_token::text,true);
 result:=public.backend_billing_change_offer(signup.barbershop_id,coalesce(plan.code,operation.target_offer),operation.expected_updated_at);
 return result;
end $$;

create or replace view public.backend_billing_signups with(security_invoker=true) as select * from private.billing_signups;

-- Retired commercial plans retain their limits for existing subscriptions.
do $capacity$ declare definition text; patched text;
begin
 definition:=pg_get_functiondef('private.business_plan_capacity(uuid)'::regprocedure);
 patched:=replace(definition,'plan.name = client_row.plan and plan.active',
 'plan.name = client_row.plan and (plan.active or (plan.menu_offer_code is not null and exists(select 1 from public.platform_subscriptions s join public.billing_customers bc on bc.id=s.billing_customer_id where s.plan_id=plan.id and bc.saas_client_id=client_row.id and s.status<>''cancelled'')))');
 if patched=definition then raise exception 'Plan capacity anchor missing'; end if; execute patched;
 definition:=pg_get_functiondef('private.enforce_business_plan_capacity()'::regprocedure);
 patched:=replace(definition,'plan.name = client.plan and plan.active',
 'plan.name = client.plan and (plan.active or (plan.menu_offer_code is not null and exists(select 1 from public.platform_subscriptions s join public.billing_customers bc on bc.id=s.billing_customer_id where s.plan_id=plan.id and bc.saas_client_id=client.id and s.status<>''cancelled'')))');
 if patched=definition then raise exception 'Capacity trigger anchor missing'; end if; execute patched;
 definition:=pg_get_functiondef('private.assert_plan_fits_business(uuid,text)'::regprocedure);
 patched:=replace(definition,'where name = target_plan_name and active limit 1',
 'where name = target_plan_name and (active or (menu_offer_code is not null and exists(select 1 from public.platform_subscriptions s join public.billing_customers bc on bc.id=s.billing_customer_id join public.saas_clients c on c.id=bc.saas_client_id where s.plan_id=public.saas_plans.id and c.barbershop_id=target_barbershop_id and c.deleted_at is null and s.status<>''cancelled''))) limit 1');
 if patched=definition then raise exception 'Plan assignment anchor missing'; end if; execute patched;
end $capacity$;

do $context$ declare definition text; patched text;
begin
 definition:=pg_get_functiondef('private.menu_onboarding_snapshot(uuid)'::regprocedure);
 patched:=replace(definition,'''offer_code'',private.menu_offer(target_barbershop_id)',
 '''offer_code'',private.menu_offer(target_barbershop_id),''plan_name'',(select coalesce(bs.plan_name_snapshot,p.name) from public.platform_subscriptions sub join public.billing_customers bc on bc.id=sub.billing_customer_id join public.saas_clients c on c.id=bc.saas_client_id join public.saas_plans p on p.id=sub.plan_id join public.platform_products pr on pr.id=sub.product_id left join private.billing_signups bs on bs.saas_client_id=c.id and bs.product_code=''menu'' where c.barbershop_id=target_barbershop_id and c.deleted_at is null and pr.code=''menu'' and sub.status<>''cancelled'' order by sub.created_at desc limit 1)');
 if patched=definition then raise exception 'Panel plan context anchor missing'; end if; execute patched;
end $context$;
notify pgrst,'reload schema';
