# Mercado Pago — homologação parcial em 19/10/2026

## Preparação do webhook: banco do staging atualizado

Após dry-run confirmar exatamente duas migrations pendentes, foram aplicadas somente em `fuesdztsvrkkgnbqhcxi`: `20261003025228_billing_rejected_email_event` e `20261019154554_menu_billing_lifecycle_reliability`. CLI com project ref explícito e skip-vault; nenhuma seed, role adicional ou alteração de produção. Staging passou de 74 para 76 migrations; produção permanece em 55.

A suíte `menu-billing-lifecycle.test.sql` foi executada pelo `supabase db query --linked --file` após a implantação: finish retornou `1..26` sem diagnóstico de falha, 26 asserções. O runner `supabase test db` depende de Docker indisponível neste computador; a alternativa Management API executou o mesmo SQL com rollback. Consulta posterior confirmou zero empresas, signups e clientes das fixtures.

O usuário autorizou voltar à conta principal, configurar o destino de teste `https://fuesdztsvrkkgnbqhcxi.supabase.co/functions/v1/menu-sandbox-webhook` e guardar a chave exclusivamente em `MP_MENU_SANDBOX_WEBHOOK_SECRET`. A aba única está na verificação de login da conta principal; nenhum webhook foi cadastrado nem chave copiada nesta fase. Aguarda conclusão do login pelo usuário. O ensaio de captura com duração aproximada de uma hora ainda não começou; todas as assinaturas dos ensaios anteriores estão canceladas.

## Cenários de cartão executados às 22h07

O usuário autorizou expressamente cartões públicos fictícios APRO/OTHE, valor simulado de R$ 49,90, comprador/vendedor existentes e janela até 22h30. A ferramenta temporária versão 17 manteve JWT, chave administrativa em cabeçalho HTTPS (somente em memória), project ref fixo, expiração e verificação do vendedor com tag test_user. Nenhuma nova conta ou cartão real foi utilizado.

- **APRO:** criação HTTP 201, assinatura `7e2fba8e53274182a5f0d6a383a6b240`, status `authorized`. Consulta de faturas HTTP 200, lista vazia no momento da consulta. Assinatura cancelada e cancelamento confirmado por releitura.
- **OTHE:** criação recusada com HTTP 400, `CC_VAL_433 Credit card validation has failed`. Nenhuma assinatura criada nesse cenário.
- **Limite da evidência:** autorização do cartão/assinatura foi comprovada, mas nenhum pagamento capturado/aprovado ou fatura foi observado. OTHE comprova recusa na validação do cartão, não uma fatura rejeitada. Não declarar o fluxo financeiro completo homologado.
- **Encerramento:** ferramenta substituída imediatamente pela versão 18 (HTTP 410, JWT habilitado). Os handlers principais e produção permanecem sem publicação.

Continuidade: configurar a chave de assinatura exclusiva do aplicativo de teste, receber um webhook assinado e conferir a atualização de acesso com um pagamento efetivamente aprovado. O teste de autorização de assinatura não deve liberar acesso pago sozinho.

A [documentação oficial de assinaturas autorizadas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/authorized-payments) informa que a primeira parcela pode ser cobrada aproximadamente uma hora após a assinatura. O cancelamento imediato exigido no ensaio impede usar este resultado como evidência de captura posterior. Um ensaio de primeira cobrança precisa de janela suficiente, webhook configurado e cancelamento após a observação do evento, com autorização para esse período; não deixar assinatura de teste ativa além da janela aprovada até 22h30.

## Continuação: webhook e pagamentos com cartão preparados

O candidato local agora separa `MP_MENU_SANDBOX_ACCESS_TOKEN` e `MP_MENU_SANDBOX_WEBHOOK_SECRET` pelo endpoint `menu-sandbox-webhook`, restrito ao staging. Escolha de pagamento, cancelamento e lifecycle do Cardápio selecionam a credencial dedicada no staging; Agenda mantém sua credencial anterior. O secret de assinatura dedicado ainda não foi configurado e as funções principais não foram publicadas. Nenhuma destas proteções foi declarada homologada no provedor.

