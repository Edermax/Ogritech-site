# Ensaio isolado de rollback — 21/10/2026

## Escopo

Validar duas partes do runbook sem interromper produção: servir o frontend anterior de uma referência imutável e exercitar o fechamento das entradas mantendo pedidos já recebidos acessíveis por seu link protegido.

## HTTP local

O comando `node scripts/menu-production-rollback-rehearsal.mjs --http` passou localmente para o commit `1771d9c5d737682329e775b22d8e4ba171f7075e`. Os seis arquivos obrigatórios retornaram HTTP 200 com SHA-256 idêntico aos bytes lidos diretamente dos objetos Git. O servidor ouviu apenas em loopback, foi encerrado ao terminar e não leu dados de clientes.

O CI agora executa o mesmo comando e adiciona `menu-rollback-http.json` ao artefato do pacote de publicação. O relatório deixa explícitos `remoteChangesPerformed=false` e `productionRehearsalRequired=true`.

Isso verifica a entrega HTTP dos arquivos selecionados, sem equivaler a um navegador completo, publicação no GitHub Pages, teste dos cabeçalhos reais ou rollback das funções.

## Fechamento de entradas no banco isolado

A suíte existente `menu-cart-orders.test.sql` passou de 21 para 29 asserções. As oito verificações adicionais usam a fixture fictícia já criada na mesma transação:

1. O acompanhamento funciona antes do fechamento.
2. Visitante não pode despublicar o cardápio.
3. O gestor consegue despublicar pela RPC existente.
4. O catálogo público fica indisponível.
5. O endpoint de pedidos v2 rejeita novas entradas.
6. O endpoint legado também rejeita novas entradas.
7. O acompanhamento existente continua disponível com token válido.
8. Um token inválido continua sem acesso ao pedido.

A transação é revertida. O teste roda no Postgres descartável do CI e não usa Mercado Pago, contas reais, staging ou produção. Nenhuma migration ou permissão de produção foi alterada.

## Validação e limite

272 testes JavaScript aprovados localmente; checagem estática e política de 78 migrations aprovadas. O PR executa o replay e a suíte de banco completa com as novas verificações, além do HTTP isolado. O estado final dos checks deve ser conferido no próprio PR.

O gate de rollback permanece parcial: ainda é necessário exercitar a republicação pelo mecanismo real da hospedagem, confirmar o comportamento com a configuração de produção e observar a recuperação durante uma janela completa do monitor. Os aceites anteriores das jornadas de cliente e pedidos permanecem preservados.
