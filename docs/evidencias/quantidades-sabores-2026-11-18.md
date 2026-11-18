# Quantidades múltiplas e distribuição entre opções

Solicitação de 18/11/2026: implementar mínimo e múltiplos de compra, permitindo distribuir um produto entre sabores ou opções do mesmo preço; melhorar a configuração e a seleção na vitrine.

## Comportamento

- Ativação por produto, com mínimo total, múltiplo de compra e máximo opcional. Produtos anteriores mantêm seu comportamento até o responsável ativar as regras.
- Distribuição opcional entre até 50 opções, todas com o mesmo preço. O múltiplo por opção deve dividir o de compra, garantindo que qualquer total permitido possa ser distribuído.
- Exemplo: mínimo 100, compra e opções de 25 em 25; 25 Chocolate + 25 Chocolate branco + 25 Morango + 25 Banana = 100 unidades. O preço é unitário multiplicado pelo total de unidades.
- Painel com prévia dos totais permitidos, sugestões de múltiplos, lista de opções e importação em lote sem repetir nomes.
- Vitrine com contadores, progresso, distribuição igual, limpeza, busca em listas maiores e validação antes da sacola. A alteração do total preserva as escolhas para o cliente completar ou redistribuir.
- Edição da composição na sacola; cancelar mantém a seleção original. Composições iguais agregam as quantidades reais das opções.
- A composição aparece no painel, na confirmação/WhatsApp e no acompanhamento protegido pelo token do pedido. Observações continuam disponíveis para instruções complementares.

## Persistência e compatibilidade

As regras são um campo permitido de `menu_items.metadata.quantity_rules`. A distribuição é absoluta por linha, separada dos adicionais por unidade e validada no servidor. Os preços são lidos do catálogo. Nenhum acréscimo é aplicado pelos sabores desta lista. Os snapshots usam `menu_order_item_options`, com preço adicional zero e sem multiplicar a porção novamente pelo total comprado.

A migration `catalog_quantity_distribution` valida cadastro, rascunho, checkout, pedido interno de teste e acompanhamento. Não modifica produtos, preços, pedidos ou saldos existentes. Produtos com regras passam a admitir até 10.000 unidades por linha, respeitando seus limites; produtos legados mantêm o limite anterior. O estoque baixa apenas o total comprado, com idempotência e reversão existentes.

Foi corrigida a publicação de alterações para reconciliar os produtos existentes dentro da transação, preservando IDs, saldos e vínculos históricos. IDs de outro estabelecimento não são aceitos como produtos existentes. Remoções de sabores não alteram snapshots antigos. Funções públicas, autenticação, planos e assinaturas permanecem no contrato atual; os validadores novos são internos, sem execução direta por clientes.

## Validação antes da publicação

- 497 testes Node aprovados, incluindo sete cenários do modelo de quantidade.
- Banco local isolado sem rede, em base exclusiva, sem copiar clientes: nove suítes de catálogo/pedidos, 393 asserções aprovadas, incluindo 47 novas. A cópia local não representa o agendador cron; o replay completo é realizado no CI.
- Homologação remota: 47 asserções passaram em transação desfeita; zero estabelecimento fictício remanescente. A fixture usa assinatura fictícia do Completo sem abrir um teste comercial ou desativar os controles de trial.
- Jornadas de navegador incluem temas claro/escuro, 320/390/768/1440 px, regras existentes e novas, sacola, preço, extras, WhatsApp, payload do pedido, acompanhamento, falhas e permissões.
- Revisão visual de celular nos dois temas e da seleção pública. Sem requisições de escrita de teste a produção.

O backup completo de produção para artefatos GitHub foi recusado pela revisão automática por ausência de autorização desse payload/destino. Nenhum dump foi exportado. Foram guardados os fontes anteriormente inspecionados e conferidos com hashes dos corpos das seis funções de produção; a única diferença do checkout era espaço em branco. Isso permite revisar a alteração e preparar reversão de código sem exportar dados de clientes. A reversão após adesão à funcionalidade deve preservar as novas regras e snapshots.

CI, aplicação em produção, hashes do catálogo antes/depois e conferência da versão pública serão registrados no relatório final da publicação. A disponibilidade global não ativa regras automaticamente nos 18 produtos atuais.