O webhook valida o ID assinado em minúsculas, rejeita divergência entre query e body, assinatura expirada, recursos de outro vendedor, recursos live e signups da Agenda no endpoint de sandbox. Tópicos de plano são ignorados em vez de tratados como assinatura. Uma fatura processada exige consulta ao pagamento efetivo; somente status approved pode conceder período. Os testes executam o handler real com banco/provedor substituídos e cobrem duplicação, aprovação, recusa e isolamento de credenciais.

23 testes de runtime passaram nesta continuação. Foram preparados os cenários APRO/OTHE exclusivamente com cartão público fictício, comprador existente e cancelamento das assinaturas ao final. A revisão automática bloqueou a publicação por exigir autorização específica para cartão/cobrança simulada (diferente do teste anterior sem cartão). Nenhum cenário de cartão foi executado nessa etapa; a função remota continua encerrada na versão 16. A primeira janela das 21h30 expirou; foi solicitado aceite para nova janela até 22h30. Não criar contas adicionais nem usar cartões reais.

## Resultado mais recente: criação e cancelamento aprovados

Às 21h06 de 19/10 (horário de São Paulo), após autorização específica do usuário para o teste temporário e o cabeçalho HTTPS administrativo, a versão 15 da ferramenta executou as duas sondagens com sucesso. A chave administrativa existente foi mantida somente em memória pelo CLI, sem impressão nem gravação; JWT, trava de project ref e expiração permaneceram habilitados. O e-mail do comprador existente foi confirmado no perfil após a troca de sessão autorizada; nenhuma nova conta foi criada.

| Ciclo | Assinatura fictícia | Valor | Criação | Consulta | Cancelamento conferido |
| --- | --- | --- | --- | --- | --- |
| Mensal | f22b3ca899ca46b68d9636359e364280 | R$ 49,90 | pending | HTTP 200 | Sim |
| Anual | 50c5fd5db74e46f68e5b4f8bbac3ff03 | R$ 499,00 | pending | HTTP 200 | Sim |

Ambas retornaram checkout hospedado e vendedor `3778177682`, moeda BRL, com início da recorrência preservando os 14 dias a partir da sondagem (02/11). Nenhum cartão foi fornecido e nenhuma cobrança foi autorizada. O problema anterior de criação foi superado usando o e-mail confirmado do comprador, com o contrato sem plano associado e status pending.

A ferramenta foi imediatamente substituída pela versão 16, encerrada com HTTP 410. O notification_url foi omitido nas sondagens, portanto esses resultados não homologam webhook, pagamento aprovado/recusado nem alteração de acesso. Os handlers principais de staging/produção ainda não foram substituídos. As rejeições da revisão automática anteriores foram resolvidas com autorização específica e a versão segura; não constituem bloqueio destes dois testes concluídos.

## Continuação: contrato de checkout corrigido no código

`ogritech-billing` agora prepara a escolha de cartão do Cardápio pelo modelo documentado de assinatura sem plano associado e `status: pending`. Recorrência e preço são calculados no servidor (R$ 49,90/mês ou R$ 499/ano); `start_date` preserva o fim do acesso atual/trial. Não envia cartão nem reinicia os 14 dias na troca de meio de pagamento. Agenda não foi alterada. Os planos de teste anteriores permanecem na conta, mas esse checkout não depende deles.

Um teste do handler real cobre ambos os ciclos, a ausência de plano/card token e a gravação do ID de assinatura. A sondagem isolada reutilizou a função de construção de payload do código real, com notification_url omitida para não encaminhar testes ao webhook compartilhado: email fictício do exemplo oficial retornou 400 `Both payer and collector must be real or test users`; comprador gerado pela API retornou 400 `User bad request`. Não houve criação de assinatura nem cancelamento. Não houve novo teste de aprovação/recusa. É necessário conferir uma conta de comprador de teste no painel; a aba solicitou nova validação de identidade ao abrir.

A ferramenta temporária foi novamente encerrada, agora na versão 10 (HTTP 410, JWT habilitado). Correção do checkout permanece local; handlers de staging/produção não foram substituídos, e seleção consistente do token sandbox e assinatura do webhook continuam pendentes. Esta seção atualiza o diagnóstico anterior de card_token_id, sem apagar os erros históricos.

