# Ogritech Cardápio — visão e fio condutor

Registrado em: 08/09/2026.

Estado: **FASE 7D — BETA HUMANO LOCAL APROVADO NOS QUATRO SEGMENTOS EM 16/09/2026**.

Este documento é a fonte de verdade para retomar o planejamento e a execução da solução oficialmente chamada **Ogritech Cardápio**. Ele registra as decisões aceitas pelo responsável da Ogritech durante a descoberta do produto. A autorização vigente permite a padronização da nomenclatura no frontend e na documentação; não autoriza migrations remotas, contratação de provedores, mensagens reais ou publicação.

## Visão consolidada

O Ogritech Cardápio será uma das quatro soluções comerciais da plataforma Ogritech, ao lado de **Ogritech Agenda**, **Ogritech Páginas** e **Ogritech Orçamentos**. Não será apenas um cardápio por QR Code: será um canal próprio de vendas para pequenos negócios de alimentação, acessível por link, QR Code, WhatsApp, Instagram, Google e outros pontos de entrada.

Proposta de valor:

> Seu cardápio, seus clientes e sua margem. Venda diretamente sem pagar comissão sobre cada pedido.

O produto não será um marketplace e a Ogritech não deverá cobrar percentual sobre o valor das vendas. Marketplaces poderão continuar como canais de aquisição; o Ogritech Cardápio será o canal direto de recompra, relacionamento e fidelização.

## Relação com a plataforma existente

- A Ogritech é a plataforma; Agenda e Cardápio são soluções contratáveis.
- Uma empresa poderá contratar uma ou mais soluções.
- Identidade, empresas, usuários, permissões, cobrança Ogritech, suporte, privacidade, auditoria e administração devem ser compartilhados quando tecnicamente adequado.
- Pagamentos do consumidor ao estabelecimento são separados da cobrança da Ogritech à empresa contratante.
- A Ogritech Agenda continua sendo a solução prioritária no roteiro vigente.
- O Cardápio deve entrar de forma modular, isolada por produto, permissão ou feature flag.
- Nenhuma mudança do Cardápio pode quebrar, atrasar ou alterar silenciosamente a jornada da Agenda.

## Segmentos iniciais

O núcleo deve atender inicialmente:

1. pizzarias;
2. lanchonetes e hamburguerias;
3. restaurantes e marmitarias;
4. confeitarias, bolos e doces.

A expansão futura poderá incluir açaiterias, sorveterias, padarias, cafeterias, salgaderias, bebidas e outros negócios de alimentação.

Não criar aplicações independentes por segmento. Utilizar um núcleo universal configurável, com templates iniciais e módulos especializados.

## Núcleo universal

O modelo deve comportar:

- cardápios, categorias, produtos, imagens, descrições e preços;
- variações, adicionais, remoções, combos e grupos de opções;
- quantidades mínimas e máximas, seleção única ou múltipla e opções gratuitas;
- produtos simples, montáveis, fracionados, por peso, por quantidade e sob encomenda;
- disponibilidade e horários por produto ou categoria;
- carrinho, checkout, cupons, pedidos e acompanhamento;
- entrega, retirada, consumo local e agendamento;
- clientes, relatórios, auditoria, usuários e permissões.

Preço, desconto, disponibilidade, taxa de entrega, total, pagamento e estado do pedido devem ser calculados e validados pelo backend. Navegador, conversa e chatbot nunca serão fontes definitivas desses valores.

## Especialização por segmento

### Pizzaria

- tamanhos, sabores, massas, bordas e adicionais;
- limite de sabores por tamanho;
- preço pelo sabor mais caro, média ou proporcional, conforme configuração do estabelecimento.

### Lanchonete e hamburgueria

- pão, carne, ponto, ingredientes removíveis, molhos, adicionais, acompanhamentos e combos;
- montagem guiada por etapas.

### Restaurante e marmitaria

- tamanhos, proteínas, acompanhamentos, limites de escolhas e cardápio por dia ou horário;
- retirada, entrega e agendamento;
- assinatura semanal como possibilidade futura.

