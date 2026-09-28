# Evidência — backup e restauração pré-lançamento do Cardápio

Data: 27/09/2026  
Produção: `mvzcoaiiwytycdqcvydf`  
Commit remoto usado no ensaio corrigido: `7ad6a37b19192c891ff8d7983aa65c6a38cf4211`  
Branch técnica: `codex/backup-acl-restore-20260927`

## Backup aprovado

- Execução: `36355277009`.
- Artefato criptografado: `ogritech-production-20260927T222841Z`.
- Artefato ID: `10944190865`.
- Conteúdo: roles, schema, dados de `public`/`private` e ACLs das funções.
- Proteção: AES-256-CBC, PBKDF2 com 600.000 iterações e checksum SHA-256.
- Dados gerenciados de `auth` e `storage` permaneceram excluídos.

## Falha encontrada e corrigida

O primeiro backup fresco, execução `36354667514`, foi criado corretamente. A primeira restauração, execução `36354843453`, restaurou schema e dados, mas falhou no teste `anon nao altera status`: o dump do schema não preservava integralmente as ACLs das funções e o PostgreSQL concede `EXECUTE` a `PUBLIC` por padrão.

Uma consulta somente leitura confirmou que a produção estava correta: `anon` não possui execução de `public.transition_appointment_status`, enquanto `authenticated` possui. A falha pertencia ao procedimento de backup/restauração.

O workflow foi corrigido para:

- exportar as ACLs efetivas das funções em `public` e `private`;
- revogar primeiro os grants implícitos no banco restaurado;
- reaplicar somente os grants registrados no banco de origem;
- diferenciar o baseline pré-lançamento do ensaio pós-promoção do Cardápio.

## Restauração aprovada

- Execução corrigida: `36355448914`.
- Checksum, descriptografia e arquivos obrigatórios: aprovados.
- Banco Supabase efêmero: iniciado e removido ao final.
- Restauração transacional de schema, dados e ACLs: aprovada.
- Tabelas públicas com RLS desabilitada: zero.
- RPC crítica da Agenda: presente.
- Suítes pgTAP do baseline: 3 de 3 aprovadas.
- Asserções pgTAP: 72 aprovadas, zero falha.
- Arquivos descriptografados: removidos.
- Produção: nenhuma escrita realizada.

## Limite da evidência

Este é o ponto de retorno anterior à promoção das 27 migrations. Como o schema do Cardápio ainda não existe em produção, o ensaio foi executado com `expect_menu_schema=false`. Depois da promoção, deve ser criado outro backup e executada nova restauração com `expect_menu_schema=true`, cobrindo tabelas do Cardápio, RLS, criação de pedidos, idempotência e ciclo comercial antes do `GO` final.

As mudanças dos workflows permanecem em branch técnica e ainda precisam de revisão e merge antes de substituir a automação de `main`.
