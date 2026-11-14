# Escolha entre Cardápio e Encomendas — 14/11/2026

O cadastro já oferecia os dois produtos em um seletor, mas o título, o preço de
abertura e a apresentação destacavam apenas Cardápio. Um parágrafo duplicado
também informava R$ 49,90 independentemente da escolha.

A entrada “Criar meu cardápio grátis” agora apresenta uma comparação visível:

- Cardápio: catálogo, seleção de produtos e atendimento pelo WhatsApp;
  R$ 29,90/mês ou R$ 299,00/ano após o teste.
- Encomendas: catálogo e gestão de pedidos no painel, entrega, retirada,
  agendamento e acompanhamento pelo cliente; R$ 49,90/mês ou R$ 499,00/ano.

Encomendas recebe um destaque discreto com o selo “Mais completo”, botão
principal e a diferença de R$ 20 mensais. A entrada sem plano seleciona
Encomendas; links `?plano=cardapio` e `?plano=encomendas` respeitam a escolha
explícita. A troca pelos cards preserva campos preenchidos e periodicidade.
O seletor nativo continua disponível no formulário.

Nome, preços mensal/anual, resumo, botão de cadastro e consentimento obrigatório
do WhatsApp acompanham o plano escolhido. O interesse em notificações de pedidos
é exibido e registrado somente para Encomendas. A página inicial e a página
Cardápio Digital também destacam o plano mais completo na comparação de preços.

Mantidos: 14 dias na primeira contratação, teste único por CPF/CNPJ entre os
planos, ausência de cobrança automática no fim do teste e preços existentes.
Nenhum backend, assinatura de cliente ou banco foi alterado.

Validação: 428 testes Node e verificações estáticas/migrations aprovados.
O roteiro de navegador `scripts/split-offers-browser.mjs` passou em 13 cenários,
incluindo comparação em 390 e 1440 px, troca sem perda de campos, preços anuais,
links específicos e envio simulado de cada plano/periodicidade. Zero erros de
página ou requisições externas; nenhum cadastro ou pedido real criado.
Capturas revisadas em `outputs/split-offers/signup-plans-390.png` e
`outputs/split-offers/signup-plans-1440.png`.
