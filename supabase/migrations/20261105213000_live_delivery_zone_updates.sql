-- The validated manager RPC may update live delivery zones without invalidating onboarding.
-- Browser roles lose direct writes, so every live zone change passes through the RPC.
revoke insert,update,delete on public.menu_delivery_zones from authenticated;

create or replace function private.invalidate_menu_onboarding()
returns trigger language plpgsql security definer set search_path=''
as $$
declare tenant_id uuid; menu public.online_menus;
begin
  if TG_OP='UPDATE' and NEW.barbershop_id is distinct from OLD.barbershop_id then
    raise exception 'Não é permitido transferir dados entre empresas' using errcode='42501';
  end if;
  tenant_id:=case when TG_OP='DELETE' then OLD.barbershop_id else NEW.barbershop_id end;
  select * into menu from public.online_menus where barbershop_id=tenant_id for update;
  if menu.published and TG_TABLE_NAME='menu_delivery_zones' then
    if (select auth.uid()) is null or not public.is_business_manager(tenant_id)
       or not private.business_has_product_access(tenant_id,'menu') then
      raise exception 'Acesso negado' using errcode='42501';
    end if;
    if TG_OP='DELETE' then return OLD; else return NEW; end if;
  end if;
  if menu.published then raise exception 'Despublique o cardápio antes de alterar o catálogo' using errcode='23514'; end if;
  update public.online_menus set test_order_id=null,test_order_completed_at=null,
    review_confirmed_at=null,ready_at=null,onboarding_step='catalog' where id=menu.id;
  if TG_OP='DELETE' then return OLD; else return NEW; end if;
end $$;
