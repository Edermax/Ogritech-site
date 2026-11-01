begin;
set local search_path=public,extensions;
select extensions.no_plan();
create function pg_temp.cpf_signup(doc text, token text) returns void language sql as $$
 insert into private.billing_signups(tax_document,business_name,responsible_name,email,phone,cycle,payment_method,base_monthly_cents,cycle_months,discount_bps,total_cents,terms_version,management_token_hash,product_code)
 values(doc,'CPF fixture','Fixture','cpf-fixture@example.invalid','11999999999','monthly','pix',4990,1,0,4990,'fixture',token,'menu');
$$;
select extensions.lives_ok($$select pg_temp.cpf_signup('52998224725','cpf-fixture-one')$$,'normalized CPF can start a menu signup');
select extensions.lives_ok($$select pg_temp.cpf_signup('11222333000181','cpf-fixture-company')$$,'CNPJ remains accepted');
select extensions.throws_ok($$select pg_temp.cpf_signup('52998224725','cpf-fixture-duplicate')$$,'23505',null,'same CPF cannot repeat the trial for the same product');
select extensions.throws_ok($$select pg_temp.cpf_signup('529.982.247-25','cpf-fixture-formatted')$$,'23514',null,'database accepts only normalized documents');
select extensions.throws_ok($$select pg_temp.cpf_signup('123456789012','cpf-fixture-length')$$,'23514',null,'other document lengths are rejected');
select extensions.ok(not has_table_privilege('anon','private.billing_signups','select'),'document data remains private');
select * from extensions.finish();
rollback;
