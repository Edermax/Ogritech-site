# Fase 7K-A — consolidação segura do repositório

Iniciada em 19/09/2026 após autorização explícita. O objetivo é transformar o trabalho local acumulado em uma base rastreável sem interromper o piloto privado da Fase 7J.

## Escopo

- classificar alterações por fundação multiproduto, Agenda, cobrança, Cardápio e piloto;
- preservar arquivos locais sem publicar dados pessoais ou evidências geradas;
- corrigir referências que apresentavam estados históricos como atuais;
- manter produção, IA paga, mensagens automáticas e renovação bloqueadas;
- executar a validação completa antes de versionar cada conjunto coerente.

## Política de versionamento

O diretório `outputs/` permanece local e ignorado pelo Git porque contém relatórios reproduzíveis, capturas, documentos renderizados e cópias técnicas. Evidências narrativas e contratos necessários para auditoria ficam em `docs/` e `config/`.

Nomes pessoais, contatos privados, áudios, imagens-fonte e registros de consumidores não podem ser incluídos no repositório público. A identidade comercial e o telefone público exibidos voluntariamente no frontend são tratados separadamente dos dados pessoais dos operadores.

## Estado operacional preservado

O piloto `PILOTO-CARDAPIO-01` continua exclusivamente no staging até 01/10/2026 às 18h44. Esta fase não publica produção, não envia mensagens, não ativa integração de pagamento e não amplia participantes ou limites.

## Saída esperada

Após testes e commits por assunto, a base deve ficar alinhada com a Fase 7J. A etapa seguinte é a Fase 7K-B, dedicada a métricas e acompanhamento do piloto.
