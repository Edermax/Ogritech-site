-- Diniz Doces: domingo com horário reduzido e doces vendidos por unidade,
-- com pedido mínimo de 50 e acréscimos inteiros de uma unidade.

update public.online_menus
set published = false,
    published_at = null
where slug = 'diniz-doces-previa-7d1';

update public.online_menus
set weekly_hours = jsonb_set(
  weekly_hours,
  '{special_hours}',
  '[{"weekdays":[0],"opens_at":"09:00","closes_at":"13:00"}]'::jsonb,
  true
)
where slug = 'diniz-doces-previa-7d1';

update public.menu_items
set minimum_quantity = 50,
    maximum_quantity = null,
    unit_label = 'unidade'
where id in (
  '7d100000-0000-4000-8000-000000000028',
  '7d100000-0000-4000-8000-000000000029'
);

update public.menu_item_prices
set price = price / 100,
    promotional_price = case when promotional_price is null then null else promotional_price / 100 end,
    label = case
      when id = '7d100000-0000-4000-8000-000000000121' then 'Doces tradicionais · por unidade'
      else regexp_replace(label, '\s*·\s*cento$', ' · por unidade', 'i')
    end
where menu_item_id in (
  '7d100000-0000-4000-8000-000000000028',
  '7d100000-0000-4000-8000-000000000029'
) and price >= 50;

update public.online_menus
set published = true,
    published_at = now()
where slug = 'diniz-doces-previa-7d1';