Verificação local após a correção: 218 testes aprovados, incluindo 12 testes de runtime de billing; static-checks aprovado (16 scripts, nove páginas, 76 migrations); classificação das 76 migrations aprovada. Isso não substitui a homologação financeira no provedor.

## Concluído

Rodada autorizada das duas assinaturas: login no comprador existente concluído na mesma aba; e-mail fictício confirmado pelo perfil. Publicação temporária versão 13 com autenticação administrativa exata, expiração às 21h30 e JWT habilitado foi autorizada pelo usuário. As chamadas mensal/anual retornaram HTTP 401 da própria proteção, antes de qualquer chamada ao Mercado Pago. Valores de chaves foram consultados somente em memória pelo CLI e não foram impressos nem gravados. A revisão automática recusou diagnósticos adicionais na resposta pública e, depois, a mudança para header administrativo específico por considerá-la uma alteração de segurança sem autorização específica. Essas duas versões não foram publicadas. A ferramenta foi encerrada novamente na versão 14 (410); nenhuma assinatura foi criada nesta rodada. Homologação continua pendente.

Retomada seguinte: a referência oficial atual de criação de usuário de teste documenta `/users/test` com `site_id` e `description`; sondagens anteriores utilizaram `/users/test_user`. Não atribuir os erros anteriores a uma conta inválida sem validar o fluxo correto. A revisão automática recusou publicar uma sondagem que criaria outra conta; ela não foi executada. A alternativa escolhida continua sendo reutilizar o comprador existente. Ao retomar, não havia abas preservadas; uma única aba foi aberta no endereço de contas e o Mercado Pago exigiu novamente a validação de identidade. Nenhum pagamento, assinatura ou nova conta foi criado nessa retomada. A função QA continua encerrada na versão 12.

Consulta posterior no painel: autenticação concluída e conta brasileira `Buyer Test User`, User ID `3774414383`, marcada explicitamente como Comprador (tipo imutável), confirmada. GET `/users/3774414383` com token do vendedor retornou HTTP 200, mas não forneceu email utilizável; nenhum teste de assinatura foi enviado nessa consulta. Não é necessário criar nova conta. Ferramenta temporária novamente encerrada na versão 12, respondendo 410. O próximo teste depende de identificar o email/fluxo de login dessa conta de comprador sem exportar suas credenciais.

O usuário autorizou configurar o token exclusivamente em `fuesdztsvrkkgnbqhcxi` e executar testes fictícios. Ele salvou diretamente `MP_MENU_SANDBOX_ACCESS_TOKEN` no cofre do staging. Nenhum token privado foi armazenado em arquivo ou repositório. O segredo compartilhado `MERCADO_PAGO_ACCESS_TOKEN` permaneceu intacto.

Uma função temporária, com verificação JWT, autorização adicional, prazo de expiração e trava no project ref, consultou `/users/me`. HTTP 200: vendedor `3778177682`, site `MLB`, tag `test_user`. Essa verificação identifica o ambiente pela conta; o prefixo APP_USR sozinho não determina se uma credencial é real.

Foram criados e relidos os planos fictícios abaixo. Valores, moeda BRL, vendedor, frequência e trial foram conferidos no provedor. Os IDs foram salvos nos secrets `MP_MENU_MONTHLY_ID` e `MP_MENU_ANNUAL_ID` do staging.

| Ciclo | ID | Valor | Trial |
| --- | --- | --- | --- |
| Mensal | ea025130c9a94d5fbf8e5ed570d34090 | R$ 49,90 | 14 dias |
| Anual | bf1b34c7c2ed443885c6ede55ca52de5 | R$ 499,00 | 14 dias |

A busca de planos inicialmente retornou 429; a tentativa posterior concluiu com sucesso, sem criar duplicatas. Compradores de teste foram gerados para as sondagens; suas credenciais não foram exportadas nem persistidas localmente.

## Bloqueios reproduzidos no provedor

