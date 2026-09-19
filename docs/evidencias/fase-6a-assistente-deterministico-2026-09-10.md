# Fase 6A — fundação determinística do assistente web

Data: 10/09/2026  
Ambiente: local  
Resultado: aprovado

## Entrega

- assistente opcional no cardápio público, desligado por padrão;
- configuração pelo gestor com limite mensal e limite por sessão/hora;
- busca de produtos e preços diretamente no catálogo publicado;
- respostas sobre horários e pagamentos cadastrados;
- ação segura para revisar o carrinho;
- inclusão de produto somente depois do clique do cliente;
- nenhuma criação ou envio automático de pedido;
- recusa de instruções que tentem revelar prompt, regras, segredos, tokens ou executar SQL;
- fallback para navegação manual e contato com o estabelecimento;
- telemetria privada com hash de sessão e mensagem, intenção, ferramenta, resultado e custo estimado, sem conteúdo bruto;
- custo unitário zero no modo determinístico e estrutura pronta para teto de custo futuro.

## Verificação

- replay limpo das 56 migrações concluído;
- `npm run validate`: 88 de 88 testes Node aprovados e política com 56 migrações classificadas;
- `npx supabase test db`: 14 arquivos e 426 asserções pgTAP aprovados;
- 26 cenários específicos cobrem feature flag, autorização, busca, preço real, confirmação, prompt injection, rate limit, hashes, custo zero e desligamento;
- lint dos schemas `public` e `private`: nenhum erro;
- navegador móvel com HTML, CSS e JavaScript reais: busca, sugestão, confirmação para adicionar, recusa maliciosa e revisão do carrinho aprovadas; sem overflow, erros JavaScript ou chamadas externas;
- captura: `outputs/menu-assistant-mobile.png`;
- relatório: `outputs/menu-assistant-ui-smoke.json`.

## Limites mantidos

Não existe modelo generativo conectado nesta fase. Nenhuma chave, API paga, contratação de provedor, mensagem, WhatsApp, staging ou produção foi utilizada. O assistente não interpreta linguagem livre com a flexibilidade de uma IA; quando não reconhece a intenção, orienta a navegação manual.

## Próxima recomendação

Fase 6B — criar um adaptador independente de provedor, simulador local de respostas estruturadas, avaliações de precisão e segurança e calculadora de custo por estabelecimento. A etapa continuará sem chave ou chamada paga. Somente depois dos resultados deve ser proposta uma Fase 6C com modelo real, orçamento explícito e autorização própria.
