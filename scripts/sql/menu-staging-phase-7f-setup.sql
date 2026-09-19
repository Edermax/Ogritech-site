begin;

do $$
begin
  if exists(select 1 from public.barbershops where id='7f000000-0000-4000-8000-000000000001')
     or exists(select 1 from public.online_menus where slug='fase-7f-cardapio-sintetico') then
    raise exception 'A massa sintética da Fase 7F já existe; execute a limpeza antes de recriar';
  end if;
  if not exists(select 1 from private.menu_ai_environment_controls where environment='staging' and hybrid_enabled=false and kill_switch=true and maximum_calls=0 and maximum_cost_cents=0) then
    raise exception 'Os controles de IA do staging não estão fechados';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations) <> 60 then
    raise exception 'Drift de migrations detectado no staging';
  end if;
end $$;

insert into public.barbershops(id,name,segment,active,slug)
values('7f000000-0000-4000-8000-000000000001','Cozinha Horizonte — homologação sintética','Alimentação',true,'fase-7f-cozinha-horizonte');

insert into public.saas_clients(id,name,segment,contact_name,origin,plan,monthly_fee,status,owner_email,phone,notes,barbershop_id)
values('7f000000-0000-4000-8000-000000000002','Cozinha Horizonte — homologação sintética','Alimentação','Operador Sintético','Homologação staging','Agenda',0,'Ativo','operador@fase7f.invalid',null,'Massa sintética temporária da Fase 7F','7f000000-0000-4000-8000-000000000001');

insert into public.platform_subscriptions(billing_customer_id,plan_id,product_id,status,base_amount,current_period_start,current_period_end)
select customer.id,plan.id,product.id,'active',0,now(),now()+interval '2 hours'
from public.billing_customers customer
join public.saas_clients client on client.id=customer.saas_client_id
join public.platform_products product on product.code='menu'
join public.saas_plans plan on plan.product_id=product.id and plan.code='foundation'
where client.id='7f000000-0000-4000-8000-000000000002';

insert into public.online_menus(id,barbershop_id,slug,title,description,accepts_pickup,accepts_delivery,minimum_order,delivery_fee,estimated_minutes,published,published_at,template_code,onboarding_step)
values('7f000000-0000-4000-8000-000000000003','7f000000-0000-4000-8000-000000000001','fase-7f-cardapio-sintetico','Cozinha Horizonte — homologação sintética','Ambiente temporário com dados inteiramente fictícios.',true,false,0,0,35,false,null,'pizzeria','catalog');

insert into public.menu_categories(id,barbershop_id,menu_id,name,description,sort_order) values
('7f000000-0000-4000-8000-000000000011','7f000000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000003','Pizzaria','Pizza fracionada, tamanhos e sabores.',1),
('7f000000-0000-4000-8000-000000000012','7f000000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000003','Lanchonete','Lanches, combos e adicionais.',2),
('7f000000-0000-4000-8000-000000000013','7f000000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000003','Restaurante','Marmitas, acompanhamentos e retirada.',3),
('7f000000-0000-4000-8000-000000000014','7f000000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000003','Confeitaria','Bolos, doces e encomendas.',4);

insert into public.menu_items(id,barbershop_id,category_id,name,description,sort_order,item_type) values
('7f000000-0000-4000-8000-000000000021','7f000000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000011','Pizza Marguerita','Produto fictício para homologação.',1,'simple'),
('7f000000-0000-4000-8000-000000000022','7f000000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000012','X-Salada','Produto fictício para homologação.',1,'simple'),
('7f000000-0000-4000-8000-000000000023','7f000000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000013','Marmita Executiva','Produto fictício para homologação.',1,'simple'),
('7f000000-0000-4000-8000-000000000024','7f000000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000014','Bolo de Chocolate','Produto fictício para homologação.',1,'simple');

insert into public.menu_item_prices(id,barbershop_id,menu_item_id,label,price,sort_order) values
('7f000000-0000-4000-8000-000000000031','7f000000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000021','Padrão',25,1),
('7f000000-0000-4000-8000-000000000032','7f000000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000022','Padrão',28,1),
('7f000000-0000-4000-8000-000000000033','7f000000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000023','Padrão',30,1),
('7f000000-0000-4000-8000-000000000034','7f000000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000024','Padrão',35,1);

insert into public.menu_assistant_settings(barbershop_id,menu_id,enabled,monthly_interaction_limit,per_session_hourly_limit,estimated_unit_cost_micros,monthly_cost_cap_cents)
values('7f000000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000003',true,20,20,0,0);

update public.online_menus
set published=true,published_at=now(),onboarding_step='ready'
where id='7f000000-0000-4000-8000-000000000003';

commit;

select jsonb_build_object(
  'phase','7F','fixture','created','slug',menu.slug,'categories',(select count(*) from public.menu_categories where menu_id=menu.id),
  'items',(select count(*) from public.menu_items where barbershop_id=menu.barbershop_id),
  'ai_controls',(select jsonb_build_object('hybrid_enabled',hybrid_enabled,'kill_switch',kill_switch,'maximum_calls',maximum_calls,'maximum_cost_cents',maximum_cost_cents) from private.menu_ai_environment_controls where environment='staging')
) as result from public.online_menus menu where menu.id='7f000000-0000-4000-8000-000000000003';
