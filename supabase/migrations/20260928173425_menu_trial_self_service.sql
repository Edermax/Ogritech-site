-- Habilita testes gratuitos independentes por produto e fixa a oferta comercial
-- do Ogritech Cardapio em R$ 49,90 mensais.

alter table private.billing_signups
  add column product_code text not null default 'agenda'
    check (product_code in ('agenda','menu'));

alter table private.billing_signups drop constraint if exists billing_signups_tax_document_key;
alter table private.billing_signups drop constraint if exists billing_signups_base_monthly_cents_check;
alter table private.billing_signups add constraint billing_signups_product_tax_document_key
  unique(product_code,tax_document);
alter table private.billing_signups add constraint billing_signups_product_price_check check(
  (product_code='agenda' and base_monthly_cents=9700)
  or (product_code='menu' and base_monthly_cents=4990)
);

update public.platform_products
set launch_state='active',active=true,updated_at=now()
where code='menu';

update public.saas_plans
set name='Cardapio',monthly_fee=49.90,
    description='Cardapio online com pedidos, configuracao self-service e 14 dias gratuitos.',
    features='["Cardapio online","Pedidos sem comissao","Configuracao self-service","Suporte Ogritech"]'::jsonb,
    featured=true,active=true,display_order=1
where product_id=(select id from public.platform_products where code='menu')
  and code='foundation';

comment on table private.billing_signups is
  'Contratacoes self-service. Cada CNPJ pode utilizar um teste gratuito por produto.';
