# Checkout e Pix — recuperação e diagnóstico

Continuação do PR20, sem merge ou deploy de produção. Esta evidência diferencia correções de código de homologação financeira no provedor.

## Correções

- Checkout pendente pode ser retomado pela tela autenticada da assinatura. O backend consulta a assinatura existente, confere ID, referência do cadastro e status pending; somente então retorna o link oficial. A tela não cria uma segunda assinatura para retomá-la.
- URLs de checkout são restritas a HTTPS, host `www.mercadopago.com.br` e caminho `/subscriptions/`. O retorno de teste preserva `env=staging`.
- Pix vencido deixa de ser exibido como código pagável. Há atualização manual do status e consulta automática limitada para Pix pendente.
- O worker rejeita QR ausente, valor/moeda divergentes, estado incompatível ou vencimento inválido antes de registrar cobrança como disponível.
- Migration candidata `20261020204455_menu_pix_expiry_recovery.sql`: tentativas Pix vencidas/recusadas/canceladas podem ser substituídas; uma tentativa válida, aprovada ou uma assinatura encerrada não é substituída indevidamente. Os registros anteriores são preservados.
- A tentativa é reservada no banco antes do POST: reenvios usam a mesma chave UUID, referência e vencimento. A gravação confere se o período, valor e pagamento anterior permanecem iguais. A reserva privada tem RLS, sem acesso de clientes.
- O status retorna o QR do pagamento atual, evitando escolher outro por empate de timestamp ou exibir Pix antigo após trocar para cartão.
- A escolha de Pix após expiração mantém o estado de pendência, sem anunciar um novo teste gratuito. A próxima data de cobrança respeita o acesso vigente.

## Verificação

- 254 testes JavaScript aprovados; testes de runtime executam os handlers reais com banco/provedor substituídos.
- Staging, transações com rollback: 20 asserções da recuperação e reserva Pix e 26 asserções de regressão do ciclo de assinatura aprovadas.
- Nenhum pagamento, assinatura externa, envio de e-mail ou troca de segredo foi executado nesta etapa. A migration candidata ainda não foi aplicada permanentemente e nenhum handler foi publicado.

## Provedor: pendências reais

O diagnóstico histórico registrou HTTP401 `Unauthorized use of live credentials` em `/v1/payments` com a credencial do vendedor de teste usada para assinaturas. Isso não é evidência de falha do Pix em produção. É necessário conferir a credencial e o contrato compatíveis com a Payments API no painel; não trocar para uma credencial real como tentativa de contorno.

Em 20/10, a página de credenciais de teste no Edge exigiu validação por telefone. A primeira tentativa ficou em “Enviando código…”. Após recarregar e selecionar WhatsApp uma vez, o campo de seis dígitos apareceu. O usuário deve concluir essa etapa no navegador; códigos e tokens não devem passar pelo chat.

Checkout visual no Mercado Pago, criação de Pix fictício e entrega espontânea do webhook ainda não foram concluídos nesta rodada. A autorização financeira anterior expirou; qualquer novo ensaio externo deve ter escopo e janela próprios. A ferramenta administrativa anterior permanece encerrada.

Fontes oficiais consultadas: [Pix via Payments](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix), [compras de teste via Payments](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-test/make-test-purchase). A documentação de Pix define vencimento entre 30 minutos e 30 dias; a reserva usa 72 horas.
