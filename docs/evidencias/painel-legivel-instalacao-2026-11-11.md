# Painel legível e instalação direta — 11/11/2026

O padrão visual aprovado é “Blocos com descrição”: navegação em ciano com indicação de seleção, nomes maiores e descrição de cada área. Ações principais usam amarelo, ações secundárias usam preenchimento escuro e contorno visível, e ações destrutivas têm tratamento vermelho. Controles desativados preservam leitura e usam contorno tracejado. A folha panel-controls.css fica restrita ao painel autenticado; não altera nomes, preços, fotos nem o cardápio público.

A jornada isolada no Edge passou em 390×844 e 1440×1000, incluindo criação, configuração, catálogo, revisão, publicação, notificações e atendimento como funcionário. A checagem da aba selecionada exige contraste de texto de pelo menos 4,5:1 inclusive com o mouse sobre ela, texto de pelo menos 16 px e alvo de pelo menos 44 px. Ambos os tamanhos passaram sem erro JavaScript nem estouro horizontal.

O antigo “Criar app” mostrava o mesmo rótulo mesmo quando o navegador só permitia abrir instruções. Agora o controlador é carregado no início da página e captura beforeinstallprompt antes do restante do painel. Havendo um prompt disponível, ou a API navigator.install, o botão mostra “Instalar app” e chama o instalador diretamente no clique. Sem esse mecanismo, mostra “Como instalar o app”, com instruções específicas ao dispositivo. Não há instalação silenciosa nem promessa de instalação direta em todos os navegadores.

O manifesto ganhou id explícito /painel/, correspondente à identidade anterior calculada pelo start_url, mantendo janela standalone e os ícones existentes. A aceitação do convite de instalação não é tratada como sucesso: o botão aguarda a confirmação appinstalled. Cancelamentos não abrem automaticamente um tutorial e não são contabilizados como instalação. A versão já instalada não oferece uma nova instalação.

Os testes do controlador cobrem captura antecipada, prompt nativo, API Web Install, cancelamento, repetição, fallback e app já instalado. Um teste adicional no Edge executou o pwa.js real com somente o instalador do sistema substituído e confirmou que a chamada mantém a ativação do usuário. Nenhum aplicativo foi instalado no computador do usuário durante os testes.

Antes da alteração, a inspeção de produção confirmou manifesto sem erros e ícones com dimensões corretas de 192 e 512 px. A sessão automatizada privada não permite instalar apps; essa restrição do navegador não foi tratada como defeito do manifesto.

Referências de comportamento: [instalação de aplicativos web](https://developer.chrome.com/docs/modern-web-guidance/guides/pwa/install-web-app), [instalação e limitações de plataforma](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