### Confeitaria, bolos e doces

- venda por unidade, caixa, cento, peso ou tamanho;
- data, horário, antecedência e capacidade de produção;
- massa, recheio, cobertura, formato, tema, texto e imagem de referência;
- aprovação manual, sinal e pagamento restante quando aplicável.

## Personalização controlada

O estabelecimento poderá configurar logo, cores, capa, banners, informações comerciais, redes sociais, domínio ou subdomínio, categorias, destaques, promoções, horários, pedido mínimo, modalidades de atendimento, área de entrega, preparo e pagamentos.

Não oferecer CSS ou JavaScript arbitrário. Usar temas controlados para preservar segurança, acessibilidade, desempenho e suporte.

## Autonomia obrigatória

Toda a jornada deve ser self-service:

1. conhecer e comparar soluções e planos;
2. testar demonstração;
3. criar conta e contratar;
4. pagar e provisionar o ambiente;
5. configurar ou importar o cardápio;
6. fazer pedido de teste e publicar;
7. operar e administrar usuários;
8. contratar ou remover módulos;
9. fazer upgrade ou downgrade;
10. consultar cobranças;
11. cancelar sem contato obrigatório;
12. exportar dados, solicitar exclusão e reativar quando permitido.

O suporte da Ogritech deve estar visível e disponível, mas nunca ser etapa obrigatória. Mensagem orientadora:

> Você pode concluir tudo por conta própria. Se preferir, a Ogritech está disponível para ajudar.

Meta sugerida: pelo menos 80% dos estabelecimentos devem contratar, publicar e receber o primeiro pedido sem intervenção humana; evoluir para mais de 90% após o amadurecimento do onboarding.

## Onboarding

O onboarding será persistente e retomável:

1. estabelecimento;
2. segmento;
3. identidade visual;
4. cardápio;
5. entrega e retirada;
6. pagamentos;
7. horários;
8. pedido de teste;
9. revisão;
10. publicação.

Deve mostrar progresso, pendências e bloqueios objetivos. Templates por segmento reduzem a configuração inicial. Importações por planilha, CSV, PDF ou imagem devem gerar prévia para revisão; conteúdo extraído por IA nunca será publicado automaticamente.

## Chatbot com IA

O chatbot será opcional e híbrido: a IA interpreta e conversa; as funções da Ogritech executam e validam.

A IA poderá pesquisar produtos, esclarecer dados cadastrados, montar carrinho, sugerir complementos, consultar pedidos, solicitar confirmação e transferir para atendimento humano.

A IA não poderá inventar produtos, preços ou descontos; confirmar disponibilidade sem consulta; calcular o total por conta própria; concluir pedido sem confirmação; confirmar pagamento sem o provedor; garantir informação de alergênicos ausente; ou impedir acesso ao atendimento humano.

O carrinho e o pedido serão registros estruturados. Implementar funções internas para catálogo, disponibilidade, carrinho, entrega, cupom, checkout, pagamento, pedido e escalonamento humano.

Ordem aceita:

1. assistente no cardápio web;
2. homologação de segurança, precisão e custos;
3. WhatsApp oficial somente depois de nova aprovação de provedor, preços, consentimentos e limites.

Controlar tokens, contexto, cache, timeout, idempotência, prompt injection, custo por empresa, franquia/teto mensal, logs seguros e fallback. O custo dos modelos tende a ser pequeno; WhatsApp, provedor, suporte e erros operacionais representam riscos maiores.

## Modelo comercial

- Não cobrar comissão percentual sobre pedidos.
- Preços, franquias e limites devem ser administráveis, não espalhados como constantes no frontend.
- Estrutura sugerida: plano Essencial, plano Profissional, módulo de IA, módulo de WhatsApp e módulos futuros.
- Módulos futuros possíveis: KDS, impressão, PDV, logística, multiunidade, integrações e assinatura de refeições.
- Custos de meios de pagamento, WhatsApp, BSP e logística devem ser transparentes e separados quando aplicáveis.

