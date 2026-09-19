# Fase 1A — ponto de partida e contrato multiproduto

Concluída em: 08/09/2026.

Estado: **PRONTA PARA AUTORIZAÇÃO DA FASE 1B**.

## Resultado

A Ogritech pode evoluir para multiproduto sem reconstruir a aplicação e sem renomear imediatamente a tabela legada `public.barbershops`. A fundação deve normalizar produtos, planos, módulos, assinaturas e direitos efetivos, preservando Agenda, billing, rotas e cardápio existentes.

O contrato executável está em `config/multiproduct-foundation.json`. Este documento explica as decisões e a sequência segura.

## Base rastreável

- Repositório: `work/Ogritech-site`.
- Branch observada: `main`.
- HEAD no início da fase: `b855c9052f23b470e2d5de37da700ff6cf037a27`.
- Estado: worktree já estava suja, com 64 entradas modificadas ou não rastreadas antes dos artefatos da Fase 1A.
- Regra: nenhuma alteração preexistente será descartada, sobrescrita, redefinida ou apresentada como parte da fundação multiproduto.

Hashes SHA-256 dos principais insumos no início da fase:

| Arquivo | SHA-256 |
|---|---|
| `package.json` | `f54e5995ea04596465eede7533741ab41a9f25cc758c9a19b914bc93659aa2d8` |
| `package-lock.json` | `585b0e40c07c678a5bbe4b4c3edd65d1ee99dea56052cdc7e34420abfc3dd30d` |
| `supabase/config.toml` | `c01f169f0a3f283adb03291f199b957d24d70184fb41b5c692f35ee176395c92` |
| `config/migration-release-policy.json` | `518c1620f8116a89fbacae6ad6e42c074615c6e6ed45087aae01feb5dfef8971` |
| `202608180001_create_core_schema.sql` | `d93df5baa82908775cc4421084f99a38f968c3ae1ecf134f3b4f95321e2365dc` |
| `202608190001_expand_ogritech_platform.sql` | `7c7b673cc51045950fa29b0ffedb116cd92d439d42495ae5b0d86fcc09f62a23` |
| `202608240001_platform_billing.sql` | `befcece3f2b41bd1503e97e0523ba5130cc430f9e88715e7cf08e5ed0cbe5bc3` |
| `20260829142619_add_commercial_solutions.sql` | `d90a362ca2046c597f46427acf30f4aded122ddc3056669f430c8aeae1c3ad7b` |
| `20260829145553_public_commercial_flows.sql` | `afd589619b3ee866db4c8079a06ae3e0505a64c110f55b732e289543b50eba3b` |
| `20260906194944_ogritech_billing_self_service.sql` | `0aa9a3620d679b00efa386b934bfe0646b7901ac6489786db5e3080dc45a7274` |
| `20260906202647_billing_lifecycle_automation.sql` | `f46c2237799b635f924c980d8bb06d818efa568d6c3ab2e44ee820870168e696` |

Os hashes identificam o material analisado, mas não congelam nem reivindicam as modificações preexistentes do usuário.

## Situação encontrada

O modelo atual contém `saas_plans`, `billing_customers` e `platform_subscriptions`, mas pressupõe na prática uma oferta principal por cliente. `saas_clients.plan` ainda é texto e o trigger de sincronização atualiza toda assinatura não cancelada do cliente. Esse comportamento seria inseguro quando Agenda e Cardápio coexistirem.

As quatro soluções oficiais são:

| Código estável | Nome público | Estado inicial |
|---|---|---|
| `agenda` | Ogritech Agenda | prioridade vigente |
| `pages` | Ogritech Páginas | planejada |
| `quotes` | Ogritech Orçamentos | planejada |
| `menu` | Ogritech Cardápio | planejada |

Os códigos são identificadores técnicos imutáveis. Alterações futuras de nome público não devem quebrar assinaturas ou permissões.

## Decisões de arquitetura

### Identidade da empresa

`public.barbershops` continuará sendo a tabela física de tenant na Fase 1B. A aplicação usará o termo “empresa” ou `business`. Renomear a tabela agora ampliaria o risco sobre RLS, funções, FKs, testes e Agenda sem entregar valor funcional.

Uma migração de nomenclatura física poderá ser avaliada separadamente depois da estabilidade multiproduto.

### Produtos e planos

Criar `public.platform_products` como catálogo das quatro soluções. Cada registro terá código estável, nome, descrição, estado comercial e ordem.

