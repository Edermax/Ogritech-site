# Vitrine e tipos de negócio — implementação local de 17/11/2026

Autorização: o usuário aprovou o prompt de adequação de público, divulgação, cadastro, páginas públicas e painéis e autorizou implementar **localmente**. Esta entrega não publica frontend, migrações ou funções em ambientes remotos.

Branch: `feat/vitrine-segmentos-local-20261117`. Diretório: `work/vitrine-segmentos-local-20261117`. Base: `56e58008cfd37961ab83e7351fb00f3bab3a93f7`, equivalente às alterações de imagens publicadas no PR #147. As outras cópias de trabalho foram preservadas.

## Resultado

- Posicionamento da home: “Sua vitrine online, pronta para compartilhar”. Exemplos de alimentação, artesanato e colecionáveis; diretório de 15 segmentos amplos com links que preselecionam a atividade.
- Taxonomia compartilhada em `catalog-profiles.js`: 19 identificadores, contando as especializações existentes de alimentação. Cadastro, configuração do cliente, contato e administração utilizam as mesmas opções e rótulos.
- Alimentação apresenta “Cardápio”; artesanato/personalizados, “Catálogo”; demais produtos, “Vitrine”. A classificação reconhece os valores antigos e não reescreve cadastros durante a leitura. O modelo já escolhido conserva prioridade para negócios existentes.
- O cadastro preserva segmento e periodicidade ao navegar entre ofertas. “O que você vende?” informa que a escolha poderá ser alterada posteriormente.
- O painel do cliente permite salvar a atividade em Atendimento/apresentação. A alteração exige gestão do próprio negócio e acesso ao produto, recusa códigos desconhecidos, protege alterações ainda não salvas e preserva o catálogo.
- A administração usa rótulos legíveis, pesquisa por atividade e agrupamento/filtros que reconhecem os valores antigos. A edição administrativa existente sincroniza a apresentação no servidor.
- A página pública recebe a atividade persistida e ajusta título, pesquisa, navegação e textos de interface. Conteúdo autoral do comerciante fica fora da substituição de terminologia. Colecionáveis e usados recebem orientação para confirmar condição e disponibilidade com o vendedor.
- Formulário de contato, acesso, rotas antigas de redirecionamento, tela de assinatura, assistente, manifesto e cache foram revisados. Os valores de referência estáticos da assinatura também foram alinhados aos planos atuais; valores de contratos existentes continuam vindos do servidor. O formulário de contato tinha uma referência antiga a “Ogritech Cardápio” que falhava ao carregar o nome atual; as perguntas agora são compartilhadas entre os planos.
- Quatro ilustrações SVG originais, criadas em código, representam bolsa, caneca, miniatura e medalha. Origem em `assets/landing-menu/ilustracoes-vitrine-origem.json`. As imagens originais de bolo e brigadeiros continuam na demonstração de alimentação.

## Persistência e compatibilidade

A migração `20261117201510_catalog_business_segments.sql` adiciona um mapeamento explícito de atividades e a RPC `set_catalog_business_segment`. A função pública usa `SECURITY INVOKER`; a implementação privada valida autenticação, gestão e acesso ao produto antes de atualizar o negócio. A sincronização ocorre dentro da transação e atualiza somente o negócio correspondente em `saas_clients`, `barbershops`, `business_settings` e o modelo do catálogo existente. Alterações ficam registradas na auditoria.

Não há migração em massa dos cadastros existentes, recriação de catálogo ou alteração das URLs. A escolha explícita de atividade ajusta o modelo sem reaplicar categorias ou exemplos. A personalização de modelo que já existia continua disponível.

Foram mantidos Essencial de R$ 9,90/mês ou R$ 99,00/ano, Completo de R$ 29,90/mês ou R$ 299,00/ano e o teste único de 14 dias. A integração de pagamentos e seus fluxos de autorização não foram alterados. Os arquivos de termos e privacidade permanecem idênticos à base.

## Verificação

- Suíte Node: 490 testes aprovados, sem falhas.
- Replay limpo em Postgres isolado, sem rede e sem portas publicadas: 111 migrações e 35 arquivos SQL, com 1.000 asserções aprovadas. Todos os testes usam transações e rollback.
- Os 53 testes novos de banco cobrem as 19 atividades, seleção antes da criação do catálogo, negação de acesso entre empresas e para funcionário sem gestão, validação de códigos, preservação integral da assinatura, prazo do teste, produtos, link e configurações, sincronização administrativa e auditoria.
- Jornadas de catálogo: 27 verificações no navegador, sem erros JavaScript ou chamadas externas. Incluem preços/ciclos, seleção do segmento, envio sintético de cadastro, pedidos/WhatsApp por plano, orçamento, alteração de atividade e atualização dinâmica dos textos.
- Navegação administrativa: oito cenários de tamanho/tema com dados fictícios.
- Prévia HTTP local: 14 verificações em 390/1440 px, cobrindo home, cadastro, três perfis públicos, troca de atividade no painel, administração e contato, sem erros nem chamadas externas.
- Checagem estática e classificação de migrações aprovadas. A nova migração permanece retida para publicação remota; sua autorização é apenas local.

Evidências detalhadas, logs e capturas ficam em `outputs/catalog-review/`, `outputs/vitrine-preview/` e `outputs/` desta cópia. O replay final está também em `../../outputs/vitrine-db-final.log`.

## Conferência local

Execute `npm run preview:vitrine` e abra `http://127.0.0.1:8107/__preview/`. O índice permite conferir a página principal, cadastro, cardápio, catálogo, vitrine e os dois painéis.

O servidor atende somente em loopback e usa contas, respostas de API e produtos fictícios, sem conectar a bancos remotos. Ele serve exclusivamente para revisão local; não substitui a migração no ambiente de uma futura publicação. Os dados simulados retornam ao exemplo inicial ao recarregar a página.

Para repetir as verificações da prévia, com o servidor iniciado: `npm run test:vitrine-preview`. Para as jornadas sintéticas: `npm run test:catalog-browser`. O script de banco deve continuar direcionado exclusivamente ao contêiner isolado de validação.

O escopo continua sendo produtos físicos e encomendas com os recursos atuais. Não foram adicionados marketplace, agendamento de serviços, estoque avançado, reserva automática de peças únicas ou frete nacional.
