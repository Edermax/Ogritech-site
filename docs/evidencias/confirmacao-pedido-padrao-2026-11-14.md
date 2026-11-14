# Confirmação de pedido no padrão Ogritech — 14/11/2026

A confirmação herdava as cores personalizadas do estabelecimento, com fundo rosa, tons marrons e alertas amarelos, enquanto as demais telas utilitárias usam o tema institucional claro. O usuário solicitou alinhar estilo, diagramação e cores ao restante do projeto.

O componente agora compartilha os tokens de `site-theme.css` por meio da classe local `ogri-order-ui`. `order-confirmation.css` organiza a confirmação em cabeçalho compacto, código e total, situação do pagamento, ações e seção de Pix. As superfícies são brancas e cinzas, com ciano, bordas discretas, tipografia do sistema e botões no padrão das telas Ogritech. A identidade do estabelecimento permanece no catálogo.

O Pix conserva o valor, o código, a cópia e as orientações de confirmação. Os links de WhatsApp e acompanhamento permanecem com os mesmos destinos e dados do cliente. As regras de pedido, entrega, privacidade e agendamento não foram alteradas. Nenhuma alteração de banco.

## Validação

- `npm run validate`: 427 testes Node, estática e política das 99 migrations aprovados.
- `node scripts/menu-theme-browser.mjs`: 18 cenários aprovados em 320, 390 e 1440 pixels, com três cores de marca e as duas ofertas. Foram verificadas 1.098 combinações de contraste, sem erro JavaScript, transbordamento horizontal ou chamada externa.
- O teste verifica que o fundo da confirmação permanece branco e a ação principal ciano, independentemente da cor do estabelecimento. Valida o Pix Copia e Cola e o botão de cópia, o conteúdo do WhatsApp e o acompanhamento do pedido.
- Capturas em `outputs/menu-light-theme/success-*.png` inspecionadas. A suíte passa a executar no CI e arquivar as capturas junto à revisão de temas.
- CSS e script versionados para publicação. O pacote de release inclui os estilos compartilhados e o componente de confirmação.
