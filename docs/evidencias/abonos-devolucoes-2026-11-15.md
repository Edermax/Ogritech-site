# Abonos e devoluções de mensalidade — 15/11/2026

Em **Administrativo → Financeiro → Assinaturas**, cada assinatura oferece **Devolver mensalidade** e **Abonar mensalidade**. A solicitação inicial de QR Code foi corrigida pelo usuário para Pix Copia e Cola. O usuário também escolheu manter o cartão automático inalterado e disponibilizar abono somente para Pix e cobrança manual.

## Devolução

O administrador escolhe um pagamento recebido, informa o valor, o tipo/chave Pix, o favorecido e sua cidade. O valor máximo considera o montante recebido e devoluções já concluídas ou pendentes. A chave fica em tabela privada, acessível somente por funções com autorização administrativa; não entra nos logs de auditoria.

**Gerar Pix Copia e Cola** prepara e reserva a devolução; não transfere dinheiro e não a marca como realizada. O pagamento é feito no banco. Para concluir o registro, o administrador informa a referência bancária e confirma que realizou o pagamento. A confirmação é idempotente e uma referência bancária não pode ser reutilizada em outro registro concluído. Cancelar uma preparação libera a reserva financeira, mas não invalida um código estático já copiado. Fechar a janela mantém a preparação pendente, que pode ser retomada no histórico.

O código contém a chave do cliente, o valor canônico em centavos, nome/cidade compatíveis com BR Code e referência de conciliação. Usa CRC-16/CCITT-FALSE. É um **novo Pix ao cliente**; a interface distingue esse fluxo da devolução pela transação Pix original no banco. Fontes primárias: [Manual de Padrões do Pix](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf) e [orientação do BCB sobre devolução](https://bcb.gov.br/meubc/faqs/p/devolucao-de-dinheiro-com-pix).

Pagamentos aprovados do self-service também aparecem para devolução. Quando necessário, a preparação concilia uma única fatura e pagamento no financeiro antes de reservar o reembolso. A preparação não altera o pagamento original nem cancela a assinatura. Reembolsos/chargebacks/créditos anteriores continuam respeitando o saldo reservado. Somente devoluções concluídas afetam o total devolvido. Um recibo conciliado não autoriza nova devolução quando o pagamento online original já foi estornado ou seu valor diverge do registro do provedor. A interface confere novamente a validade antes de copiar o código e bloqueia preparações cujo pagamento original tenha sido revertido.

## Abono

O abono corresponde à **próxima mensalidade** identificada pela competência e pelo vencimento da assinatura. A observação é opcional, com até 500 caracteres. A tela apresenta o valor e a data prevista da cobrança seguinte antes da confirmação. O preço contratado das demais mensalidades permanece igual.

O servidor registra a competência uma única vez, gera ou ajusta uma fatura zerada identificada como **Abonada** e avança o prazo em um mês de calendário. Não cria pagamento nem receita fictícia e não reinicia o prazo original de teste gratuito. A rotina Pix utiliza o novo prazo e não gera a cobrança do período abonado. Cobranças antigas restantes não são perdoadas implicitamente.

Assinaturas anuais, canceladas ou com cartão automático não recebem abono. Mensalidades já pagas usam devolução; faturas com serviços adicionais, créditos ou múltiplas cobranças precisam ser conciliadas antes de abonar. Uma cobrança Pix já emitida deve ser cancelada no provedor e atualizada antes do abono. Operações de pagamento ou geração de Pix em andamento bloqueiam o abono.

O fluxo legado de criação de faturas também recusa cobrar novamente uma competência abonada. As mutações conferem o administrador no servidor, a assinatura, o cliente e o pagamento; o saldo é bloqueado durante a preparação/confirmação e há registro de auditoria.

## Concorrência com checkout

A seleção de pagamento passa a reservar a contratação antes da chamada externa, com comparação do estado atualizado e um token de operação. A mesma proteção impede corridas entre checkout, Pix em geração e abono. Estados conhecidos e persistidos liberam a reserva; uma criação de cartão com resposta incerta permanece bloqueada para conciliação, em vez de permitir abonar enquanto uma cobrança pode ter sido criada. Nessa situação, é necessário conferir o provedor e resolver a operação antes de liberar nova configuração. O cartão automático não é pausado, cancelado nem reprecificado pelo abono.

## Publicação e verificação

| Migration | Local | Staging | Produção |
| --- | --- | --- | --- |
| subscription_billing_adjustments | 20261115191635 | 20261115195345 | 20261115195924 |
| guard_reversed_online_refunds | 20261115200901 | 20261115201304 | 20261115201311 |

105 migrations nos dois ambientes, sem pendências e sem reparos no histórico. `ogritech-billing` v36 em staging e v25 em produção, bundle SHA-256 `0a9138784934ec95b1ca8c7c8a8bb0b85d4f2fc3a87014dc91e2dac3c9dda738`. A configuração anterior do gateway e a autenticação própria foram mantidas.

- 458 testes da aplicação aprovados, incluindo 2 de BR Code/CRC e 3 de reserva e resultado incerto do checkout.
- Banco local isolado: 32 arquivos, 867 verificações; 45 novas sobre saldo, idempotência, referência bancária, abonos, controle administrativo, checkout/Pix concorrente, prazo gratuito e reconciliação de pagamento online.
- Navegador em 390/1440 px: preparação sem confirmação automática, cópia do código com clipboard simulado, falha preservando dados, confirmação manual, observação vazia e cartão preservado. Formulário verificado no tema escuro.
- 63 cenas administrativas de tema claro/escuro e navegação anterior aprovadas. O novo fluxo tem teste próprio na CI.
- Produção antes/depois: 2 faturas e 1 devolução histórica, resumo financeiro `1132ffd03d5f121b51638b6bc951f598` inalterado. Nenhum abono ou transferência nova criado.
- RPCs financeiras recusaram acesso anônimo por HTTP. Advisors de saúde sem achados. A tabela privada de preparações tem RLS e nenhum acesso direto para clientes; seu aviso informativo de ausência de políticas é intencional. Permanece o aviso anterior de proteção contra senhas vazadas desativada.

Não foram realizados pagamentos, devoluções, abonos, mensagens ou cobranças reais nos testes. Provedor e clipboard foram simulados nos testes de interface.

## Recuperação

A evidência do backup criptografado existente de 15/11 e a restauração anterior são mantidas no lote de publicação. Em uma reversão da interface, conservar a migration, as preparações pendentes e o novo backend de cobrança: a função de seleção de pagamento agora exige o token de reserva do novo handler. Reverter isoladamente o handler para v24 interromperia novas escolhas de pagamento. A base anterior é `9981c6d89b5da79f44eafda9effb7742bfe8e2b8`. Antes de reverter dados, conciliar preparações já pagas no banco e abonos que já alteraram prazos; não eliminar registros financeiros para desfazer a interface.
