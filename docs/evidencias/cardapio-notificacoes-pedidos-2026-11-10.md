# Notificações opcionais de pedidos — 10/11/2026

Implementação revisada no PR [90](https://github.com/Edermax/Ogritech-site/pull/90). O commit funcional `99f1e5e12c54426ec144553fc5736db865e39d77` passou na [CI completa](https://github.com/Edermax/Ogritech-site/actions/runs/42927189459): validação estática, 353 testes Node, replay limpo de 91 migrations e todos os testes de banco.

A jornada real de criação/publicação do catálogo no Edge foi executada com backend isolado em 390×844 e 1440×1000. Confirmou ativação explícita na criação, estado sincronizado dos controles e desativação na operação, sem erros JavaScript ou estouro horizontal. Os testes da camada de sistema operacional usam substitutos controlados; nenhuma notificação foi enviada a um cliente real.

As migrations foram aplicadas separadamente com o recurso inicialmente desligado:

| Migration | Homologação | Produção |
| --- | --- | --- |
| menu_order_push_notifications | 20261110234528 | 20261110235748 |
| menu_order_push_transport | 20261110235244 | 20261110235754 |

As duas Edge Functions estão ativas, versão 1, nos dois ambientes. Os hashes dos bundles são iguais entre ambientes: inscrição `c5d7a578891a1d8ad4bca662a1347eaee3d4f08b567c10172c47fee0ddb8ae03`, dispatcher `9590f213b9680fa170596d07de1778a549cc1173bb4386dc1d175c9f1f2fff53`. A autenticação ocorre dentro dos handlers. A função de inscrição usa JWT verificado e RPC no contexto do usuário; o dispatcher exige segredo próprio.

As chaves VAPID são distintas por ambiente. Os secrets estão no Supabase e a URL/segredo de disparo no Vault. O cron `menu-order-push-dispatch` está ativo a cada minuto. O dispatcher autenticado respondeu HTTP 200 com `claimed=0, acknowledged=0` nos dois ambientes depois da ativação. Em produção, inscrição sem sessão retornou 401 e dispatcher sem segredo retornou 403. As tabelas privadas não concedem leitura a `anon` ou `authenticated`. O inventário foi observado com zero inscrições reais; ninguém foi inscrito automaticamente.

Os testes pgTAP também foram executados em homologação, em uma transação desfeita, sem chamar serviços externos. Cobrem isolamento entre empresas/contas, endereços permitidos, limite de dispositivos, idempotência, exclusão de pedidos de teste, leases concorrentes, retentativas, endpoints expirados e cancelamento. As fixtures são sintéticas.

O advisor de segurança permaneceu sem novos avisos de nível WARN ou ERROR. As duas novas tabelas privadas geram apenas a informação de RLS sem policy, deliberada: o acesso direto é revogado e ocorre por funções autorizadas. A [proteção contra senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) já estava desativada antes e permanece fora desta alteração. Sobre tabelas privadas: [RLS sem policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

A entrega visual em um aparelho real depende da inscrição voluntária nesse aparelho e não foi declarada validada por estes testes. Restrições do sistema, navegador e conectividade podem atrasar ou impedir avisos; os pedidos permanecem no painel. Instruções de configuração e suspensão em [CARDAPIO_NOTIFICACOES_PEDIDOS.md](../CARDAPIO_NOTIFICACOES_PEDIDOS.md). Os bloqueios jurídicos e comerciais anteriores não foram alterados.