Evoluir `public.saas_plans` com `product_id` e `code`. Os planos legados serão associados ao produto Agenda. O campo textual `saas_clients.plan` permanecerá temporariamente como compatibilidade, não como fonte oficial multiproduto.

### Assinaturas

Evoluir `public.platform_subscriptions` com `product_id`. O plano e a assinatura devem pertencer ao mesmo produto. Cada cliente de billing poderá ter no máximo uma assinatura não cancelada por produto.

O cancelamento, suspensão ou inadimplência de um produto não poderá afetar outro. O trigger legado `platform_sync_client_subscription` deverá ficar explicitamente limitado à assinatura Agenda até a contratação ser adaptada ao catálogo multiproduto.

### Módulos

Criar `public.platform_modules` e `public.subscription_modules`. Um módulo pertence a um único produto e só pode ser anexado a uma assinatura do mesmo produto e tenant.

Exemplos futuros: IA e WhatsApp pertencem ao Cardápio; não entram funcionalmente na Fase 1B.

### Entitlements

Criar `public.plan_entitlements` para chaves de capacidade e recursos, com valor estruturado. Exemplos: `agenda.max_professionals`, `menu.enabled`, `menu.max_items`.

Ausência de entitlement significa acesso negado, salvo compatibilidade explícita e testada para clientes Agenda existentes. A avaliação deve ocorrer no servidor; esconder um item de menu no frontend não é autorização.

## Segurança Supabase

- RLS obrigatória em toda tabela nova do schema exposto.
- Grants explícitos para Data API; não depender da exposição automática de novas tabelas.
- Catálogo comercial legível apenas conforme necessidade; mutação restrita a administrador da plataforma.
- Assinaturas e módulos visíveis somente ao administrador Ogritech e aos responsáveis autorizados da própria empresa.
- `UPDATE` com `USING` e `WITH CHECK`.
- Nenhuma autorização baseada em `user_metadata`.
- Funções privilegiadas no schema `private`, com `EXECUTE` revogado de `PUBLIC`, `anon` e `authenticated`, salvo concessão estreita e justificada.
- Wrappers públicos devem ser `SECURITY INVOKER` e expor somente o contrato necessário.
- Executar advisors e testes de isolamento antes de considerar a migration pronta.

O contrato considera as mudanças atuais do Supabase: novas tabelas deixam de ter exposição automática garantida na Data API, Node.js 22 é o baseline adequado e não se deve fixar versão de extensão na migration.

## Sequência da Fase 1B

1. Usar `supabase migration new multiproduct_foundation` para criar o arquivo, sem inventar timestamp.
2. Criar catálogo de produtos e inserir os quatro códigos de forma idempotente.
3. Acrescentar produto e código aos planos, fazer backfill da Agenda e aplicar constraints.
4. Acrescentar produto às assinaturas, fazer backfill pelo plano e proteger coerência plano/produto.
5. Limitar o trigger legado à assinatura Agenda.
6. Criar módulos e vínculos de módulos.
7. Criar entitlements e semear apenas a compatibilidade necessária da Agenda.
8. Criar índices, grants, RLS e helpers privados.
9. Adicionar testes pgTAP de catálogo, coerência, isolamento, dupla assinatura e cancelamento independente.
10. Atualizar testes Node e política de migrations.
11. Fazer replay em banco local novo e rodar toda a validação.
12. Rodar advisors locais.
13. Produzir evidência; não aplicar em staging ou produção sem autorização posterior.

## Critérios de aceite da Fase 1B

- Cliente Agenda existente mantém acesso e limites sem intervenção.
- Empresa pode ter Agenda e Cardápio simultaneamente.
- Empresa sem assinatura do Cardápio não administra o produto protegido.
- Cancelar Cardápio não cancela Agenda, e vice-versa.
- Plano, assinatura e módulo não atravessam produtos.
- Nenhuma leitura ou escrita atravessa tenants.
- As rotas e RPCs públicas existentes continuam compatíveis.
- Testes Node, pgTAP, replay local e advisors passam.
- Nenhum ambiente remoto é modificado.

## Fora da Fase 1B

- evolução funcional do catálogo de alimentos;
- checkout multiproduto completo;
- preços comerciais definitivos;
- Mercado Pago real;
- chatbot;
- WhatsApp;
- publicação;
- renomeação física de `barbershops`;
- mudanças de layout sem relação com acesso por produto.

## Gate

A Fase 1A não autoriza automaticamente a Fase 1B. Para prosseguir, a autorização deve mencionar a fundação multiproduto local e, separadamente, qualquer permissão futura para staging.

