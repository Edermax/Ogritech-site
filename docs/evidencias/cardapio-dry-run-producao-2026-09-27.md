# Evidência — dry-run das migrations do Cardápio em produção

Data: 27/09/2026  
Projeto: `mvzcoaiiwytycdqcvydf` (`Ogritech`, produção)  
Supabase CLI: `2.116.0`  
Resultado: aprovado, sem alteração remota

## Execução

O histórico foi consultado com `supabase migration list --linked`. O primeiro comando `supabase db push --dry-run --linked` falhou fechado porque existem migrations locais anteriores às duas migrations de callbacks já registradas fora de ordem no remoto.

A simulação correta foi executada com:

```text
supabase db push --dry-run --include-all --linked
```

O CLI confirmou `DRY RUN: migrations will not be pushed to the database`, retornou `dryRun: true` e listou exatamente 27 migrations:

1. `platform_contact_leads`
2. `deny_platform_contact_attempt_reads`
3. `index_remaining_foreign_keys`
4. `remove_legacy_rls_policies`
5. `add_appointment_reassignment_offers`
6. `link_public_bookings_to_client_auth`
7. `enforce_plan_capacity`
8. `fix_plan_capacity_access`
9. `harden_authenticated_booking_actions`
10. `ogritech_billing_self_service`
11. `billing_lifecycle_automation`
12. `multiproduct_foundation`
13. `multiproduct_activation`
14. `menu_catalog_core`
15. `menu_cart_orders`
16. `menu_self_service_onboarding`
17. `commercial_self_service_lifecycle`
18. `menu_assistant_foundation`
19. `menu_ai_staging_controls`
20. `menu_ai_staging_inference`
21. `fix_menu_ai_staging_telemetry_authorization`
22. `allow_menu_ai_service_private_schema`
23. `diniz_sunday_hours_and_sweets_quantity`
24. `menu_private_pilot_metrics`
25. `diniz_automatic_delivery_distance`
26. `restore_diniz_delivery_zones_after_geocode_validation`
27. `enable_diniz_geoapify_delivery`

Não foram listados seeds nem roles. Nenhuma migration foi aplicada. Após a simulação, o vínculo local foi restaurado e confirmado no projeto de staging `fuesdztsvrkkgnbqhcxi`.

## Decisão

O dry-run corresponde integralmente a `config/migration-release-policy.json` e `config/menu-production-migration-batch.json`. Isso elimina a incerteza da fila, mas não autoriza a promoção. Continuam obrigatórios backup fresco, restauração verificada, aceite dos Advisors, responsáveis da janela e decisão explícita de `GO`.