1. Cartão público fictício APRO tokenizado; POST `/v1/payments` retornou **401, Unauthorized use of live credentials**. O vendedor é comprovadamente de teste. Isso registra uma incompatibilidade do caminho consultado com essa credencial, sem concluir que o token é de uma conta real. O cenário OTHE não foi executado após a falha APRO.
2. POST `/preapproval` com plano, comprador fictício e status pending retornou **400, card_token_id is required**. O fluxo atual de `ogritech-billing` também envia plano sem card_token_id. O contrato de checkout precisa ser revisto; não declarar esse caminho homologado.
3. Sondagem alternativa sem plano, com recorrência explícita e status pending retornou **400, User bad request**. Nenhuma assinatura foi criada e, portanto, não houve cancelamento a verificar.

Nenhum pagamento aprovado/recusado, evento real de webhook, renovação ou sincronização de acesso foi comprovado. Não houve cobrança real nem alteração de schema ou funções de produção. O secret exclusivo ainda não é consumido pelos handlers de billing: eles continuam lendo o token compartilhado, que não foi substituído. Não executar esses handlers com os novos planos antes de configurar a seleção consistente de credencial para Cardápio.

## Encerramento da ferramenta temporária

`menu-sandbox-qa` foi substituída pela versão 7, sem acesso a secrets nem chamadas ao provedor, respondendo HTTP 410 `qa_run_closed`. A verificação JWT permanece habilitada. Não ficou uma API de criação de planos ou pagamentos disponível.

## Continuidade

Corrigir e validar o contrato de assinatura com plano (tokenização de cartão ou checkout hospedado adequado), esclarecer a rejeição da Payments API para a conta de teste e integrar token/plano/webhook exclusivos no staging. Depois executar aprovação, recusa, duplicação, renovação e alteração de acesso pelo fluxo completo. O lançamento continua bloqueado até essas evidências.

Fontes: [assinaturas](https://www.mercadopago.com.br/developers/en/reference/online-payments/subscriptions/create-preapproval/post), [planos](https://www.mercadopago.com.br/developers/en/reference/online-payments/subscriptions/create-preapproval-plan/post), [cartões fictícios](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/integration-test/test-cards).

### Webhook de teste configurado no painel
A sessao correta foi confirmada no Edge: Ogritech Assinaturas, aplicacao 6084226312562536, usuario 3569765914. No Modo de teste, foi salva a URL https://fuesdztsvrkkgnbqhcxi.supabase.co/functions/v1/menu-sandbox-webhook com Planos e assinaturas e Pagamentos (legacy) selecionados. A assinatura foi obtida apenas em memoria, sem registro em arquivo/log/chat. O cofre do staging ainda requer login no Supabase via GitHub no Edge; MP_MENU_SANDBOX_WEBHOOK_SECRET ainda nao foi salvo. Endpoint e entrega assinada continuam pendentes. Nenhuma configuracao de producao foi alterada.

### Assinatura instalada e entrega autenticada comprovada
MP_MENU_SANDBOX_WEBHOOK_SECRET salvo no cofre fuesdztsvrkkgnbqhcxi, confirmado pelo painel. Valor eliminado da memoria do navegador apos salvar. Endpoint menu-sandbox-webhook publicado somente no staging via CLI, JWT desativado porque o proprio handler autentica HMAC. Requisicao sem assinatura rejeitada com HTTP 400. Simulador do Mercado Pago enviou payment.updated, data.id=123456, live_mode=false para a URL de teste. Resposta HTTP 500; banco confirmou evento menu_sandbox:123456, event_type payment, processed_at null. Como a insercao ocorre somente apos validar HMAC, transporte e assinatura estao comprovados. O recurso ficticio nao comprova processamento financeiro nem liberacao de acesso. Captura simulada, evento de pagamento existente e atualizacao de acesso continuam pendentes. Producao nao alterada.

### Handlers do PR 18 publicados no staging
Em 19/10 as 23h22 BRT, publicados ogritech-billing v14 e billing-lifecycle v10 exclusivamente em fuesdztsvrkkgnbqhcxi. Cotacao mensal: HTTP 200, 4990 centavos; lifecycle sem segredo: HTTP 401. menu-sandbox-webhook permanece v1. Novo teste financeiro depende de renovacao explicita da janela anterior expirada as 22h30; nenhuma nova assinatura criada nesta etapa. CI do PR 18 aprovada nos jobs static e database.