## Cancelamento

O caminho deve estar no painel em `Configurações > Assinatura > Cancelar`. Pode oferecer pausa, redução de plano, remoção de módulo ou ajuda, mas sempre deve permitir continuar o cancelamento.

O cancelamento deve interromper renovações, informar o fim do acesso, confirmar a operação, preservar o período já contratado quando aplicável, permitir exportação, informar retenção/exclusão, revogar integrações no momento adequado, registrar auditoria e permitir reativação conforme a política. Nunca exigir WhatsApp, ligação, e-mail ou aprovação manual.

## Segurança, privacidade e acessibilidade

- isolamento multiempresa e controle de acesso por função;
- RLS ou controle equivalente, auditoria e validação de webhooks;
- idempotência, rate limiting, uploads validados e segredos fora do frontend;
- proteção contra manipulação de preços, enumeração e pedidos duplicados;
- minimização de dados e consentimento separado e revogável para marketing;
- exportação, exclusão e retenção definida;
- experiência mobile-first, rápida, sem instalação, semanticamente acessível e navegável por teclado;
- visualização do cardápio sem cadastro obrigatório;
- QR Code não deve ser pressuposto como única forma de acesso presencial.

## MVP previsto

O primeiro MVP poderá incluir, após aprovação:

- habilitação do produto por empresa;
- templates dos quatro segmentos;
- catálogo, variações, adicionais, remoções e combos;
- pizza fracionada;
- peso, quantidade, encomenda e agendamento;
- carrinho com cálculo seguro;
- retirada e entrega por bairro ou faixa;
- pedido mínimo, Pix manual e pagamento na entrega;
- painel e estados de pedidos;
- acompanhamento público seguro;
- cupons e relatório básico;
- onboarding, pedido de teste, publicação, exportação e cancelamento autônomo.

Chatbot web é uma entrega posterior do MVP, protegido por feature flag. WhatsApp oficial, pagamento online do consumidor, logística integrada, PDV, KDS, estoque avançado e multiunidade exigem autorização posterior.

## Fora do escopo inicial

- marketplace;
- aplicativo nativo;
- frota própria;
- carteira ou antecipação financeira;
- ERP, PDV ou sistema fiscal completo;
- estoque complexo;
- personalização com código arbitrário;
- grande quantidade de integrações ponto a ponto;
- chatbot irrestrito;
- campanhas sem consentimento;
- publicação direta em produção.

## Sequência futura de execução

1. **Diagnóstico read-only:** arquitetura, conflitos, reutilização, modelo multiproduto, dados, telas, migrations propostas, riscos e custos.
2. **Fundação multiproduto:** soluções contratáveis, módulos, permissões e feature flags, preservando a Agenda.
3. **Catálogo:** núcleo universal e templates.
4. **Carrinho e pedidos:** cálculo seguro, modalidades e painel.
5. **Onboarding e autonomia:** provisionamento, publicação, gestão comercial, cancelamento e exportação.
6. **Chatbot web:** ferramentas internas, limites, custos e transferência humana.
7. **Pagamento online e WhatsApp:** somente com autorização específica.
8. **Beta controlado:** dados fictícios, quatro segmentos, segurança, acessibilidade, desempenho e usuários humanos.
9. **Piloto e produção:** somente com nova autorização explícita.

## Primeira autorização recomendada

Quando o responsável decidir iniciar, a primeira autorização recomendada é apenas para o diagnóstico read-only. O diagnóstico deve apresentar impacto na arquitetura atual, modelo multiproduto, esquema de dados, mapa de telas, fases, arquivos afetados, riscos à Agenda, custos externos e critérios de validação antes de qualquer implementação.

## Condições permanentes de execução

- preservar alterações do usuário;
- não reescrever a aplicação sem justificativa e aprovação;
- não alterar silenciosamente Agenda, autenticação, cobrança ou isolamento;
- não publicar, contratar APIs, enviar mensagens ou aplicar migrations remotas sem autorização;
- testar proporcionalmente ao risco;
- registrar por fase resultado, arquivos, migrations, testes, limitações, riscos e próxima autorização;
- interromper antes de mudanças materiais em arquitetura, cobrança, privacidade, autenticação, escopo comercial ou operação da Agenda.

