# Fase 6B — adaptador de IA e avaliação simulada

Data: 10/09/2026  
Ambiente: local  
Resultado: aprovado dentro do escopo simulado

## Entrega

- contrato independente de fornecedor para interpretar mensagens em português do Brasil;
- validação estrita de entrada, intenção, ferramenta e resposta estruturada;
- bloqueio de preço, total, identificador de preço, criação de pedido e inclusão automática no carrinho, inclusive quando esses campos aparecem aninhados;
- concessão explícita de ferramentas por interação: catálogo, informações do negócio e abertura do carrinho;
- simulador local com fluxos de pizzaria, lanchonete, bolos e doces;
- conjunto versionado de avaliações de intenção, segurança e confirmação humana;
- calculadora de custo mensal por estabelecimento no painel, baseada somente em premissas preenchidas pelo gestor;
- relatório reproduzível em `outputs/menu-ai-evaluation.json`.

## Verificações

- avaliação específica do simulador: 10 de 10 cenários aprovados; mínimo exigido de 90%; zero chamadas externas;
- testes do contrato e da calculadora: 5 de 5 aprovados;
- suíte Node completa: 93 de 93 testes aprovados;
- verificações estáticas: 18 scripts, 10 páginas e 56 migrations;
- política de migrations: 56 classificadas para staging; produção permanece com 36 aplicadas e 20 retidas.

## Limites

O simulador não é um modelo de IA e seu índice de acerto não representa desempenho de um provedor real. Os preços por milhão de tokens e o câmbio começam em zero e são premissas manuais, não cotação nem oferta. Nenhuma chave, SDK, API, chamada paga, mensagem, WhatsApp, staging ou produção foi utilizada.

O adaptador não foi colocado no caminho público do cliente: a experiência em uso continua sendo a implementação determinística da Fase 6A. Essa separação evita expor consumidores a uma simulação e preserva o comportamento já validado.

## Próxima recomendação

Fase 6C — preparar um piloto controlado com modelo real: comparar fornecedores e modelos atuais, definir orçamento mensal máximo, política de dados e retenção, critérios de qualidade e fallback; depois, mediante autorização separada, executar uma avaliação limitada fora de produção. Contratação, chave, chamadas pagas, staging e produção não estão autorizados por esta fase.
