# Evidência — Fase 6J

Data: 10/09/2026. Ambiente técnico: staging `fuesdztsvrkkgnbqhcxi`.

## Decisão

Manter a IA como fallback opcional para mensagens ambíguas, usando `gpt-5.6-luna` no tier padrão. O motor determinístico atende intenções claras e continua sendo o único caminho apropriado para a jornada com meta p95 de 2.500 ms.

A rota de modelo:

- não participa de preço, total, desconto, disponibilidade, inclusão no carrinho ou envio de pedido;
- exige confirmação humana;
- tem timeout de 6.000 ms e fallback determinístico;
- permanece desativada publicamente;
- só pode operar sob opt-in, kill switch e limites de custo e chamadas.

## Fundamentação atual

A documentação oficial da OpenAI descreve o `gpt-5.6-luna` como modelo para cargas sensíveis a custo e alto volume, com preço de US$ 0,20 por milhão de tokens de entrada e US$ 1,20 por milhão de tokens de saída. Ele suporta Responses API e Structured Outputs, necessários ao contrato atual.

Terra e Sol custam mais e não há medição no Ogritech que demonstre vantagem de latência para esta classificação curta. O tier Fast/Priority pode ser solicitado por `service_tier`, mas constitui outra modalidade de processamento e deve ter orçamento e teste próprios. Uma troca para provedor externo adicionaria fornecedor, credencial, avaliação de dados, faturamento e suporte operacional sem necessidade comprovada neste momento.

Fontes: [modelo GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [referência de criação de Responses e service tier](https://developers.openai.com/api/reference/cli/resources/responses/methods/create) e [catálogo Awesome consultado para alternativas](https://github.com/sindresorhus/awesome).

## Implementação

- criado `config/menu-ai-phase-6j-decision.json` como contrato auditável da decisão;
- atualizado `config/menu-ai-staging-contract.json` para `staging_fallback_only_blocked`;
- timeout da Edge Function reduzido de 30.000 para 6.000 ms;
- modelo e tier permanecem `gpt-5.6-luna` e `default`;
- versão publicada somente no staging com gate fechado;
- nenhuma chamada ao modelo foi realizada nesta fase.

## Verificação

- 109 testes Node aprovados;
- 60 migrations preservadas, sem nova alteração de banco;
- chamada remota bloqueada retornou HTTP 503 `hybrid_disabled` e não alcançou a OpenAI;
- produção não foi modificada;
- ativação pública continua reprovada.

## Próximo gate proposto

Se for desejável verificar se o tier Priority resolve a latência, executar no máximo cinco chamadas sintéticas, teto de R$ 1,00, apenas no staging, restaurando o tier padrão e o kill switch ao final. Essa proposta não está autorizada por este documento.