## Registro de autorização

- 08/09/2026: fundação multiproduto local autorizada e concluída.
- 08/09/2026: ativação administrativa multiproduto local autorizada e concluída.
- 08/09/2026: núcleo universal do catálogo e quatro templates iniciais autorizados e concluídos localmente.
- 08/09/2026: carrinho, adicionais, entrega e pedidos com cálculo seguro autorizados e concluídos localmente.
- 09/09/2026: onboarding retomável, validação objetiva, pedido de teste, revisão e publicação controlada autorizados e concluídos localmente.
- 10/09/2026: contratação multiproduto, gestão de planos e módulos, cancelamento, reativação e exportação pelo proprietário autorizados e concluídos localmente.
- 10/09/2026: assistente web determinístico, feature flag, ferramentas de catálogo e carrinho, confirmação humana, limites e telemetria segura autorizados e concluídos localmente.
- 10/09/2026: adaptador independente de fornecedor, simulador local, avaliações de segurança e precisão e calculadora de custo por estabelecimento autorizados e concluídos localmente.
- 10/09/2026: pesquisa atual de modelos, política de dados, orçamento proposto, critérios de aceite, fallback e plano do piloto controlado autorizados e concluídos localmente, sem conexão externa.
- 10/09/2026: piloto local sintético com OpenAI autorizado e executado; 10 de 10 casos corretos e custo estimado de R$ 0,01, mas ativação pública recusada porque o p95 de 3.201 ms excedeu a meta de 2.500 ms.
- 10/09/2026: caminho híbrido otimizado e aprovado tecnicamente em 20 de 20 cenários, com 19 respostas locais, uma chamada ao modelo, p95 agregado de 1 ms e custo inferior a R$ 0,01; ambientes remotos continuam desautorizados.
- 10/09/2026: contrato local da homologação híbrida concluído com segredo isolado, opt-in por estabelecimento, aviso versionado, kill switch e limites zerados; 109 testes Node, 442 asserções pgTAP, replay de 57 migrations e lint dos schemas aprovados; nenhuma publicação ou chamada externa foi realizada.
- 10/09/2026: Fase 6G concluída no staging com 57 migrations sincronizadas, segredos no cofre e função publicada; gate global permaneceu fechado e os testes remotos comprovaram fallback determinístico sem chamada paga.
- 10/09/2026: Fase 6H executada com sete chamadas sintéticas ao `gpt-5.6-luna`; após corrigir a autorização da telemetria, a chamada final passou de ponta a ponta. A estimativa conservadora, baseada na entrada observada e no limite máximo de saída, ficou abaixo de R$ 0,01, mas o p95 aproximado de 5.739 ms manteve a ativação pública reprovada. Gate fechado e demonstração removida ao final.
- 10/09/2026: Fase 6I reduziu prompt e saída e desacoplou a telemetria da resposta com tarefa de fundo. Três chamadas sintéticas válidas retornaram HTTP 200 em 4.568, 3.471 e 2.726 ms; o p95 melhorou para 4.568 ms, mas ainda reprova a meta pública de 2.500 ms. Staging e produção terminaram fechados, sem demonstração residual.
- 10/09/2026: Fase 6J decidiu manter `gpt-5.6-luna` no tier padrão apenas como fallback opcional para mensagens ambíguas. A rota determinística continua prioritária e todas as ações críticas permanecem fora da IA. Timeout do provedor reduzido para 6 segundos e publicado em staging com o gate fechado; nenhuma chamada paga foi realizada.
- 10/09/2026: Fase 6K testou cinco chamadas `priority`: todas confirmaram o tier e passaram funcionalmente, com mediana de 2.645 ms, porém p95 de 6.210 ms. O ganho não foi confiável e não justifica o prêmio de preço; tier Default restaurado, gates fechados e ativação pública reprovada.
- 10/09/2026: Fase 6L encerrou a investigação de latência e consolidou o motor determinístico como experiência oficial do assistente. A integração externa permanece preservada, mas desativada, sem autorização de chamadas, cobrança ou produção; qualquer reativação exige nova autorização explícita.
- 10/09/2026: Fase 7A preparou localmente o beta controlado dos quatro segmentos, com massas fictícias, roteiro humano, critérios de aceite, interrupção e limpeza; o beta não foi executado e nenhum ambiente remoto foi alterado.
- 10/09/2026: Fase 7B aprovou 8 de 8 cenários no navegador local — quatro segmentos em desktop e celular — sem erros de JavaScript, overflow, chamadas externas, banco remoto, IA paga ou participantes humanos.
- 10/09/2026: Fase 7C preparou roteiro neutro, ficha anônima e consolidação do beta humano local. Nenhum participante foi contatado ou identificado e nenhuma sessão foi agendada.
- 16/09/2026: Fase 7D concluiu quatro jornadas com três participantes, média 10/10, status `Recebido` em todos os segmentos e zero incidente crítico. Três problemas locais foram corrigidos e retestados; produção permanece desautorizada.
- 16/09/2026: Fase 7E consolidou localmente o inventário, os gates de segurança, a massa sintética, o aceite e o rollback da futura homologação em staging. Nenhuma alteração remota foi realizada; Fase 7F e produção permanecem desautorizadas.
- 16/09/2026: Fase 7F aprovou oito jornadas no staging, cobrindo quatro segmentos em desktop e celular, com oito pedidos únicos em `Recebido`, preços íntegros, RLS ativo, IA desligada e zero erro na rodada final. Três problemas de interface foram corrigidos e toda a massa sintética foi removida; produção permanece desautorizada.
- 16/09/2026: Fase 7G registrou `GO` técnico para preparação de um piloto privado e `NO-GO` operacional até o preenchimento dos gates humanos, jurídicos e operacionais. O pacote limita a proposta a uma empresa e preserva contratação, implantação, exportação e cancelamento autônomos com suporte opcional; nenhum contato ou ambiente foi alterado.
- 16/09/2026: Fase 7H foi iniciada com a seleção privada de uma confeitaria, registrada nos artefatos versionáveis apenas como `PILOTO-CARDAPIO-01`. Um de onze gates está concluído; nenhum contato, publicação ou preparação de ambiente foi realizado.
- 17/09/2026: Fase 7I publicou a prévia privada exclusivamente no staging, concluiu os onze gates de entrada e validou exportação e despublicação, sem liberar produção.
- 17/09/2026: Fase 7J iniciou o piloto privado `PILOTO-CARDAPIO-01` exclusivamente no staging, com término automático em 01/10/2026 às 18h44, limite de uma empresa, 25 consumidores e 100 pedidos. IA paga, mensagens automáticas, renovação e produção permanecem bloqueadas.
- 19/09/2026: Fase 7K-A iniciou o saneamento e a consolidação do repositório, reconciliando o estado documental com o piloto ativo e separando evidências locais geradas do conteúdo seguro para versionamento.
- 19/09/2026: Fase 7K-B implementou métricas agregadas no painel, protegidas por autenticação, vínculo com o estabelecimento e RLS. O resumo acompanha limites, estados, possíveis duplicidades e integridade de valores sem retornar dados pessoais.
- 25/09/2026: Fase 7K-C encerrou antecipadamente o piloto privado após atingir o limite revisado de 15 pedidos. A exportação privada foi gerada fora do repositório, o cardápio foi despublicado, novas entradas foram bloqueadas e o monitor automático foi removido. Nenhum dado legítimo foi excluído.

O estado vigente é o piloto privado encerrado na Fase 7K-C. O Cardápio permanece despublicado no staging, sem renovação automática. Produção, IA paga e mensagens automáticas continuam sem autorização; uma nova publicação exige nova decisão explícita.
