# Política comercial do Cardápio

## Decisão vigente — 13/11/2026

- **Cardápio:** R$ 29,90/mês ou R$ 299,00/ano. Catálogo configurável e resumo para WhatsApp, sem entrega ou acompanhamento de pedidos na plataforma.
- **Encomendas:** R$ 49,90/mês ou R$ 499,00/ano. Mantém a operação completa do Cardápio anterior.
- Os 14 dias gratuitos são únicos por CPF/CNPJ na família de ofertas. Upgrade, downgrade, cancelamento ou nova seleção não concedem outro teste.
- Troca preserva catálogo, histórico e prazo de acesso. Novo preço na próxima cobrança, sem cobrança proporcional; pagamentos pendentes precisam ser resolvidos antes.
- Cadastro seleciona plano e periodicidade. Assinaturas antigas mantêm Encomendas. Código técnico `menu` e plano legado `foundation` são preservados para compatibilidade.
- Esta decisão está implementada localmente e exige publicação coordenada de banco, funções e frontend; o histórico abaixo descreve estados anteriores.

Consulte [escopo e verificação](OGRITECH_CARDAPIO_E_ENCOMENDAS.md).


Decisão aprovada pelo responsável em 21/10/2026, após proposta apresentada na conversa. Aplica-se ao candidato de lançamento; não representa publicação em produção nem revisão jurídica concluída.

## Oferta aprovada

- Implantação gratuita por autosserviço: o cliente cadastra produtos, preços, imagens e identidade visual no painel.
- Orientação de suporte para uso do painel incluída. A execução manual do cadastro pela Ogritech não integra a assinatura.
- Cadastro feito pela Ogritech, criação de imagens ou desenvolvimento específico somente mediante orçamento separado e aprovação prévia do cliente. Removida a oferta anterior de configuração assistida por R$ 99.
- Teste de 14 dias gratuitos; assinatura de R$ 49,90/mês ou R$ 499/ano. Mantidos os fluxos existentes de cartão recorrente autorizado e Pix por período. Nenhuma mudança de preço, cobrança ou plano foi aplicada no provedor.
- Emissão fiscal manual no início, com controle vinculado às cobranças. A emissão deve respeitar o enquadramento, a competência e os prazos fiscais que forem confirmados pela contabilidade. Recibo de pagamento não deve ser tratado como nota fiscal. Não foi criada automação fiscal nem prometida emissão automática ao cliente.

## Dados informados pelo responsável

- CNPJ: **39.531.449/0001-11**.
- Responsável pelo suporte: **Eder Ogrizio Silva**.
- Fonte: dados fornecidos pelo usuário na conversa. O vínculo cadastral oficial, a situação tributária e os CNAEs não foram comprovados; o nome da pessoa não foi assumido como razão social oficial.
- Faltam comprovante cadastral atualizado, razão social exata, endereço, regime/CNAEs e configuração fiscal. Os demais papéis operacionais e substitutos não foram atribuídos por inferência.

## Suporte e implantação

A nomeação de Eder preenche o papel de suporte técnico em `config/operational-readiness.json`. A janela de cobertura, o substituto e os canais ainda precisam de validação conforme `docs/SLA_SUPORTE_ESCALONAMENTO.md`. A orientação incluída não constitui atendimento permanente nem garantia contratual de resolução nos prazos internos propostos.

## Termos e publicação

A página inicial e a minuta dos termos foram alinhadas à política aprovada. A minuta passa para **3.1, de 21/10/2026**. O SHA-256 dos bytes commitados de `termos.html` consta de `commercialPolicyAcceptance.termsSha256` em `config/menu-production-launch.json`.

Antes da publicação, alinhar `BILLING_TERMS_VERSION` e `BILLING_TERMS_SHA256` do backend ao conteúdo revisado. Preservar os aceites históricos; não alterar seus registros para simular aceite da nova versão. Nenhum secret remoto foi alterado nesta etapa.

O aceite comercial não substitui validação fiscal, revisão jurídica, teste dos canais ou autorização da janela de release. Os gates correspondentes continuam pendentes.
