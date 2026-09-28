# Homologação do self-service do Cardápio em staging

Data: 28/09/2026
Projeto: `fuesdztsvrkkgnbqhcxi` (staging)
Commit base: `bc9b91f`

## Promoção

- Dry-run remoto listou somente as três migrations novas.
- As três migrations foram aplicadas em ordem.
- Histórico remoto final: 68 migrations.
- Produção não foi alterada.

## Jornada sintética

- Quatro segmentos, em desktop e celular: 8/8 cenários aprovados.
- Nove pedidos sintéticos foram registrados e recebidos; um veio de uma execução diagnóstica anterior à bateria final.
- Nove chaves de requisição distintas; nenhuma duplicação por reenvio.
- Divergências de preço: zero.
- Erros JavaScript na bateria aprovada: zero.
- IA externa permaneceu desligada, com kill switch ativo e limites zerados.
- Todas as tabelas do Cardápio permaneceram com RLS.
- `anon` não possui acesso direto a `menu_orders`.

## Limpeza

A limpeza foi executada após a verificação. Resultado final: zero empresas, clientes, cardápios, pedidos, eventos do assistente e eventos de IA pertencentes à massa sintética.
