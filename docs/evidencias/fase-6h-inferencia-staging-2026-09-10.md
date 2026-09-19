# Evidência — Fase 6H

Data: 10/09/2026. Ambiente: staging `fuesdztsvrkkgnbqhcxi`.

## Autorização

OpenAI `gpt-5.6-luna`, chave existente, somente dados sintéticos, uma empresa demonstrativa, máximo de 10 chamadas e teto de R$ 1,00. Kill switch aberto somente durante a janela e religado ao final.

## Implementação

- Responses API com saída JSON Schema estrita, `store:false`, raciocínio desativado, zero repetição e até 120 tokens de saída;
- validação Zod de ambiente, entrada e resposta;
- preço, total, catálogo e pedido permanecem fora da autoridade do modelo;
- timeout de 30 segundos e fallback determinístico;
- telemetria privada contendo hashes, rota, resultado, latência, tokens e custo estimado, sem conteúdo bruto;
- gravação permitida somente ao `service_role`, com `USAGE` de schema sem privilégios adicionais de tabela;
- migrations de inferência e duas correções rastreáveis aplicadas ao staging, totalizando 60.

## Janela sintética

Sete chamadas chegaram ao modelo, abaixo do limite de dez. As seis primeiras produziram saída aceita, mas retornaram fallback durante o ajuste da autorização da telemetria: inicialmente faltava autorização adequada dentro da função e, depois, `USAGE` no schema privado. As correções foram validadas sem OpenAI antes da sétima e última chamada.

A chamada final passou de ponta a ponta:

- HTTP 200;
- rota `model`;
- intenção `fallback`, sem ferramenta;
- confirmação humana obrigatória;
- 190 tokens de entrada e 44 de saída;
- 545 micros de BRL, equivalentes a R$ 0,000545;
- latência externa observada de 5.056 ms.

Usando a entrada observada de aproximadamente 190 tokens e o limite máximo de 120 tokens de saída para estimar conservadoramente as sete chamadas, o total fica em aproximadamente R$ 0,007644, abaixo de R$ 0,01 e muito abaixo do teto de R$ 1,00. O custo exato das seis primeiras não foi persistido porque a telemetria ainda estava sendo corrigida. O p95 observado ficou aproximadamente em 5.739 ms, acima do critério público de 2.500 ms.

## Encerramento seguro

- `hybrid_enabled=false` em staging e produção;
- kill switch ativo em ambos;
- chamadas e orçamento máximos zerados;
- empresa demonstrativa removida;
- endpoint retorna HTTP 503 `hybrid_disabled`;
- scripts transitórios de abertura e limpeza removidos do workspace.

## Decisão

Integração, segurança, telemetria e custo foram comprovados. A ativação pública continua reprovada por latência. Nenhuma produção ou empresa real foi alterada.
