# Dados do cliente no cardápio online — 14/11/2026

O usuário solicitou retirar o e-mail, identificar campos opcionais e incluir nome e telefone no resumo enviado pelo próprio cliente ao estabelecimento. Confirmou que a exigência de somente nome e telefone diz respeito aos dados pessoais: regras de entrega, encomendas e privacidade devem ser preservadas.

O formulário de pedido não solicita e-mail; o contrato da RPC permanece compatível, com `supplied_email` vazio. Observações, agendamento sem antecedência obrigatória e grupos de personalização sem mínimo ficam identificados como opcionais. A seleção direta para WhatsApp solicita nome e telefone antes de liberar o link. Os resumos iniciais e de acompanhamento incluem os dados do cliente.

Uma migration acrescenta `customer_phone` à resposta de acompanhamento, protegida pela mesma referência e pelo mesmo token do pedido. Não amplia permissões de tabela nem altera a criação de pedidos ou dados existentes.

## Validação preparada

- `npm run validate`: 426 testes Node aprovados, estática e classificação das 99 migrations; a nova migration permanece classificada como pendente antes da promoção.
- Navegador com fixtures em memória: Cardápio e Encomendas, celular e desktop, sem e-mail; mensagens conferidas com nome/telefone, inclusive no acompanhamento. Regras condicionais preservadas.
- A suíte SQL de pedidos agora cobre criação sem e-mail, identidade no acompanhamento e rejeição de token incorreto. Deve passar no replay integral do CI antes da promoção.
- Cópia de trabalho: `work/cardapio-tema-claro-20261114`, branch `codex/cardapio-dados-cliente-20261114`, baseada em `bf20b92`.

Produção deve receber somente a migration de resposta de acompanhamento e o frontend deste ajuste. O rollback da função é a definição anterior versionada em `20261112030810_menu_order_receipts_and_sequence.sql`; não requer alteração ou restauração dos pedidos existentes.

## Homologação

Staging recebeu somente `menu_tracking_customer_phone`, versão nativa `20261114173559`. As 33 verificações SQL de pedido passaram com fixtures sintéticas e rollback, incluindo criação sem e-mail e telefone protegido pelo token. Nenhum pedido de cliente foi alterado. O banco legado preserva e-mail ausente como vazio ou nulo; o teste verifica a ausência de valor sem exigir conversão dos registros.

## Promoção do banco

O CI completo passou na revisão `724c484`: estática, replay do banco, suíte SQL e testes de navegador. Execução: https://github.com/Edermax/Ogritech-site/actions/runs/43622126848.

Produção recebeu somente `menu_tracking_customer_phone`, versão nativa `20261114174015`. Staging e produção têm 99 migrations. Verificações de produção confirmaram o telefone na definição da resposta, token obrigatório, wrapper público invoker e ausência de SELECT direto para anon. Zero resíduos da empresa sintética no staging.

Backup diário criptografado disponível e não expirado: execução `43586284880`, artefato `ogritech-production-20261114T104230Z`. A restauração isolada já aprovada no mesmo dia é a execução `43539743553`, referente ao backup `43539297823`. Nenhum backup foi baixado ou restaurado em produção.

O frontend aguarda o CI final dos metadados da promoção e o merge do PR #118.
