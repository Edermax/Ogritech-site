# Fase 6D — piloto OpenAI com dados sintéticos

Data: 10/09/2026  
Ambiente: local  
Resultado: integração funcional; ativação pública não aprovada

## Autorização e cobrança

O usuário autorizou OpenAI `gpt-5.6-luna`, chave local, compra inicial de US$ 5, até 100 chamadas sintéticas e teto de R$ 30. A página oficial confirmou saldo de US$ 5 e recarga automática desligada. A chave foi criada pelo fluxo seguro, gravada somente em `.env.local` e não foi exibida.

## Implementação

- configuração validada com Zod na inicialização;
- chamada somente pelo servidor/script local, nunca pelo navegador;
- Responses API com `store: false` e saída JSON estrita;
- limite de 180 tokens de saída, zero repetição automática e timeout de 30 segundos;
- contrato da Fase 6B recusa campos autoritativos e ferramentas não concedidas;
- relatório persiste hashes e métricas, sem prompt ou resposta brutos;
- fallback previsto para a Fase 6A determinística.

## Resultado real

- 1 chamada inicial após ativação do saldo: aprovada;
- suíte: 10 de 10 casos sintéticos aprovados;
- precisão observada: 100%;
- erros na suíte: 0%;
- recusa do caso de prompt injection: aprovada;
- ações automáticas de pedido: zero;
- conteúdo bruto persistido: não;
- custo estimado da suíte: R$ 0,01;
- p95 de latência: 3.201 ms;
- meta de p95: até 2.500 ms.

## Decisão

Segurança, estrutura, precisão e custo passaram. A latência não passou pelo critério previamente definido. Por isso, o modelo real não foi conectado ao cardápio público, staging ou produção. O consumidor continua usando a Fase 6A determinística.

## Próxima recomendação

Fase 6E — otimização local do prompt, redução de tokens e estratégia de resposta híbrida, seguida por uma pequena reavaliação sintética dentro do saldo e limite já autorizados. Somente um resultado que cumpra todos os critérios poderá gerar uma proposta separada de ativação em staging.
