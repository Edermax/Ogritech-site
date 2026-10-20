# Pagamento mensal fictício aprovado no staging — 20/10/2026 UTC

Escopo autorizado pelo usuário até 01h30 de 20/10 em Brasília: uma assinatura mensal APRO fictícia de R$49,90, comprador/vendedor de teste existentes, webhook, acesso, reenvio e cancelamento. Nenhum cartão real ou configuração de produção foi utilizado.

## Resultado verificado

- Staging: fuesdztsvrkkgnbqhcxi. Handlers ogritech-billing v15, billing-lifecycle v10, menu-sandbox-webhook v2.
- Fixture interna sem usuário Auth: signup e2300000-0000-4000-8000-000000000001. Acesso ao Cardápio era falso antes do pagamento.
- Assinatura 5c4a6b47d3c3469080ddfa36cbcfdffb. Pagamento 185103950250, approved, BRL49,90; fatura 7033110034, processed.
- Collector 3778177682 e payer 3774414383, os dois usuários fictícios já confirmados. API users/me confirmou tag test_user do vendedor.
- O pagamento recorrente reportou live_mode=true mesmo com esses usuários fictícios. Corrigida a detecção exclusivamente para o par de IDs confirmado, exigindo também verificação da credencial como vendedor test_user. Comprador diferente ou vendedor sem tag continua bloqueado; cenários cobertos por teste.
- O simulador oficial do Mercado Pago enviou payment.updated com Data ID185103950250 para a URL de teste. HTTP200. O evento menu_sandbox:123456 foi concluído sem erro (o simulador usa id de evento fixo123456).
- Banco: status active, menu_active=true, access_until=2026-11-20T02:29:23.242642Z e uma única billing_payment_intent para esse pagamento.
- Reenvio administrativo assinado do pagamento: HTTP200 duas vezes; evento menu_sandbox:qa-replay-185103950250 concluído. Mesmo access_until e contagem1, incluindo novo ID de evento e duplicata do mesmo evento.
- Cancelamento pelo handler de gerenciamento: assinatura confirmada cancelled no provedor; banco cancel_at_period_end, mesmo access_until e menu_active=true. A parcela aprovada foi preservada.
- A primeira tentativa revelou que o handler ignorava falha do provedor. Corrigido para exigir confirmação cancelled antes de persistir, verificar falhas de persistência/fila e preservar período pago em reenvios de cancelamento. Não tenta cancelar parcela aprovada de uma assinatura.
- Ferramenta temporária desativada: menu-sandbox-qa v25, JWTtrue, HTTP410 qa_run_closed verificado com autenticação administrativa. Código arquivado também bloqueia novas ações e2e.
- Fixture sem login mantida no staging para auditoria, com recorrência cancelada. Nenhuma nova assinatura é criada pelo script auxiliar de consulta/reenvio/cancelamento.


## Limites

A autorização do cartão ocorreu via API administrativa com cartão público fictício. A entrega assinada foi acionada pelo simulador oficial; entrega automática espontânea ainda não foi observada. Portanto esta evidência aprova a integração mensal do backend, não declara concluída a jornada visual de checkout hospedado do lojista. Pix permanece pendente por rejeição de credencial na API legada. PR18 segue em rascunho e sem merge ou publicação de produção.

Validacao final local: npm run validate aprovado, 233 testes sem falhas, incluindo 27 testes de runtime do billing, checagem estatica e auditoria das 76 migrations.
