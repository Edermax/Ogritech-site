# Evidência — Fase 6L

Data: 10/09/2026.

## Decisão consolidada

O assistente determinístico é a experiência oficial e padrão do Ogritech Cardápio. Ele consulta somente o catálogo cadastrado, oferece referências estruturadas para produtos e carrinho e não envia pedidos sem confirmação do consumidor.

A investigação de latência do modelo externo foi encerrada. O ensaio Priority da Fase 6K apresentou p95 de 6.210 ms diante da meta pública de 2.500 ms e não justificou o prêmio de preço. A infraestrutura de IA permanece preservada para uma eventual avaliação futura, porém desligada e fora da jornada pública.

## Alterações

- comunicação do painel atualizada de “fase local” para “padrão”;
- cardápio público esclarece que as respostas usam somente os dados cadastrados;
- área de IA identifica o recurso como futuro e desativado;
- contrato final rastreável criado em `config/menu-assistant-phase-6l-final.json`;
- contrato de staging atualizado para `staging_prepared_ai_disabled`;
- testes ampliados para impedir ativação acidental ou comunicação ambígua.

## Limites preservados

- nenhuma chamada à OpenAI;
- nenhuma cobrança nova;
- nenhuma alteração em produção;
- IA pública desativada;
- nenhuma ação crítica delegada ao modelo;
- reativação condicionada a nova autorização explícita e nova validação de custo e latência.

## Validação

A validação local foi aprovada: 18 scripts, 10 páginas, 60 migrations classificadas e 110 testes Node passaram. O estado remoto permanece o encerrado na Fase 6K: staging e produção bloqueados, kill switch ativo, limites zerados e sem empresa demonstrativa.
