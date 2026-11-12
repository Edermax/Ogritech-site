begin;
set local search_path=public,extensions;
select extensions.no_plan();
create function pg_temp.trial_payload(doc text,phone text default '91989898001',business text default 'Anti abuse fixture') returns jsonb language sql as $$
 select jsonb_build_object('product_code','menu','tax_document',doc,'responsible_tax_document',doc,'phone',phone,'email',doc||'@example.invalid',
 'business_name',business,'responsible_name','Fixture','segment','Fixture','cycle','monthly','payment_method','pix','base_monthly_cents',4990,
 'cycle_months',1,'discount_bps',0,'total_cents',4990,'terms_version','fixture','management_token_hash',doc||gen_random_uuid()::text,
 'trial_ends_at',now()+interval '14 days')
$$;
select extensions.lives_ok($$select public.backend_billing_signup_create(pg_temp.trial_payload('90000000001'))$$,'first business can reserve a trial');
select extensions.is(public.backend_menu_trial_evaluate(pg_temp.trial_payload('90000000001'))->>'decision','used','same document cannot switch login to repeat trial');
select extensions.is(public.backend_menu_trial_evaluate(pg_temp.trial_payload('90000000002'))->>'decision','review','same phone or business requires review');
select extensions.throws_ok($$select public.backend_billing_signup_create(pg_temp.trial_payload('90000000002'))$$,'P0001','trial_review_required','bypassing preflight cannot provision duplicate signals');
select extensions.ok(exists(select 1 from private.menu_trial_reviews where reasons @> array['phone_used','business_used']),'review stores risk signals');
select extensions.ok(not has_function_privilege('anon','public.backend_menu_trial_evaluate(jsonb)','execute'),'anonymous cannot inspect identity signals directly');
select extensions.ok(not has_function_privilege('authenticated','public.backend_billing_signup_create(jsonb)','execute'),'client cannot bypass Edge checks');
select extensions.ok(not has_table_privilege('authenticated','private.menu_trial_claims','select'),'trial history is private');
select extensions.throws_ok($$select public.platform_menu_trial_reviews()$$,'42501','Administrator required','review list denies non-administrators');
select extensions.throws_ok($$select private.platform_menu_trial_reviews()$$,'42501','Administrator required','private entry point also denies non-administrators');
select extensions.ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('platform_menu_trial_reviews','platform_decide_menu_trial_review') and p.prosecdef),'public review endpoints never elevate privileges');

insert into auth.users(id,email) values('c9100000-0000-4000-8000-000000000001','trial-admin-fixture@example.invalid');
insert into public.platform_admins(user_id) values('c9100000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims','{"sub":"c9100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.ok(jsonb_array_length(public.platform_menu_trial_reviews())>0,'administrator can list reviews');
select public.platform_decide_menu_trial_review((public.backend_menu_trial_evaluate(pg_temp.trial_payload('90000000002'))->>'review_id')::uuid,'approved','Separate legitimate business checked');
select extensions.is(public.backend_menu_trial_evaluate(pg_temp.trial_payload('90000000002'))->>'decision','allow','administrator exception allows exact identity');
select extensions.is(public.backend_menu_trial_evaluate(pg_temp.trial_payload('90000000002')||'{"email":"other@example.invalid"}'::jsonb)->>'decision','review','approval does not authorize changed identity');
select extensions.lives_ok($$select public.backend_billing_signup_create(pg_temp.trial_payload('90000000002'))$$,'approved identity can create exactly once');
select extensions.ok(exists(select 1 from private.menu_trial_reviews where status='consumed'),'exception consumed atomically');
select extensions.throws_ok($$select public.backend_billing_signup_create(pg_temp.trial_payload('90000000002'))$$,'23505','trial_already_used','approval cannot repeat the same document');
select extensions.ok(exists(select 1 from public.platform_admin_events where actor_id='c9100000-0000-4000-8000-000000000001' and action='trial_review.approved'),'decision is audited');
update private.menu_trial_claims set used=true where document_hash=private.menu_trial_hash('document:90000000001');
delete from private.billing_signups where tax_document='90000000001';
select extensions.is(public.backend_menu_trial_evaluate(pg_temp.trial_payload('90000000001'))->>'decision','used','used trial survives deletion and cancellation');
delete from private.billing_signups where tax_document='90000000002';
select extensions.ok(not exists(select 1 from private.menu_trial_claims where document_hash=private.menu_trial_hash('document:90000000002')),'unstarted reservation is released during rollback');
select extensions.ok(exists(select 1 from private.menu_trial_reviews where status='approved'),'rollback restores unused exception');

select public.backend_menu_trial_rate_limit('signup',jsonb_build_object('phone',private.menu_trial_hash('rate-fixture'))) from generate_series(1,5);
select extensions.is(public.backend_menu_trial_rate_limit('signup',jsonb_build_object('phone',private.menu_trial_hash('rate-fixture')))->>'allowed','false','sixth attempt is rate limited');
select extensions.ok((select attempts>=6 from private.menu_trial_attempt_buckets where bucket_key='signup:phone:'||private.menu_trial_hash('rate-fixture')),'denied attempt remains counted');

create temporary table trial_phone_fixture as select (public.backend_menu_trial_phone('create',pg_temp.trial_payload('90000000003','91989898003','Other fixture')||'{"provider_id":"VE11111111111111111111111111111111"}'::jsonb)->>'challenge_id')::uuid id;
select extensions.ok(public.backend_menu_trial_phone('attempt',pg_temp.trial_payload('90000000003','91989898003','Other fixture')||jsonb_build_object('challenge_id',(select id from trial_phone_fixture))) is not null,'code attempt is bound to identity');
select extensions.ok(public.backend_menu_trial_phone('attempt',pg_temp.trial_payload('90000000004','91989898004','Other fixture')||jsonb_build_object('challenge_id',(select id from trial_phone_fixture))) is null,'another identity cannot check challenge');
select public.backend_menu_trial_phone('approve',pg_temp.trial_payload('90000000003','91989898003','Other fixture')||jsonb_build_object('challenge_id',(select id from trial_phone_fixture),'proof_hash',private.menu_trial_hash('opaque-fixture')));
select extensions.throws_ok($$select public.backend_billing_signup_create(pg_temp.trial_payload('90000000003','91989898003','Other fixture')||jsonb_build_object('phone_verification_required',true,'phone_proof_hash',private.menu_trial_hash('wrong-proof')))$$,'P0001','phone_verification_required','spoofed proof cannot create trial');
select extensions.lives_ok($$select public.backend_billing_signup_create(pg_temp.trial_payload('90000000003','91989898003','Other fixture')||jsonb_build_object('phone_verification_required',true,'phone_proof_hash',private.menu_trial_hash('opaque-fixture')))$$,'verified proof is consumed in signup transaction');
select extensions.throws_ok($$select public.backend_billing_signup_create(pg_temp.trial_payload('90000000003','91989898003','Other fixture')||jsonb_build_object('phone_verification_required',true,'phone_proof_hash',private.menu_trial_hash('opaque-fixture')))$$,'P0001','phone_verification_required','consumed proof cannot be replayed');
select * from extensions.finish();
rollback;
