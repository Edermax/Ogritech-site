# Ícone pequeno da notificação — 14/11/2026

O usuário aprovou substituir o quadrado do cabeçalho pelo símbolo monocromático da Ogritech, com fundo transparente. O badge anterior apontava para `ogritech-brand-symbol.png`, imagem de 512×512 com todos os pixels opacos. Ao usar sua máscara, o Android recebia uma área quadrada preenchida.

A notificação agora referencia `ogritech-notification-badge.png`: PNG RGBA de 96×96 com símbolo monocromático, margens transparentes e abertura central transparente. A cor exibida é definida pelo sistema. O ícone grande à direita permanece o mesmo. A fonte monocromática foi preparada com a ferramenta de imagem e está em `assets/branding/notification-badge-source.png`; `node scripts/build-notification-badge.mjs` prepara o arquivo de distribuição sem API externa.

`sw.js` importa a nova versão do worker de push, pré-carrega o badge e atualiza o cache do shell para v38. O cache de contexto e a assinatura de push existentes são preservados.

Validação local: 427 testes Node aprovados, estática e política das 99 migrations. O teste do PNG verifica dimensões, canal alpha, margens e centro vazios, conteúdo monocromático e ausência de um bloco opaco. O teste do worker verifica o badge usado no evento push. A prévia renderizada em `outputs/notification-badge-preview.png` é uma simulação visual; não é captura de um aparelho Android. Nenhuma notificação real foi enviada nos testes.

Após a publicação, o painel deve ser reaberto para atualizar o service worker. O novo badge será usado nas próximas notificações. Publicação segue PR, CI e GitHub Pages; não há alteração de banco ou dos pedidos.
