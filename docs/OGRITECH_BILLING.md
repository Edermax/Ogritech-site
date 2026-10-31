# Cardápio Ogritech — cadastro e pagamento

## Situação conferida em 31/10/2026

O cadastro está disponível em https://ogritech.com.br/criar-cardapio/ e começa com 14 dias gratuitos, sem cartão. Mensal R$49,90 ou anual R$499. Os parâmetros públicos de versão/hash dos termos estão sincronizados com o backend; isso não substitui os aceites do cliente ou a revisão jurídica pendente.

As funções financeiras estão publicadas e as configurações necessárias estão presentes. O preflight seguro passou para preços, cadastro e rejeição de webhook sem assinatura. A rotina agendada executou sem falhas, com fila vazia. Veja a evidência de configuração em [31/10](evidencias/cardapio-preflight-producao-2026-10-31.md).

Ainda não foi comprovada uma cobrança real completa em produção. A homologação de Pix, webhook, acesso e idempotência documentada em [20/10](evidencias/cardapio-checkout-pix-recuperacao-2026-10-20.md) ocorreu com dados fictícios no staging. O Pix fictício usou Orders; produção usa Payments. Não declarar uma trilha real validada a partir desse teste.

## Jornada implementada

1. Cliente informa dados empresariais, e-mail e telefone, registra preferência de nota e realiza os aceites no cadastro oficial.
2. Recebe convite, define a própria senha e acessa o painel como proprietário.
3. Cria o cardápio e escolhe no painel como continuar após o teste.
4. Cartão recorrente depende de autorização expressa no checkout do Mercado Pago. Pix é por período; não é Pix Automático nem débito recorrente.
5. A rotina gera o Pix perto do vencimento e enfileira o aviso financeiro. O webhook deve confirmar o pagamento antes de ampliar o acesso.
6. Reenvios são tratados de forma idempotente. Cancelamento e encerramento respeitam o período de acesso e os estados da assinatura.

O pedido do consumidor à loja é separado: enviar o pedido não cria cobrança automática. O pagamento é combinado diretamente com o estabelecimento.

## Conferir sem criar transações

Executar `npm run check:menu-production-preflight`.

O script chama apenas quote mensal/anual, trial_readiness e uma notificação deliberadamente sem assinatura. Salva relatório em outputs/menu-production-preflight.json; não precisa de chave administrativa. Não informa prontidão financeira real: livePaymentValidated e financialReleaseApproved permanecem falsos.

A lista de nomes do cofre e os estados das funções podem ser consultados pelo administrador, sem imprimir valores. Os nomes atuais relevantes são MERCADO_PAGO_ACCESS_TOKEN, MERCADO_PAGO_WEBHOOK_SECRET, MP_MENU_MONTHLY_ID, MP_MENU_ANNUAL_ID, BILLING_TERMS_VERSION, BILLING_TERMS_SHA256, BILLING_CRON_SECRET, ALLOWED_ORIGINS, PUBLIC_APP_URL e RESEND_API_KEY.

Não executar billing-lifecycle nem billing-email-dispatch como teste de leitura: essas funções podem criar cobranças, enviar mensagens ou suspender acesso. Consultar o resultado das execuções agendadas existentes.

## Ambientes e publicação

Produção: mvzcoaiiwytycdqcvydf. Homologação: fuesdztsvrkkgnbqhcxi. Os recursos de sandbox não podem ser promovidos nem apontados para produção.

O publicador antigo scripts/deploy-ogritech-billing.ps1 é uma ferramenta de staging com requisitos legados; não é o preflight de leitura de produção. Não remover seu bloqueio de produção nem usar reparo de histórico para ocultar divergências.

Antes de qualquer alteração financeira, preservar a evidência, validar em CI e revisar a publicação explícita das funções. Alterar termos exige nova versão e preservação dos aceites anteriores. Não criar ou trocar credenciais, planos, cobrança real ou webhook sem a autorização correspondente.

## Pendência da primeira ativação

A proprietária precisa concluir o cadastro e os aceites. Depois o catálogo aprovado pode ser transferido e revisado, preservando produtos sob consulta. O primeiro pagamento real deve ser legítimo e autorizado; conferir confirmação do provedor, webhook, acesso e idempotência antes de registrar a operação financeira como validada.

A revisão fiscal/jurídica e os canais de suporte continuam pendentes conforme o contrato de lançamento. Nenhuma aprovação foi inferida a partir de HTTP200 ou de nomes de secrets presentes.
