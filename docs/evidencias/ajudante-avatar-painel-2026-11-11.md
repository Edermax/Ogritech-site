# Ajudante do painel pelo avatar — 11/11/2026

O controle Ajudante Ogritech abre o avatar flutuante existente em um modo específico de orientação do painel. O bloco anterior com endereço mailto foi substituído por um botão com imagem, identificação do diálogo e estado expandido. Os outros convites de ajuda da configuração inicial e da assinatura também usam esse mesmo ajudante.

O modo do painel tem orientações sobre pedidos, produtos/fotos/preços, configurações/horários, publicação, notificações e instalação. Os atalhos só acionam abas existentes e disponíveis ao usuário. O formulário de contato comercial não é exibido nesse modo; a criação e o envio de solicitações de contato têm guardas explícitas contra execução no contexto do painel. Não há chamada de IA ou serviço externo para responder às orientações. A versão comercial do site mantém seu contexto próprio.

A abertura pelo botão e pelo avatar usa uma única instância. Fechar ou pressionar Escape atualiza o estado expandido e devolve o foco. No celular o avatar fica acima da navegação inferior e o diálogo respeita a área visível da tela.

Validação: 359 testes Node passaram. A jornada completa no Edge em 390×844 e 1440×1000 passou, incluindo abertura pelo botão, fechamento por Escape, retorno de foco, reabertura pelo avatar e navegação da ajuda para Produtos. O conteúdo do ajudante foi verificado sem formulário, link mailto ou ação de solicitar contato, e nenhuma requisição public_submit_assistant_callback foi observada. Não houve erros JavaScript nem escrita em produção nos testes. Os dados e as permissões do estabelecimento não foram alterados.
