# Fase 4 — onboarding e publicação autônoma do Ogritech Cardápio

Data: 09/09/2026  
Ambiente: local  
Resultado: aprovado

## Entrega

- onboarding persistente e retomável com oito verificações objetivas calculadas no servidor;
- configuração de identidade, endereço público, retirada, entrega, região, pagamentos manuais e horário informativo;
- pedido de teste pelo mesmo núcleo transacional e pelas mesmas regras de preço, opções, mínimo, taxa e agendamento do pedido público;
- identificação e encerramento automático do pedido de teste, sem cobrança real e sem ações operacionais comuns;
- revisão explícita, publicação e despublicação controladas no backend;
- invalidação automática do teste e da revisão quando o catálogo muda;
- bloqueio de edição enquanto publicado e proteção contra escrita direta pelas funções expostas;
- suporte Ogritech visível e opcional, sem transformar ajuda em requisito da jornada.

## Verificação

- `npm run validate`: 82 de 82 testes Node aprovados; 54 migrações classificadas, sendo 36 aplicadas em produção e 18 retidas;
- `npx supabase test db`: 12 arquivos e 363 asserções pgTAP aprovados;
- `npx supabase db lint --local --schema public,private --level warning --fail-on error`: nenhum erro nos schemas da aplicação;
- replay local das 54 migrações e seed concluído em banco novo;
- ensaio do HTML, CSS e JavaScript reais em 1440×1000 e 390×844: salvar, retomar, impedir publicação com alterações não salvas, testar, revisar, publicar e despublicar aprovados; sem overflow horizontal, erro JavaScript ou origem externa;
- capturas: `outputs/menu-onboarding-desktop.png` e `outputs/menu-onboarding-mobile.png`;
- relatório automatizado: `outputs/menu-onboarding-ui-smoke.json`.

## Limites mantidos

Nenhum ambiente remoto foi alterado. Não houve publicação em staging ou produção, contratação de provedor, pagamento online do consumidor, envio de mensagem, WhatsApp ou chatbot. Os horários cadastrados nesta fase são informativos e não bloqueiam pedidos automaticamente.

## Próxima recomendação

Completar a autonomia comercial e o ciclo de dados: contratação e provisionamento, gestão de módulos, upgrade ou downgrade, exportação, cancelamento e reativação self-service. A entrega deve continuar local e reutilizar a fundação multiproduto e a cobrança já existentes; integrações ou promoção remota exigem autorização própria.
