# Conta e central de notificações — 11/11/2026

## Resultado

- “Alterar senha” e “Sair da conta” foram movidos do cabeçalho para “Assinatura e dados”, em “Acesso e segurança”. Os handlers existentes de autenticação e troca de senha foram preservados.
- No espaço liberado há um sino com contador de não lidas. A central abre em diálogo acessível, com fechamento por botão, Escape ou fundo e retorno de foco ao sino.
- Os pedidos recentes vêm da tabela existente `menu_orders`, filtrada pelo estabelecimento e excluindo testes. A central não consulta nomes, telefone, endereço ou e-mail do consumidor. Tocar no pedido marca a atualização como lida e abre a operação; não confirma, rejeita ou modifica o pedido.
- A leitura é guardada por ambiente, estabelecimento e usuário neste dispositivo. Não representa confirmação de atendimento nem sincronização de leitura entre dispositivos. Uma mudança de status do pedido volta a aparecer como atualização não lida.
- Pedidos são consultados a cada 30 segundos com o painel visível, com timeout e intervalo maior em caso de erro. O carregador do catálogo compartilha seu snapshot com a central para evitar consultas redundantes. Últimos dados válidos são preservados após falha.
- Comunicados da Ogritech usam o arquivo público `platform-notices.json`, inicialmente vazio: nenhum aviso fictício foi publicado. Há também uma área permanente de informações com acesso ao Ajudante Ogritech.
- Funcionários acessam “Minha conta” para senha e saída. Os dados da assinatura continuam restritos ao proprietário. A seção da conta fica acessível mesmo quando o carregamento do cardápio falha.
- Ao sair, a central cancela os próximos ciclos e descarta respostas de consultas anteriores. As notificações push existentes continuam independentes e só são ativadas por escolha do usuário.

## Comunicados

O feed versionado admite `id`, `title`, `body`, `published_at` e `expires_at` opcional, em UTC. Comunicado futuro, expirado ou malformado é descartado. Texto é renderizado literalmente; o feed não aceita HTML ou ações externas. Alterar a data de publicação gera uma nova atualização para fins de leitura. O conteúdo é público e deve conter somente informações gerais da plataforma, sem dados de clientes.

Este escopo não adiciona um editor de comunicados ao administrador. Os comunicados são publicados pelo mesmo fluxo de revisão e implantação dos arquivos do site.

## Verificação

- 375 testes existentes passaram e cinco novos testes de runtime passaram: isolamento da leitura por usuário/negócio/ambiente; abrir pedido sem alterar status; preservação após erro; validação de comunicados; descarte de resposta após logout.
- Ensaio de navegador com HTML, estilos, Auth e controladores reais; backend e autenticação simulados localmente. Proprietário e funcionário em 390×640, 768×800 e 1440×900.
- Verificados posicionamento do sino, diálogo dentro da tela, leitura persistente após recarregar, pedido novo e acesso ao atendimento, comunicado em texto literal, exclusão de aviso futuro/expirado, recuperação de erro, restrição de assinatura, conta acessível após falha de carga, abertura do diálogo de senha e logout.
- Nenhuma escrita em produção, senha alterada ou permissão de notificação solicitada durante o ensaio. Relatório e capturas locais em `outputs/panel-notifications/`.
- Sem mudança de banco, política de acesso no servidor, dependência ou fluxo financeiro.
