# Cardápio público — consistência do tema claro

Correção local de 14/11/2026, na cópia atualizada `work/publicar-cardapio-encomendas-20261113`, baseada em `872cf8e`. A cópia `work/Ogritech-site` contém alterações locais anteriores e foi preservada.

A folha `cardapio/catalog.css` forçava `color-scheme: dark` na sacola, na personalização, no checkout, no assistente e na confirmação, além de fundos escuros e textos claros fixos. Essas superfícies agora usam as variáveis de fundo, texto, divisórias e realce do catálogo. Os botões principais preservam a cor da marca e o contraste calculado. Avisos de pagamento usam fundo amarelo claro e texto escuro; sombras foram suavizadas e o foco de teclado permanece visível.

`cardapio/index.html` passa a solicitar `catalog.css?v=20261114.1`. Não houve alteração de lógica de pedido ou de banco.

## Validação

- `node scripts/menu-theme-browser.mjs`: 12/12 cenários aprovados, cobrindo Cardápio e Encomendas, larguras de 390 e 1440 pixels, cores rosa/branca/preta e preferências de sistema claras/escuras. Foram verificadas 732 combinações de texto/fundo com contraste mínimo de 4,5:1, superfícies claras e ausência de transbordamento horizontal.
- Fluxos reais do frontend com serviços simulados: assistente e sugestões, personalização e opção selecionada, sacola e alteração de quantidade, link de WhatsApp, checkout, cálculo da entrega, confirmação com Pix e acompanhamento. Nenhuma requisição externa ou erro JavaScript.
- O acompanhamento já recebe a camada clara de `site-theme.css`: foi validado e não precisou de alteração.
- 21/21 testes aprovados em `menu-branding`, `menu-cart-orders`, `menu-checkout-retry`, `menu-whatsapp-summary` e `product-offers`.
- `npm run check`, `node --check scripts/menu-theme-browser.mjs` e `git diff --check` aprovados.
- Imagens de sacola, personalização, assistente, checkout, confirmação e acompanhamento inspecionadas visualmente.

Relatório completo e capturas: `outputs/menu-light-theme/`. Validação local com fixtures em memória; não houve publicação, pedido real ou alteração remota.

## Preparação da publicação autorizada

O usuário solicitou a publicação após revisar a correção. A branch `codex/cardapio-tema-claro-20261114` parte da revisão atual de produção `fde2207`, em `work/cardapio-tema-claro-20261114`, e contém somente os dois arquivos de frontend, o teste de navegador e esta evidência. `npm run validate` foi aprovado nessa cópia: 425/425 testes, checagem estática e classificação das 98 migrations. Nenhuma migration será aplicada nesta publicação.

A entrega segue pull request, CI e publicação automática do GitHub Pages a partir de `main`. A verificação após a entrega deve confirmar `catalog.css?v=20261114.1` e os estilos claros no navegador. Se necessário, o rollback consiste em reverter o commit de frontend e aguardar a republicação pelo mesmo fluxo.
