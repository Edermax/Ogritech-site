# Configuração de produção do Cardápio — 31/10/2026

Conferência de leitura; não representa pagamento real ou autorização comercial.

- Produção contém 79 migrations. Sete funções previstas no pacote estão ativas.
- Fonte publicada de ogritech-billing, billing-lifecycle e mercado-pago-webhook comparada integralmente ao repositório: idêntica, com normalização apenas das quebras de linha.
- Nomes das configurações ALLOWED_ORIGINS, PUBLIC_APP_URL, MERCADO_PAGO_ACCESS_TOKEN, MERCADO_PAGO_WEBHOOK_SECRET, MP_MENU_MONTHLY_ID, MP_MENU_ANNUAL_ID, BILLING_TERMS_VERSION, BILLING_TERMS_SHA256, BILLING_CRON_SECRET e RESEND_API_KEY presentes. Nenhuma chave foi impressa, persistida localmente ou substituída.
- Versão pública 3.1-2026-10-21 e hash do arquivo termos.html conferem com a configuração/metadado do backend. Nenhum aceite histórico foi modificado. Essa sincronização técnica não substitui revisão jurídica.
- Quote mensal HTTP200: 4990 centavos; anual HTTP200: 49900 centavos.
- trial_readiness HTTP200, ready=true, product=menu.
- Webhook de produção sem assinatura retorna HTTP400 antes de contato com o provedor ou gravação de evento. A notificação contém somente readiness-probe, sem pessoa ou pagamento.
- Últimas três execuções de Billing lifecycle em 31/10 concluídas com sucesso. A execução 41236287798 registrou zero Pix criados, zero suspensões, zero cancelamentos finalizados e zero falhas; fila de e-mails com zero processados/enviados.

## Conferência reproduzível

Executar `npm run check:menu-production-preflight`. O relatório em outputs/menu-production-preflight.json separa technicalPrerequisitesReady de livePaymentValidated/financialReleaseApproved. Somente quote, trial_readiness e a rejeição deliberada do webhook são chamados. A rotina não executa cadastro, checkout, lifecycle, dispatch ou pagamento.

Testes locais adicionais confirmam que produção continua na Payments API mesmo com flag de Orders de sandbox habilitada e que webhook Order de sandbox não é processado em produção.

## O que continua necessário

A homologação externa do Pix usou Orders no staging; produção usa Payments. A presença de configuração não valida a credencial, cobrança real ou entrega automática de pagamento real. Esses pontos exigem uma transação legítima e autorizada, com acompanhamento até a liberação de acesso. Nenhuma transação foi iniciada nesta rodada.

A Diniz ainda depende de cadastro, dados empresariais e aceite da proprietária. Seu catálogo permanece fora de produção. O alerta de catálogo continua esperado até haver um cardápio real publicado. Nenhum gate jurídico, fiscal ou operacional foi aprovado por inferência.
