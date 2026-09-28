# Evidência — inventário somente leitura da produção do Ogritech Cardápio

Data: 27/09/2026  
Projeto Supabase: `mvzcoaiiwytycdqcvydf` (`Ogritech`, `sa-east-1`)  
Operação: consultas de metadados, Advisors e SQL somente leitura; nenhuma alteração remota executada

## Resultado

- Projeto: `ACTIVE_HEALTHY`.
- PostgreSQL: `17.6.1.155`.
- Histórico remoto: 38 migrations registradas.
- Histórico contíguo: 36 migrations até `move_profile_rls_helpers_private`.
- Aplicadas fora de ordem: `assistant_callback_requests` e `assistant_email_callbacks`.
- Pendentes após reconciliar o histórico: 27 migrations.
- Todas as tabelas do schema `public` estão com RLS habilitada.
- Edge Functions ativas: `platform-users` v9 e `assistant-email-dispatch` v1, ambas com verificação de JWT.

## Compatibilidade PostgreSQL

- `pgcrypto` 1.3: instalada.
- `btree_gist` 1.7: instalada; nenhum índice GiST com `real`, `double precision` ou `float` foi encontrado.
- `ltree`: não instalada.
- Operadores personalizados com estimador de seletividade: nenhum encontrado.

O inventário não encontrou os padrões de uso afetados pelo alerta de atualização menor analisado no replay local.

## Advisors

Segurança:

- `private.platform_email_outbox` e `private.platform_whatsapp_outbox` têm RLS sem policies. São tabelas privadas e precisam de aceite explícito do modelo de acesso antes da janela.
- A proteção contra senhas vazadas está desabilitada e permanece uma decisão operacional pendente.
- `private.platform_legal_identity` e `private.public_booking_attempts` não têm RLS. Como não pertencem ao schema público da Data API, não foi aplicada correção automática; habilitar RLS sem revisar os acessos internos poderia interromper fluxos existentes.

Desempenho:

- Foram apontadas sete foreign keys sem índice; a migration pendente `index_remaining_foreign_keys` trata esse grupo e deve ser confirmada no dry-run.
- Foram apontadas policies com chamadas de autenticação por linha e policies permissivas sobrepostas; as migrations pendentes de otimização e remoção de legado devem ser avaliadas como parte do lote.
- Índices não utilizados foram registrados como informativos e não são bloqueio isolado de lançamento.

## Bloqueio do dry-run

O Supabase CLI local respondeu `Unauthorized` ao consultar os projetos. Sem uma sessão CLI autenticada ou uma conexão de banco fornecida pelo fluxo seguro, não foi possível executar um `db push --dry-run` confiável. Os conectores permitiram verificar o histórico e os Advisors, mas não oferecem a simulação do CLI.

O lote permanece bloqueado. O próximo passo técnico é autenticar o CLI de forma segura, gerar o dry-run das 27 migrations e comparar a saída com `config/migration-release-policy.json`, sem aplicar alterações.
