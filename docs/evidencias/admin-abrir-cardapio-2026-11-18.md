# Abrir cardápio público na administração

Na área Negócios, a ação “Abrir cardápio” aparece imediatamente após “Abrir painel” e permanece fora de “Mais ações”. A ação usa o slug salvo em `online_menus`, vinculado pelo `barbershop_id`, e abre a página pública em outra aba. A disponibilidade do botão não depende do plano, da assinatura ou do status do negócio.

Quando o cadastro não possui cardápio configurado, o clique informa essa condição. A abertura não muda a sessão administrativa, não ativa o modo de operação de um negócio e não altera a publicação do cardápio. A página pública continua usando suas verificações existentes.

Validação local:

- `npm run check`: 43 scripts, 12 páginas e 112 migrations conferidos.
- `node --test tests/admin-business-navigation.test.mjs`: dois testes aprovados.
- Navegador Edge/Playwright: 24 cenários aprovados, combinando Essencial, Completo e Encomendas; temas claro/escuro; larguras de 320, 390, 768 e 1440 pixels.
- Conferidos destino de cada negócio, nova aba sem `opener`, sessão administrativa preservada, clique no ícone, ausência de rolagem horizontal e de erros JavaScript.
- Conferidos negócio suspenso e aviso para negócio sem cardápio configurado.
- Consulta remota somente de leitura confirmou três cardápios vinculados a negócios não arquivados, cobrindo dois valores de plano, sem slug ausente. Não houve alteração remota.

As interações no navegador utilizaram dados sintéticos e interceptaram a página de destino; não representam homologação dos produtos ou pedidos reais do cardápio. Capturas, script e resultados estão no diretório local `outputs/admin-abrir-cardapio-20261118` do workspace.

Estado: implementação e validação locais concluídas, sem publicação em produção. Base: `origin/main`, commit `83be229`.

## Preparação da publicação — 18/11/2026

Usuário autorizou publicar as melhorias recentes. Estoque e correções anteriores já estão em `main` no commit `83be22975c26c14f56f92b8a84bf7224fe8c4baa`; este lote publica apenas a ação administrativa e sua fixture.

`npm ci --ignore-scripts` instalou as versões do lockfile nesta cópia isolada. A validação completa `npm run validate` passou: checagem estática, 112 migrations classificadas e 490 testes Node, sem falhas. Os 24 cenários de navegador foram novamente aprovados, sem mutações de produção. O diff passou na conferência de whitespace e o código candidato está no commit `3d84fc6d65a0e1567481301e87772f94609b726e`.

Revisão: [PR #153](https://github.com/Edermax/Ogritech-site/pull/153). Aguardar CI e publicação do Pages; a preparação não comprova implantação.

O CI inicial identificou uma fixture antiga da suíte de planos sem o método de consulta `in` usado pela nova leitura de cardápios. O simulador de `scripts/split-offers-browser.mjs` foi alinhado à consulta e passou nas 22 verificações locais, sem erros JavaScript e sem requisições externas. O código da aplicação não precisou de correção adicional. O workflow Validate também recebeu acionamento manual para executar os mesmos três jobs quando os eventos automáticos não iniciarem uma execução.
