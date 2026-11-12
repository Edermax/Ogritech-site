# Pedidos, comprovantes e relatórios

## Regras do produto

- Números visíveis por estabelecimento: `#1`, `#2` etc. Pedidos de teste não consomem números reais; repetição idempotente não cria outro número. Pedidos históricos recebem números por data/id. A referência aleatória e o token dos links de acompanhamento permanecem, impedindo que um número sequencial permita consultar outro pedido.
- Confirmados e recusados podem ter a decisão revista pela gestão, com motivo e histórico de auditoria. Itens, quantidades, cliente e entrega não são editados. A versão consultada deve continuar atual; outra alteração gera conflito, em vez de sobrescrever dados. Rever uma decisão não estorna pagamentos.
- Ao registrar pagamento recebido, o comprovante é opcional: JPEG, PNG ou PDF de até 5 MB. A reserva do arquivo exige gestão do próprio estabelecimento; o upload vai diretamente ao bucket privado por URL assinada. O servidor confere tamanho e assinatura do formato antes de vincular o arquivo e marcar o pagamento. Acesso posterior gera URL de cinco minutos; não existem URLs públicas permanentes.
- Cancelar um upload o invalida antes de excluir o objeto, impedindo uma corrida com a confirmação. Arquivos abandonados são removidos após a expiração do token de upload mais um dia; anexos já vinculados nunca passam por essa limpeza. Tentativas têm lease de 15 minutos e limite de dez falhas, inspecionáveis em `private.menu_order_receipts`.
- Notificações de pedidos mostram número, cliente, telefone, valor e data/hora de envio, com horário de Brasília. Esses dados ficam na sessão autenticada; o armazenamento de leitura guarda somente IDs, separados por estabelecimento/usuário/ambiente.

## Relatórios de vendas

Base escolhida pelo responsável: **somente pagamentos recebidos**, excluindo recusados, cancelados e pedidos de teste. O período considera o registro do recebimento. Pagamentos antigos sem essa data usam a data do pedido e são sinalizados no relatório.

Semanas: segunda-feira até domingo. Meses: meses de calendário. A geração diária às 08:00 de Brasília cria somente os períodos encerrados e recupera execução perdida sem duplicar notificações. As últimas 12 semanas e 12 meses de relatórios ficam na lista; a consulta é reservada à gestão.

Ao abrir, o relatório recalcula os valores para refletir recusas/devoluções posteriores. Inclui quantidade de pedidos pagos, total recebido, produtos/entrega/descontos, dez itens mais comprados e comparação em reais e percentual com o período anterior. Se o valor anterior for zero e houver receita nova, informa ausência de base percentual em vez de inventar 100% ou infinito.

JPEG, PNG e PDF são gerados no próprio navegador, sem enviar os valores a um conversor externo. O PDF contém a versão visual e adapta a altura quando necessário para preservar nomes longos; o conteúdo em HTML permanece disponível no painel. Os arquivos não são enviados por e-mail nem por mensageiro.

## Temas

Claro continua sendo o padrão, com as folhas existentes `panel-controls.css` e `admin-theme.css` preservadas. O tema escuro fica numa folha separada, condicionada à preferência explícita. A escolha está nas configurações da conta e na administração, persiste neste dispositivo e pode voltar a Claro. Cardápios públicos preservam a identidade visual do estabelecimento.

## Infraestrutura e operação

- Novas funções: `menu-order-receipts` (sessão verificada antes do acesso) e `menu-receipt-cleanup` (somente segredo interno).
- Bucket: `menu-payment-receipts`, privado, limitado a 5 MB e aos três MIME types permitidos.
- A limpeza usa o segredo de despacho interno já configurado e a URL do mesmo projeto em Vault para chamar o worker dedicado. Não usa nem divulga credenciais no navegador.
- Cron: `ogritech-menu-sales-reports` diariamente às 11:00 UTC; `ogritech-menu-receipt-cleanup` aos 15 minutos de cada hora. Verificar ambos ativos após publicação.
- Publicar as migrations e as funções antes do frontend. Manter números/histórico e arquivos vinculados em qualquer rollback; não executar migrations destrutivas para remover evidências de pagamentos.
- Testes: `npm run validate`, `supabase test db`; verificar fluxos de navegador e renderizar o PDF exportado com Poppler antes da liberação.
