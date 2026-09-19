# Fase 6C — preparação do piloto controlado de IA

Data: 10/09/2026  
Ambiente: local  
Resultado: plano preparado; conexão externa não autorizada

## Entrega

- pesquisa datada em documentação oficial de três fornecedores candidatos;
- preços públicos registrados como fotografia temporária, com validade de decisão até 10/10/2026;
- política executável com todas as autorizações externas desligadas;
- orçamento proposto de R$ 15 por estabelecimento/mês e R$ 30 para até 100 chamadas de avaliação;
- política de dados sintéticos, sem identidade do cliente nem persistência de mensagens;
- critérios mensuráveis de precisão, segurança, latência, erro e custo;
- fallback obrigatório para a Fase 6A determinística;
- verificador reproduzível e relatório em `outputs/menu-ai-pilot-readiness.json`.

## Cenário conservador

Para 1.000 interações mensais, 500 tokens de entrada e 150 de saída, câmbio de R$ 6,00/US$ e margem de 20%, as estimativas foram R$ 2,02 para OpenAI gpt-5.6-luna, R$ 2,52 para Google Gemini 3.1 Flash-Lite e R$ 9,00 para Anthropic Claude Haiku 4.5. Valores não incluem impostos e devem ser revalidados antes de qualquer decisão.

## Validações

- verificador de prontidão: aprovado, sem bloqueios e com zero chamadas externas;
- política: 5 testes dedicados;
- suíte Node completa executada após a integração;
- política de migrations preservada sem nova migration.

## Limites

Nenhum fornecedor ou modelo foi selecionado. Não foram criadas conta ou chave, ativada cobrança, feita chamada de inferência, enviada mensagem, integrado WhatsApp, alterado staging ou publicado código. A autorização desta fase prepara uma decisão e não autoriza gasto.

## Próxima etapa

Fase 6D — decisão e ensaio externo limitado. Antes de executar, o usuário deverá autorizar explicitamente fornecedor e modelo, criação e guarda da chave, ativação de cobrança, teto de R$ 30, até 100 chamadas exclusivamente sintéticas e ambiente local de avaliação. Sem essa autorização granular, permanecer nas Fases 6A e 6B.
