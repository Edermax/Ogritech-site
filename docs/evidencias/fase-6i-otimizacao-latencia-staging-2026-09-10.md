# Evidência — Fase 6I

Data: 10/09/2026. Ambiente: staging `fuesdztsvrkkgnbqhcxi`.

## Escopo autorizado

Otimizar latência e robustez da telemetria, publicar somente no staging e executar uma amostra sintética pequena. Produção, usuários reais, WhatsApp e ativação pública permaneceram fora do escopo.

## Alterações

- prompt de sistema reduzido sem transferir ao modelo autoridade sobre preço, total, desconto, disponibilidade ou pedido;
- entrada enviada ao modelo simplificada;
- limite de saída reduzido de 120 para 80 tokens;
- raciocínio mantido desativado, `store:false`, JSON Schema estrito e zero repetição;
- telemetria movida para `EdgeRuntime.waitUntil`, conforme o mecanismo oficial de tarefas de fundo do Supabase;
- falha de telemetria isolada e registrada, sem converter uma resposta válida do modelo em HTTP 502;
- gate, validação de origem, rejeição de dados sensíveis, timeout, fallback e confirmação humana preservados.

Referências consultadas: [tarefas de fundo em Edge Functions](https://supabase.com/docs/guides/functions/background-tasks) e [otimização de latência da OpenAI](https://developers.openai.com/api/docs/guides/latency-optimization).

## Janela sintética

Antes das chamadas válidas, três requisições foram recusadas com HTTP 403 por origem não permitida. Elas pararam antes do gate de inferência e não alcançaram a OpenAI. O ensaio foi então repetido com a origem institucional autorizada.

As três chamadas válidas retornaram:

| Chamada | HTTP | Latência externa | Rota | Intenção | Ferramenta |
|---|---:|---:|---|---|---|
| 1 | 200 | 4.568 ms | model | catalog_search | catalog_search |
| 2 | 200 | 3.471 ms | model | catalog_search | catalog_search |
| 3 | 200 | 2.726 ms | model | catalog_search | catalog_search |

Todas exigiram confirmação humana. O p95 da amostra de três foi 4.568 ms, aproximadamente 20% menor que os 5.739 ms observados na Fase 6H, porém ainda acima do máximo público de 2.500 ms.

Considerando até 190 tokens de entrada observados anteriormente e o novo teto de 80 tokens de saída, a estimativa conservadora das três chamadas é de aproximadamente R$ 0,002412. O valor exato não foi preservado porque a telemetria pertencia à empresa sintética e foi eliminada por cascata durante a limpeza obrigatória.

## Validação e encerramento

- 109 testes Node aprovados;
- 20 asserções pgTAP remotas aprovadas;
- lint remoto dos schemas `public` e `private` sem erros;
- staging e produção com `hybrid_enabled=false`, kill switch ativo, máximo de chamadas zero e orçamento zero;
- empresa demonstrativa removida, inclusive a assinatura criada automaticamente pelo fluxo legado;
- endpoint confirmado com HTTP 503 `hybrid_disabled` após a limpeza;
- nenhuma migration nova e nenhuma alteração em produção.

## Decisão

A alteração melhorou a latência e impediu que indisponibilidade da telemetria derrube uma resposta válida. A inferência continua sendo o componente dominante e o p95 não atingiu 2.500 ms. A ativação pública permanece reprovada.
