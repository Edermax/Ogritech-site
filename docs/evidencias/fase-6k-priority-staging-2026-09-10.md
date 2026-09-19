# Evidência — Fase 6K

Data: 10/09/2026. Ambiente: staging `fuesdztsvrkkgnbqhcxi`.

## Autorização e controles

Até cinco chamadas sintéticas com `gpt-5.6-luna`, `service_tier=priority`, teto de R$ 1,00 e staging exclusivamente. Produção e usuários reais permaneceram fora do escopo. O tier foi configurado por segredo de servidor e a função passou a devolver o tier efetivamente informado pela OpenAI.

## Resultado

| Chamada | HTTP | Tier confirmado | Latência | Intenção | Ferramenta |
|---|---:|---|---:|---|---|
| 1 | 200 | priority | 6.210 ms | catalog_search | catalog_search |
| 2 | 200 | priority | 2.645 ms | catalog_search | catalog_search |
| 3 | 200 | priority | 2.998 ms | catalog_search | catalog_search |
| 4 | 200 | priority | 2.271 ms | catalog_search | catalog_search |
| 5 | 200 | priority | 2.502 ms | catalog_search | catalog_search |

Todas as respostas exigiram confirmação humana. A mediana foi 2.645 ms e o p95 da amostra foi 6.210 ms. O p95 ficou pior que os 4.568 ms da amostra Default da Fase 6I, embora a mediana tenha melhorado frente a 3.471 ms. Excluindo o primeiro acesso, o pior resultado ainda foi 2.998 ms, acima da meta de 2.500 ms.

O preço Fast/Priority vigente do Luna para contexto curto é US$ 0,40/M tokens de entrada e US$ 2,40/M de saída, duas vezes o Standard. Considerando até 190 tokens de entrada e o teto de 80 de saída, cinco chamadas custariam no máximo aproximadamente US$ 0,00134 ou R$ 0,00804 pelo câmbio conservador de R$ 6/US$, abaixo do teto de R$ 1,00. A função foi corrigida para multiplicar por dois a estimativa gravada quando o tier configurado for Priority.

Fonte: [preços Fast do GPT-5.6 Luna](https://developers.openai.com/api/docs/pricing?latest-pricing=fast) e [documentação de Fast mode](https://developers.openai.com/api/docs/guides/fast-mode).

## Encerramento seguro

- segredo de tier restaurado para `default`;
- `hybrid_enabled=false` em staging e produção;
- kill switch ativo em ambos;
- chamadas e orçamento máximos zerados;
- empresa e assinaturas demonstrativas removidas;
- endpoint retorna HTTP 503 `hybrid_disabled`;
- nenhuma migration nova e nenhuma alteração em produção.

## Decisão

Priority funcionou e melhorou a mediana, mas não atingiu a meta de latência com consistência. O prêmio de preço não se justifica para este classificador. A ativação pública permanece reprovada e o modo padrão continua determinístico.
