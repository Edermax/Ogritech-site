# Evidência — Ogritech Cardápio: carrinho e pedidos

Data: 08/09/2026  
Ambiente: exclusivamente local  
Migração: `20260908204304_menu_cart_orders.sql`

## Entrega

- carrinho público com produtos simples ou configuráveis e escolhas obrigatórias;
- entrega por região, taxa e pedido mínimo configurados pelo estabelecimento;
- retirada, endereço e agendamento opcional;
- preços, promoções, adicionais, frete, limites e total recalculados no backend;
- snapshot financeiro de cada adicional no pedido;
- chave idempotente por pedido, trava transacional e rejeição de reutilização com dados diferentes;
- bloqueio do cardápio público e de novos pedidos quando a assinatura do produto não estiver ativa;
- rate limit, honeypot, consentimento e token público de acompanhamento preservados;
- RLS, grants mínimos e isolamento multiempresa nas novas tabelas;
- pedidos continuam visíveis no painel operacional já existente.

## Verificação

- replay limpo das 53 migrações: aprovado;
- suíte Node: 73 testes aprovados;
- teste transacional específico: 21 asserções aprovadas;
- suíte completa pgTAP: 308 asserções aprovadas;
- política de release: 53 migrações classificadas, com a nova entrega retida localmente;
- `git diff --check`: aprovado, apenas avisos informativos de conversão LF/CRLF.

O cenário funcional confirmou total de R$ 31,00 para produto de R$ 20,00, adicional de R$ 5,00 e entrega de R$ 6,00. Também confirmou ausência de duplicação no reenvio e rollback integral para opção obrigatória ausente, região inválida e chave idempotente conflitante.

## Limites

Cupons, pagamento online do consumidor, importação, automação completa de onboarding, publicação self-service, exportação/cancelamento do produto, WhatsApp e IA não fazem parte desta fase. Nenhum ambiente remoto foi alterado.
