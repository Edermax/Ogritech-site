# Estoque por produto — implementação local

Pedido do usuário: aplicar apenas ao plano de maior valor e permitir adicionar estoque, consultar quantidade atual e histórico por produto.

Implementação: branch `feat/estoque-completo-20261117`, a partir de `b854c51963cbbb92f4956d90396a3f72aa468b7f`.

## Comportamento

- Completo mensal/anual, teste efetivo de 14 dias e direitos de Completo já pagos usam a mesma autorização central. Essencial não consulta nem movimenta estoque.
- Controle opcional por produto, desativado por padrão. Unidades inteiras e saldo compartilhado por todas as opções do produto. Nenhum saldo é inventado na migração.
- Ativação com saldo inicial; entrada, saída, ajuste por contagem e desativação com motivo. A reativação mantém o saldo anterior.
- Histórico com data/hora do servidor, tipo, motivo, variação e saldo antes/depois. Pedidos indicam seu número, sem dados do consumidor. Paginação de 50 registros.
- Cada novo pedido real baixa as unidades na mesma transação do pedido. Falta de saldo rejeita integralmente o checkout. Confirmar/concluir não baixa novamente. Testes não movimentam estoque.
- Recusar/cancelar devolve apenas unidades anteriormente baixadas, mesmo após desativar controle ou mudar de plano. Reabrir pedido recusado baixa novamente; falta de saldo impede a reabertura.
- Pedidos antigos não recebem baixa retroativa. Orçamentos/seleções enviados pelo WhatsApp exigem movimentação manual.
- A vitrine recebe somente `stock_available`; quantidades e histórico são privados. O botão de compra mostra “Esgotado” quando o saldo não atende ao mínimo do produto. O servidor protege também carrinhos desatualizados.
- Excluir um produto preserva seu histórico; o botão geral permite consultá-lo. Excluir a empresa remove também o estoque, respeitando o ciclo de dados existente.
- A troca de plano conserva os registros e bloqueia o uso sem direito efetivo ao Completo. Alterações no catálogo e nos rascunhos não reescrevem saldos.
- Preços, recorrências, provedor de pagamento, termos, fotos e ordem do carrossel permanecem preservados. A divulgação acrescenta o recurso somente no Completo.

## Implementação e proteção

Migration aditiva `20261117222921_catalog_product_inventory.sql`, criada pelo CLI 2.116.0. Três tabelas privadas com RLS e sem acesso direto por clientes. Interfaces públicas SECURITY INVOKER, funções internas com autorização explícita, tenant validado e `search_path` vazio. Entrada numérica e textual validada novamente no PostgreSQL; não existe novo servidor JavaScript que exija um parser Zod.

Chaves idempotentes impedem repetição de movimentos manuais; reutilização com payload diferente é rejeitada. Bloqueios transacionais serializam produto/saldo. A versão esperada impede um ajuste absoluto de sobrescrever uma movimentação concorrente. O fluxo de pedidos mantém a idempotência existente. Correções são novos movimentos; não há API para editar/excluir movimentos.

Nenhum reset do banco da aplicação. Replay feito somente no container sem rede `ogritech-catalog-validation-20261117`. Concorrência exercitada em um banco temporário, com schema e apenas três tabelas de referência; o banco temporário foi removido ao final.

## Validação

- Replay limpo das 112 migrations e 36 arquivos pgTAP: 1.066 asserções aprovadas, incluindo 66 no arquivo de estoque.
- Corridas em sessões PostgreSQL separadas: última unidade vendida uma vez, checkout sem saldo sem pedido órfão, repetição simultânea sem entrada duplicada e ajuste desatualizado rejeitado.
- Navegador Edge, 390 e 1.440 px: saldo inicial, entrada, recuperação de resposta perdida, saldo concorrente, Essencial bloqueado, acesso durante teste do Completo e produto público esgotado. Sem erros JavaScript. Capturas em `outputs/catalog-review/stock-browser/`.
- 490 testes Node aprovados. Novos testes de navegador e concorrência incluídos no CI existente.

Estado: implementação e validação locais. A migration permanece retida em staging/produção na política de release; nenhum saldo ou pedido real foi alterado. Publicação deste recurso não foi realizada nesta etapa.

Documentação técnica consultada: [funções e permissões no Supabase](https://supabase.com/docs/guides/database/functions), [changelog do Supabase](https://supabase.com/changelog.md). CLI 2.x preservado, sem introduzir a mudança de semântica da versão 3.
