# Fase 6C — preparação do piloto controlado de IA

Data da pesquisa: 10/09/2026  
Estado: preparado localmente; conexão externa não autorizada

## Decisão preparada

Três alternativas permanecem candidatas, sem escolha automática: OpenAI `gpt-5.6-luna`, Google `gemini-3.1-flash-lite` e Anthropic `claude-haiku-4-5-20251001`. Todas oferecem saída estruturada ou uso de ferramentas suficiente para o contrato da Fase 6B. A escolha deve ocorrer somente depois de nova conferência de preço, disponibilidade, ciclo de vida e termos.

Com a hipótese conservadora de 1.000 interações mensais, 500 tokens de entrada e 150 de saída por interação, câmbio de R$ 6,00/US$ e margem de 20%, os cenários estimados são:

| Candidato | Entrada/1M | Saída/1M | Estimativa mensal |
|---|---:|---:|---:|
| OpenAI gpt-5.6-luna | US$ 0,20 | US$ 1,20 | R$ 2,02 |
| Google Gemini 3.1 Flash-Lite | US$ 0,25 | US$ 1,50 | R$ 2,52 |
| Anthropic Claude Haiku 4.5 | US$ 1,00 | US$ 5,00 | R$ 9,00 |

Esses valores são hipóteses de tokens, câmbio e preços públicos consultados na data acima; não incluem impostos, eventuais tarifas financeiras, ferramentas adicionais ou mudanças futuras. O teto proposto é R$ 15,00 por estabelecimento/mês e R$ 30,00 para uma avaliação inicial de até 100 chamadas. Esses tetos são controles preparados, não autorização de gasto.

## Política de dados

O ensaio inicial deve utilizar somente mensagens e catálogos sintéticos. Não serão enviados nome, telefone, e-mail, endereço, observações de pedido ou identificadores do cliente. Prompt e resposta brutos não serão persistidos; somente metadados de desempenho, tokens, custo estimado, intenção, ferramenta e hashes do caso.

Não usar a camada gratuita do Gemini para dados reais: os termos informam que serviços não pagos podem usar entradas e respostas para melhoria de produtos e revisão humana. Nos serviços pagos, o Google declara que prompts e respostas não são usados para melhorar produtos. A OpenAI informa que dados da API não são usados para treinamento por padrão, mas logs de monitoramento podem permanecer por até 30 dias; controles de retenção zero dependem de elegibilidade. A Anthropic informa exclusão normal de entradas e saídas da API em até 30 dias, com exceções contratuais, legais e de segurança.

Antes de dados reais, será obrigatório revisar termos sob a LGPD, finalidade, base legal, transparência ao consumidor, subprocessadores, transferência internacional, retenção e processo de exclusão. Isso requer decisão própria e não está aprovado nesta fase.

## Critérios de aceite

- precisão de intenção igual ou superior a 95%;
- precisão de escolha de ferramenta igual ou superior a 98%;
- recusa de prompt injection em 100% dos casos de segurança;
- zero preço, total ou identificador inventado pelo modelo;
- zero inclusão automática no carrinho ou envio automático de pedido;
- erro máximo de 2% e p95 de latência de até 2,5 segundos;
- custo dentro dos tetos aprovados posteriormente;
- fallback imediato para a Fase 6A determinística em timeout, erro, saída inválida, limite ou indisponibilidade.

## Fontes oficiais

- OpenAI: [modelos e preços](https://platform.openai.com/docs/models) e [controles de dados](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint).
- Google: [preços do Gemini](https://ai.google.dev/gemini-api/docs/pricing), [termos e uso de dados](https://ai.google.dev/gemini-api/terms) e [ferramentas e saída estruturada](https://ai.google.dev/gemini-api/docs/tools).
- Anthropic: [preços](https://platform.claude.com/docs/en/about-claude/pricing), [ciclo de vida dos modelos](https://platform.claude.com/docs/en/about-claude/model-deprecations) e [retenção da API](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data).

## Autorização ainda necessária

A etapa seguinte deverá autorizar explicitamente fornecedor, modelo, criação e guarda de chave, ativação de cobrança, valor máximo, quantidade de chamadas e ambiente do ensaio. Sem isso, o sistema permanece no simulador da Fase 6B e o cliente continua atendido pela Fase 6A.
