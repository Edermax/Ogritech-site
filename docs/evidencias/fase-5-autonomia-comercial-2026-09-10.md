# Fase 5 — autonomia comercial e portabilidade

Data: 10/09/2026  
Ambiente: local  
Resultado: aprovado

## Entrega

- centro de assinatura no painel do proprietário;
- contratação independente das quatro soluções e provisionamento conforme o direito calculado no servidor;
- seleção de plano e ativação ou remoção de módulos compatíveis com o produto;
- cancelamento isolado por solução, com acesso preservado até o fim do período;
- reativação antes do encerramento e nova contratação após o período cancelado;
- exportação JSON consolidada e versionada, sem tokens públicos ou chaves de idempotência;
- trilha de auditoria para contratação, plano, módulo, cancelamento, reativação e exportação;
- suporte visível e opcional, sem contato obrigatório.

## Verificação

- replay limpo das 55 migrações concluído;
- `npm run validate`: 85 de 85 testes Node aprovados e política com 55 migrações classificadas;
- `npx supabase test db`: 13 arquivos e 400 asserções pgTAP aprovados;
- `npx supabase db lint --local --schema public,private --level warning --fail-on error`: nenhum erro;
- navegador local com HTML, CSS e JavaScript reais: contratar Cardápio, cancelar apenas Agenda, reativar Agenda e gerar exportação aprovados, sem erro JavaScript;
- captura: `outputs/subscription-center-desktop.png`;
- relatório: `outputs/subscription-center-ui-smoke.json`.

## Limites mantidos

Nenhum ambiente remoto foi alterado e nenhum provedor foi chamado. Os planos de configuração dos produtos ainda não lançados possuem valores locais provisórios; preços finais, cobrança real, impostos, prorrateio e regras comerciais dependem de decisão e homologação próprias antes de staging ou produção. Não houve envio de mensagem, WhatsApp ou chatbot.

## Próxima recomendação

Fase 6A — fundação local do assistente web do Ogritech Cardápio, sem modelo externo: ferramentas determinísticas sobre catálogo e carrinho, feature flag, confirmação humana, limites de uso e custo, defesa contra prompt injection, logs seguros e fallback. A conexão a um modelo pago deve ser uma autorização posterior separada, com orçamento mensurável.
