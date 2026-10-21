# Rollback de produção — Ogritech Cardápio

Este runbook prepara a reversão do Cardápio sem autorizar publicação ou alteração remota. A fonte executável é `config/menu-production-rollback.json`; o ensaio local somente lê o histórico Git.

## Ensaio isolado de 21/10/2026

`node scripts/menu-production-rollback-rehearsal.mjs --http` serve os seis arquivos obrigatórios diretamente do commit imutável em um servidor temporário restrito a `127.0.0.1`. O ensaio compara os bytes recebidos por HTTP aos hashes do snapshot e fecha o servidor ao terminar. O CI armazena o relatório junto ao pacote de publicação. Ele não comprova o mecanismo da hospedagem, cabeçalhos remotos, assets completos nem execução de JavaScript no navegador.

A suíte `supabase/tests/database/menu-cart-orders.test.sql` inclui um exercício transacional de fechamento: preserva um pedido fictício, tenta fechar como visitante, fecha como gestor, verifica recusa dos endpoints públicos legado/v2 e mantém o acompanhamento com token válido. Tokens inválidos continuam sem acesso. A transação é revertida e roda no Postgres descartável do CI; não envolve pagamentos ou clientes reais.

## Como fechar entradas

Usar a operação existente `public.set_menu_publication(target_barbershop_id, false)` com sessão autorizada de gestor do negócio afetado. A despublicação retira o catálogo público e bloqueia novas chamadas de criação nos dois endpoints; o acompanhamento usa `public.public_get_menu_order` com referência e token e não depende do estado de publicação. Registrar os negócios afetados no incidente e confirmar cada fechamento. Não apagar pedidos, revogar seus tokens nem desativar negócios ou assinaturas para simular esse fechamento.

Pedidos já em processamento precisam de conciliação; a despublicação não representa cancelamento das transações iniciadas anteriormente. A reabertura é uma decisão posterior ao monitor e às validações, usando a operação normal de publicação e suas verificações de prontidão. Não reabrir por alteração direta de tabela para contornar essas verificações.

## Antes da janela

1. Confirmar qual commit está efetivamente publicado e registrar seu hash de 40 caracteres como alvo de rollback.
2. Comprovar que o alvo contém o site, Cardápio, acompanhamento do pedido e painel.
3. Registrar o identificador do backup fresco e da restauração isolada aprovada.
4. Confirmar quem pode declarar `NO-GO`, fechar entradas, republicar e autorizar restauração.
5. Executar `npm run rehearse:menu-production-rollback` no commit da janela.

Em 19/10/2026, após a integração operacional do PR #17, a API GitHub Pages confirmou `1771d9c5d737682329e775b22d8e4ba171f7075e` como commit servido. Esse hash é o retorno preparado para a próxima janela; o ensaio local confirmou os seis arquivos necessários. Após corrigir as permissões, o backup `39288297613` e sua restauração `39288776485` passaram, com 252 testes de banco e limpeza completa. O contrato identifica o artefato criptografado autorizado. A integração não alterou o código do produto; não houve ensaio de fechamento e retorno remoto nesta rodada.

## Sequência do rollback

1. Declarar `NO-GO`, abrir ou atualizar o incidente e registrar horário, versão e motivo.
2. Fechar imediatamente novas criações de pedidos do Cardápio sem retirar o acompanhamento de pedidos existentes.
3. Republicar o hash anterior imutável pelo mecanismo oficial da hospedagem.
4. Validar HTTPS, cabeçalhos, página pública e acompanhamento de um pedido sintético existente.
5. Se o problema for de schema, aplicar somente correção aditiva compatível com as duas versões do frontend.
6. Restaurar backup apenas diante de perda ou corrupção confirmada, com escopo conhecido e restauração isolada já validada.
7. Observar pelo menos uma janela completa do monitor e registrar a decisão antes de reabrir pedidos.

## Proibições

- Não executar migration `down`, apagar coluna ou marcar migration como aplicada sem executar o SQL.
- Não usar `git reset`, sobrescrever o diretório de trabalho ou implantar referência móvel como `main`.
- Não remover o acompanhamento dos pedidos já aceitos.
- Não restaurar backup para corrigir apenas erro de frontend ou configuração.
- Não reabrir entradas com alerta ativo, isolamento incerto ou divergência de preços.

## Aceite do ensaio em produção

O gate pode ser aprovado somente quando o hash anterior for confirmado como a versão publicada antes da janela, a entrada puder ser fechada independentemente do frontend, a republicação tiver sido exercitada, o acompanhamento existente continuar funcional e o monitor abrir e resolver um incidente controlado. O ensaio deve registrar tempos de detecção, decisão, fechamento, recuperação e estabilização.
