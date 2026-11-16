# Diniz Doces — limpeza dos relatórios anteriores aos testes

O usuário solicitou zerar o histórico antes de iniciar os testes e identificou três avisos antigos na aba Vendas. Esses avisos são registros de períodos encerrados, independentes da lista de pedidos.

## Alteração

- A coluna privada `menu_sales_reports.archived_at` permite retirar períodos antigos da lista e da abertura por ID, preservando as verificações existentes de plano, gestão e acesso ao negócio.
- O agendador mantém as chaves únicas dos períodos arquivados; repetir a rotina não os recria. Períodos futuros continuam gerando relatórios.
- O arquivamento é uma operação administrativa. Nenhuma permissão de escrita ou novo endpoint público foi adicionado.
- Foram arquivados somente os três relatórios da empresa com slug `diniz-doces`: semanas iniciadas em 02/11 e 09/11 e mês iniciado em 01/10/2026. Os três relatórios de outros negócios permaneceram intactos.
- A cópia anterior à limpeza foi salva e conferida em `private-exports/diniz-doces-relatorios-antes-limpeza-20261116.json`, fora do repositório e do site público.

## Banco e validação

- Migration local: `20261116131508_archive_menu_sales_reports.sql`.
- Homologação: alias `20261116131740`; produção: alias `20261116132005`. Ambos os ambientes têm 106 migrations; nenhum reparo de histórico foi necessário.
- A cauda de migrations foi reexecutada em transações sobre a base local, seguida dos 32 arquivos pgTAP: 875 verificações aprovadas, com rollback das alterações locais.
- A regressão cobre a lista vazia, bloqueio da abertura de um relatório arquivado, repetição do agendador, isolamento entre empresas e geração de um relatório no período seguinte.
- Em produção, a mesma RPC pública usada pelo painel retornou lista vazia com o papel `authenticated` e contexto do proprietário. Abrir um dos IDs antigos retornou `Report unavailable`.
- Uma execução do agendador para o dia seguinte, em transação revertida, confirmou que os períodos arquivados não reaparecem.
- Após a operação: zero relatórios visíveis e três arquivados na Diniz Doces. O cardápio e os pedidos não foram alterados por esta limpeza.

O schema continua privado, com RLS habilitado e sem acesso direto das roles `anon` e `authenticated` à tabela de relatórios. As funções existentes mantêm os controles de autorização e `search_path` vazio.
