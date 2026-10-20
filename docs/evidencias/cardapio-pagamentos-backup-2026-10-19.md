# Verificação do Mercado Pago e continuidade — 19/10/2026

Complementa e atualiza a [retomada anterior](cardapio-retomada-2026-10-19.md).

**Atualização posterior:** os dois aceites foram recebidos. O backup corrigido e a restauração passaram em 252 asserções, e o PR #17 foi integrado à rotina diária. Ver [resultado final do backup](cardapio-backup-restauracao-corrigida-2026-10-19.md). O estado de ativação do Mercado Pago deve ser consultado em `config/menu-payment-readiness.json`; o formulário está sendo concluído pelo usuário.

## Mercado Pago: configuração confirmada, homologação não concluída

O usuário concluiu a validação de identidade no navegador. A aplicação existente é **Ogritech Assinaturas**, integração **Assinaturas**, número `6084226312562536`.

O painel mostra **ETAPA 1 DE 5**, sem as etapas de teste concluídas. A página de contas informa “Para ver as contas de teste, ative as credenciais de teste”; a página de credenciais apresenta “Ativar credenciais”. Portanto, **as credenciais de teste desta aplicação não estão ativadas e não existe evidência de pagamento homologado nela**. Isso não permite concluir qual é o modo de tokens eventualmente configurados em outros lugares.

Consultas agregadas encontraram zero eventos Mercado Pago em `platform_billing_events`, tanto no staging quanto em produção. Não foram consultados nomes ou dados financeiros de consumidores.

Inventário dos nomes de secrets, sem exportar valores:

- Staging possui as quatro funções de billing, token e webhook; faltam `MP_MENU_MONTHLY_ID` e `MP_MENU_ANNUAL_ID`. Os planos antigos `MP_PLAN_*` não substituem os planos próprios do Cardápio.
- Produção possui os nomes dos planos Cardápio; faltam `BILLING_TERMS_VERSION` e `BILLING_TERMS_SHA256`. A falha pública de catálogo já identificada pode mascarar esse bloqueio posterior de termos.
- A presença de um secret não comprova sua validade, seu modo de teste nem o funcionamento do fluxo.

Foi solicitada confirmação no momento da ação para ativar as credenciais. A regra do navegador exige essa confirmação por criar chaves persistentes. Nenhuma credencial foi ativada, exibida no relatório ou copiada para Supabase nesta rodada. Nenhum pagamento real foi criado. O estado legível por máquina está em `config/menu-payment-readiness.json`.

## Restauração: falha localizada no procedimento, com correção preparada

O [ensaio 39280286345](https://github.com/Edermax/Ogritech-site/actions/runs/39280286345) terminou com **failure**, não está mais na fila. Checksum, descriptografia, inicialização do banco efêmero e restauração de schema/dados passaram. A etapa de validação apresentou 13 falhas entre 231 asserções executadas, com interrupção de uma suíte.

As falhas envolvem grants de anon em tabelas e UPDATE autenticado de publicação. Consultas somente leitura comprovaram que produção não concede esses acessos: anon não lê `menu_orders`/`platform_products`; authenticated não possui UPDATE/DELETE de `online_menus`. A divergência está na cópia restaurada.

O dump e o procedimento anterior preservavam ACLs das funções, mas não reaplicavam as ACLs de tabelas, sequências, colunas e schemas. Os grants locais padrão do Supabase reapareciam na restauração.

### Correção

- Novo exportador somente leitura `scripts/sql/export-relation-acl.sql`.
- Backup passa a incluir `relation-acl.sql` dentro do arquivo criptografado.
- Restauração exige esse arquivo e falha explicitamente em backups antigos que não o contêm.
- SQL gerado primeiro revoga grants padrão e depois reaplica somente as permissões da origem, inclusive grants por coluna.
- O ensaio da branch técnica não cria nem resolve incidentes de produção.

### Validação concluída

- Consulta somente leitura em produção gerou 835 instruções de permissões.
- Ensaio transacional no staging criou objetos sintéticos, exportou os grants, introduziu permissões excessivas, reaplicou a exportação e verificou sete condições: negação de SELECT de tabela para anon, preservação do SELECT da coluna autorizada, proteção da coluna privada, INSERT autenticado preservado, DELETE autenticado negado, USAGE da sequência para service_role preservado e USAGE de anon negado.
- Todas as sete condições passaram; a transação foi revertida.
- 18 testes locais de handlers e automações passaram.
- O candidato remoto seguro de código é `b36141a9a500f045c3a03fb4953bb9740cdd405d`; contém apenas os dois workflows e o exportador, sem dados do backup. Ainda não está ligado à branch nem publicado na principal.

## Bloqueio de execução do novo backup

A revisão automática rejeitou a execução do novo backup por considerar que a transferência de dados sensíveis de produção para um artefato do GitHub, mesmo criptografado, precisava de autorização explícita para conteúdo e destino. A execução bloqueada não foi repetida nem contornada.

Foi solicitado aceite para: ler `public`/`private` de produção, armazenar o backup criptografado no repositório `Edermax/Ogritech-site` como artefato autenticado por sete dias, excluindo dados gerenciados de Auth/Storage, e restaurar somente em banco efêmero. Sem esse aceite não será gerado novo backup.

## Próximas ações dependentes dos aceites

1. Ativar as credenciais de teste da aplicação após confirmação; separar a conta de teste do vendedor e os planos Cardápio antes de simular pagamentos.
2. Executar backup corrigido na branch técnica e restaurar seu artefato com as suítes do Cardápio; não marcar backup/restauração como aprovado antes do resultado.
3. Concluir revisão e publicação coordenada das correções já testadas, mantendo os gates restantes de lançamento.

As jornadas 2 e 3 continuam concluídas por aceite do usuário. Não houve publicação do site, modificação de schema permanente, cobrança ou envio de mensagem nesta rodada.
