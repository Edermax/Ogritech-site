-- Reversão segura: a fonte gratuita testada devolveu coordenada municipal
-- genérica para o CEP da própria Diniz. Restaura as regras do piloto até
-- existir um provedor de rotas contratado e homologado.
do $$
declare
  target_menu public.online_menus;
begin
  select * into target_menu from public.online_menus where slug = 'diniz-doces-previa-7d1';
  if target_menu.id is null then raise exception 'Cardápio da Diniz não encontrado'; end if;

  update public.online_menus set published = false, published_at = null where id = target_menu.id;
  delete from public.menu_delivery_zones where menu_id = target_menu.id;

  insert into public.menu_delivery_zones(barbershop_id, menu_id, code, name, fee, minimum_order, estimated_minutes, active)
  values
    (target_menu.barbershop_id, target_menu.id, 'ate-1km', 'Produtos da loja · até 1 km', 1.25, 0, null, true),
    (target_menu.barbershop_id, target_menu.id, 'ate-2km', 'Produtos da loja · até 2 km', 2.50, 0, null, true),
    (target_menu.barbershop_id, target_menu.id, 'ate-3km', 'Produtos da loja · até 3 km', 3.75, 0, null, true),
    (target_menu.barbershop_id, target_menu.id, 'bolo-agendado', 'Bolos por encomenda · Ribeirão Preto', 0, 0, null, true);

  update public.online_menus set published = true, published_at = now() where id = target_menu.id;
end
$$;
