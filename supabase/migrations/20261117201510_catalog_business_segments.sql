-- Presentation classification only. No existing row, subscription or price is migrated.
create function private.catalog_business_segment(value text) returns jsonb
language sql immutable set search_path='' as $$
 select entry from jsonb_array_elements('[{"code":"food","label":"Alimentos e bebidas","profile":"food","template":"restaurant","aliases":["Outro negócio de alimentação","Alimentação"]},{"code":"pizzeria","label":"Pizzaria","profile":"food","template":"pizzeria","aliases":[]},{"code":"snack-bar","label":"Hamburgueria e lanchonete","profile":"food","template":"snack-bar","aliases":["Lanchonete","Hamburgueria"]},{"code":"restaurant","label":"Restaurante e marmitaria","profile":"food","template":"restaurant","aliases":["Restaurante","Marmitaria"]},{"code":"confectionery","label":"Confeitaria, bolos e doces","profile":"food","template":"confectionery","aliases":["Confeitaria"]},{"code":"crafts","label":"Artesanato e trabalhos manuais","profile":"crafts","template":"crafts","aliases":["Artesanato e personalizados","Artesanato"]},{"code":"personalized","label":"Personalizados e lembrancinhas","profile":"crafts","template":"crafts","aliases":[]},{"code":"collectibles","label":"Colecionáveis e hobbies","profile":"products","template":"products","aliases":[]},{"code":"fashion","label":"Moda, calçados e acessórios","profile":"products","template":"products","aliases":[]},{"code":"jewelry","label":"Bijuterias e semijoias","profile":"products","template":"products","aliases":[]},{"code":"beauty","label":"Beleza e cuidados pessoais","profile":"products","template":"products","aliases":[]},{"code":"home-gifts","label":"Casa, decoração e presentes","profile":"products","template":"products","aliases":[]},{"code":"stationery","label":"Papelaria e artigos para festas","profile":"products","template":"products","aliases":[]},{"code":"books-records","label":"Livros, revistas e discos","profile":"products","template":"products","aliases":[]},{"code":"secondhand","label":"Brechó e produtos usados","profile":"products","template":"products","aliases":[]},{"code":"pet-accessories","label":"Acessórios para pets","profile":"products","template":"products","aliases":[]},{"code":"plants","label":"Plantas, flores e jardinagem","profile":"products","template":"products","aliases":[]},{"code":"utilities-tech","label":"Utilidades e acessórios de tecnologia","profile":"products","template":"products","aliases":[]},{"code":"products","label":"Outros produtos","profile":"products","template":"products","aliases":["Produtos em geral","Outro"]}]'::jsonb) entry
 where lower(btrim($1)) in (lower(entry->>'code'),lower(entry->>'label'))
 or exists(select 1 from jsonb_array_elements_text(entry->'aliases') alias where lower(btrim($1))=lower(alias))
 limit 1
$$;
revoke all on function private.catalog_business_segment(text) from public,anon,authenticated;

create or replace function private.catalog_profile(template text,segment text default '') returns text
language sql immutable set search_path='' as $$
 select case when template in ('pizzeria','snack-bar','restaurant','confectionery') then 'food'
 when template in ('crafts','products') then template
 else coalesce(private.catalog_business_segment(segment)->>'profile',
 case when lower(segment) ~ '(artesan|personaliz)' then 'crafts'
 when lower(segment) ~ '(pizza|hamburg|lanche|restaurante|marmita|confeita|bolo|doce|alimenta)' then 'food' else 'products' end) end
$$;

-- This trigger is reached through the existing RLS-protected administration update or
-- the manager RPC below. Its writes stay within NEW.barbershop_id.
create function private.sync_catalog_business_segment() returns trigger
language plpgsql security definer set search_path='' as $$
declare chosen jsonb;
begin
 if new.barbershop_id is null then return new; end if;
 if tg_op='UPDATE' and new.segment is not distinct from old.segment then return new; end if;
 chosen:=private.catalog_business_segment(new.segment);
 update public.barbershops set segment=new.segment where id=new.barbershop_id;
 update public.business_settings set segment=new.segment where barbershop_id=new.barbershop_id;
 if chosen is not null then
   update public.online_menus set template_code=chosen->>'template' where barbershop_id=new.barbershop_id and template_code is distinct from chosen->>'template';
 end if;
 if tg_op='UPDATE' then
   insert into public.platform_billing_audit_log(actor_id,action,entity_type,entity_id,details)
   values(auth.uid(),'catalog_segment_changed','barbershop',new.barbershop_id,
     jsonb_build_object('previous_segment',old.segment,'segment',new.segment,'profile_code',chosen->>'profile'));
 end if;
 return new;
end $$;
revoke all on function private.sync_catalog_business_segment() from public,anon,authenticated;
create trigger sync_catalog_business_segment after insert or update of segment on public.saas_clients
for each row execute function private.sync_catalog_business_segment();

create function private.set_catalog_business_segment(target_barbershop_id uuid,target_segment_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare chosen jsonb;
begin
 if auth.uid() is null or not public.is_business_manager(target_barbershop_id)
 or not private.business_has_product_access(target_barbershop_id,'menu') then
   raise exception 'Acesso negado' using errcode='42501';
 end if;
 chosen:=private.catalog_business_segment(target_segment_code);
 if chosen is null or chosen->>'code' is distinct from target_segment_code then
   raise exception 'Atividade inválida' using errcode='22023';
 end if;
 -- UPDATE acquires the same client row lock used by platform-administrator edits.
 update public.saas_clients set segment=target_segment_code
 where barbershop_id=target_barbershop_id and deleted_at is null;
 if not found then raise exception 'Negócio indisponível' using errcode='22023'; end if;
 return jsonb_build_object('segment',target_segment_code,'profile_code',chosen->>'profile');
end $$;
create function public.set_catalog_business_segment(target_barbershop_id uuid,target_segment_code text) returns jsonb
language sql security invoker set search_path='' as $$
 select private.set_catalog_business_segment(target_barbershop_id,target_segment_code)
$$;
revoke all on function public.set_catalog_business_segment(uuid,text),private.set_catalog_business_segment(uuid,text) from public,anon;
grant execute on function public.set_catalog_business_segment(uuid,text),private.set_catalog_business_segment(uuid,text) to authenticated;

-- Return the persisted classification after the established authorization check.
create or replace function private.menu_onboarding_status(target_barbershop_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_business_team(target_barbershop_id)
 or not private.business_has_product_access(target_barbershop_id,'menu') then raise exception 'Acesso negado' using errcode='42501'; end if;
 return private.menu_onboarding_snapshot(target_barbershop_id)||jsonb_build_object('segment',
   (select segment from public.barbershops where id=target_barbershop_id));
end $$;

do $patch$ declare source text; patched text;
begin
 source:=pg_get_functiondef('private.public_menu(text)'::regprocedure);
 patched:=replace(source,'''profile_code'',','''segment'',(select b.segment from public.barbershops b where b.id=tenant),''profile_code'',');
 if source=patched then raise exception 'Public catalog segment anchor missing'; end if;
 execute patched;
end $patch$;
