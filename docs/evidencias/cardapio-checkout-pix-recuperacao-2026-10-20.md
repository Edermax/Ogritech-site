# Checkout e Pix — recuperação e homologação em staging

Continuação do PR20 no PR21. Produção não recebeu merge, migration, alteração de segredo ou deploy.

## Entrega implementada

- Retomada do checkout pendente pela tela autenticada: backend confere assinatura, referência e estado antes de retornar URL HTTPS oficial. A retomada não cria outra assinatura.
- Pix vencido deixa de aparecer como pagável. Atualização manual e consulta automática limitada mostram o estado atualizado; trocar para cartão oculta QR antigo.
- Reserva privada da tentativa Pix antes do POST, com UUID idempotente, referência e vencimento fixos. Validação na gravação protege contra concorrência, valor incorreto, QR ausente e tentativa obsoleta; histórico preservado.
- Migration `20261020204455_menu_pix_expiry_recovery.sql` aplicada somente ao staging, que passou de 77 para 78 migrations.
- Orders Pix opt-in `MP_MENU_SANDBOX_PIX_ORDERS=true` somente no staging. Referência externa convertida para caracteres aceitos e limitada a 64 caracteres, preservando o UUID do cadastro; a chave de idempotência permanece UUID completo. O caminho de produção continua na Payments API.
- Webhook Orders exige assinatura, ambiente fictício, vendedor de teste confirmado, país BRA, uma transação Pix e valor compatível. Somente order e pagamento processed/accredited concedem acesso.

## Autorização e execução em 20/10

O usuário autorizou até 20h Brasília (23h UTC): um Pix APRO fictício de R$49,90 e uma assinatura mensal pending sem cartão, publicação apenas no staging e tópico Orders de teste. Chaves administrativas foram usadas somente em memória, com JWT e cabeçalho administrativo. Nenhuma credencial foi versionada.

1. A API recusou a referência inicial (84 caracteres e dois-pontos). Após corrigir o formato, a chave consumida pela resposta HTTP400 foi substituída somente na fixture sem pagamento. Não houve segunda order criada.
2. Uma order fictícia `ORDTST01M5DJTAHSWD5DPC6V28Q3FH5T` retornou QR e action_required. Inicialmente o cadastro estava payment_pending, sem acesso e com cardápio indisponível.
3. Consulta posterior confirmou processed/accredited na order e pagamento. Não houve transferência real.
4. Reenvio administrativo assinado ao webhook real do staging consultou o recurso no Mercado Pago, aplicou o pagamento e liberou o cardápio para visitante anônimo. Prazo: 20/11/2026 21:18:46 UTC. Reenvio repetido manteve exatamente o mesmo prazo: uma intenção Pix e um evento processado.
5. Assinatura mensal `46c02524c5cd4be38eef557a8a33be45` criada pending, R$49,90, sem cartão. O checkout oficial abriu no Edge na tela “Como você prefere pagar?”, com a descrição da assinatura. Nenhum cartão foi informado. Cancelamento confirmado por GET no provedor.
6. Fixtures encerradas, cardápio fictício despublicado e nenhuma mensagem fictícia pendente na outbox. Histórico financeiro mantido. Ferramenta `menu-sandbox-qa` substituída por resposta fixa HTTP410, mantendo JWT; acesso anônimo retorna HTTP401.

## Limitação que permanece aberta

A entrega espontânea do webhook **não foi comprovada**. O recurso Orders informa application_id `2354123347267667`; o painel acessível é `6084226312562536` (Ogritech Assinaturas), onde Orders foi habilitado somente no modo de teste, preservando URL e assinatura existentes. A divergência é um indício para investigação, não uma causa conclusivamente comprovada. O painel do ID informado pela order retornou erro 5xx nesta conta.

O simulador oficial foi enviado para o mesmo endpoint de staging com o ID da order existente. Ele produziu payload genérico de Point, live_mode=true e usuário principal; o endpoint recusou a autenticação (HTTP401). Nenhuma validação de segurança foi removida. Esse envio não conta como entrega espontânea nem como nova aprovação. Falta alinhar a origem das credenciais/notificações e observar uma notificação autêntica do provedor no fluxo de teste.

## Verificações

- 257 testes JavaScript aprovados localmente, incluindo 36 de runtime e o caso real de referência de 84 caracteres.
- Replay limpo de 78 migrations na [CI](https://github.com/Edermax/Ogritech-site/actions/runs/39498141640): 522 asserções SQL em 20 arquivos. A suíte JavaScript também passou nessa execução; a correção posterior do formato externo foi testada localmente.
- Testes SQL da recuperação: 20 novas asserções e 26 de regressão; staging conferido com 78 migrations, uma intenção Pix e um evento de reenvio processado.
- Dry-run de produção atualizado: exatamente 23 migrations pendentes. Cópia isolada com alias histórico compatível e hash idêntico; nenhuma aplicação ou reparação de histórico em produção.

Fontes oficiais: [teste Pix Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix), [contrato de criação de order](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api/create-order/post) e [notificações Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications).

## Diagnóstico da origem do webhook — continuação

Na conta principal, a página de credenciais confirmou o vendedor fictício 3778177682. Os logs do staging no intervalo 21:15–22:00 UTC mostraram dois HTTP200 (reenvios administrativos) e um HTTP401 (simulador oficial), sem outro recebimento.

A documentação oficial de [notificações com credenciais de teste](https://www.mercadopago.com.br/developers/pt/docs/mp-point/notifications) orienta acessar a conta fictícia para configurar seus webhooks. Após autenticar o vendedor de teste na mesma aba do Edge, a aplicação 2354123347267667 abriu e informou “Você ainda não configurou notificações”. Isso confirma que a configuração da conta principal não atendia essa aplicação fictícia.

Foi preparado, sem salvar, o evento Order (Mercado Pago) com destino ao endpoint menu-sandbox-webhook do staging. A aba chama-se Modo de produção dentro da conta fictícia; não se trata da conta ou do Supabase de produção. Salvar criará a primeira assinatura secreta dessa aplicação. Confirmação específica solicitada para salvar/transmitir essa chave ao cofre do staging e executar um novo Pix fictício até 20h; nenhum novo Pix foi criado nesta continuação.

Ferramenta local preparada restrita a pix_create/pix_status, vendedor/aplicação/fixture fixos e limite 23h UTC. Verificações locais: 401 sem autenticação, 410 após prazo ou em outro projeto, sem tocar banco ou provedor. A função publicada continua encerrada.
