-- Preserve existing per-product uniqueness and all grants/RLS.
alter table private.billing_signups drop constraint billing_signups_tax_document_check;
alter table private.billing_signups add constraint billing_signups_tax_document_check
  check (tax_document ~ '^([0-9]{11}|[0-9]{14})$');
comment on table private.billing_signups is 'Contratacoes self-service. Teste unico por produto e CPF/CNPJ normalizado. Preferencia de nota nao dispensa obrigacoes fiscais.';
