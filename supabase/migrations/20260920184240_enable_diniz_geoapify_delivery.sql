-- A taxa da Diniz é calculada pela rota de ida, arredondada para cima:
-- distância cobrável em km x R$ 1,25. O banco continua sendo a autoridade do preço.
do $$
declare
  target_menu public.online_menus;
begin
  select * into target_menu from public.online_menus where slug = 'diniz-doces-previa-7d1';
  if target_menu.id is null then raise exception 'Cardápio da Diniz não encontrado'; end if;

  update public.online_menus set published = false, published_at = null where id = target_menu.id;
  delete from public.menu_delivery_zones where menu_id = target_menu.id;

  insert into public.menu_delivery_zones(barbershop_id, menu_id, code, name, fee, minimum_order, estimated_minutes, active)
  select target_menu.barbershop_id, target_menu.id,
         format('diniz-auto-%skm', kilometer), format('Entrega calculada · até %s km', kilometer),
         round(kilometer * 1.25, 2), 0, null, true
  from generate_series(1, 50) as kilometer;

  update public.online_menus set published = true, published_at = now() where id = target_menu.id;
end
$$;
