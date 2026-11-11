# Instalar o app: solicitação e instalador nativo — 11/11/2026

O botão mantém o nome Instalar o app. Quando o navegador fornece a instalação nativa, o clique chama diretamente o mesmo mecanismo usado anteriormente: beforeinstallprompt.prompt, com a API navigator.install como melhoria progressiva quando disponível.

Se o navegador ainda estiver preparando a oferta, o clique registra a solicitação e apresenta o estado Preparando instalação. Ao chegar o evento nativo, o pedido é encaminhado automaticamente somente enquanto a ativação do usuário ainda é válida. Se ela expirar, o diálogo habilita a confirmação Instalar o app para um novo clique. Fechar o diálogo cancela a solicitação pendente; não deve surgir um instalador posteriormente por causa de uma solicitação cancelada. As alternativas manuais ficam recolhidas em Outras opções de instalação, em vez de serem a primeira ação do botão.

Verificação real antes da alteração em uma sessão normal do Edge 157, sem modo privado: manifesto sem erros, nenhum impedimento de instalação reportado pelo navegador e evento nativo beforeinstallprompt recebido. Isso confirma que a instalação da PWA continua disponível em navegador compatível.

O controlador atualizado foi então executado sobre a origem de produção em um perfil de teste normal, substituindo apenas os arquivos pwa.js e pwa.css pelas versões locais. O evento nativo real foi recebido e o método nativo original foi invocado por um clique com ativação de usuário válida, sem erro. O evento e o método não foram substituídos por respostas simuladas. A confirmação final do sistema não foi aceita e nenhum aplicativo foi instalado no computador durante o teste. Não foi verificada instalação em um celular físico.

362 testes Node passaram. Os testes específicos cobrem o evento antecipado, pedido antes da disponibilidade, ativação ainda válida, ativação expirada, cancelamento, repetição, app já instalado e ausência de indicação falsa de sucesso. A instalação só é apresentada como concluída após a confirmação appinstalled do navegador.

Sites não podem instalar silenciosamente nem obrigar um ambiente sem suporte a abrir um instalador. A confirmação permanece sob controle do navegador e do dispositivo. Referências: [instalar aplicações web](https://developer.chrome.com/docs/modern-web-guidance/guides/pwa/install-web-app), [critérios de instalação](https://web.dev/articles/install-criteria).
