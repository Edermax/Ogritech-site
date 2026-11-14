# Produtos e identidade visual do cardápio — 14/11/2026

## Comportamento

- Produtos exibem Editar, Ocultar produto/Reativar produto e Excluir produto diretamente. A ordenação continua disponível, sem o menu Mais ações.
- Ocultar/reativar é uma ação operacional imediata no catálogo publicado. Mantém produto, preços, imagens, adicionais e metadados; sincroniza a visibilidade no rascunho sem publicar outras edições.
- Excluir mantém o fluxo existente: confirmação explícita e, em cardápios publicados, remoção no rascunho até a publicação.
- Produtos existentes apenas no rascunho também podem ser ocultados, sem publicação implícita.
- A criação de produtos respeita `active` e `available`, inclusive na reconstrução dos IDs ao publicar um rascunho. Um produto oculto permanece oculto após a publicação.
- Confirmação, Pix e acompanhamento usam a cor de destaque escolhida pelo cliente. Textos de ação usam uma variante com contraste, preservando a tonalidade da marca.
- O acompanhamento recebe slug e identidade publicada do estabelecimento a partir do próprio pedido protegido por referência/token, inclusive em links antigos sem parâmetro empresa. O cabeçalho identifica o estabelecimento.

## Segurança e banco

`set_menu_item_visibility` usa wrapper público invoker e implementação privada com verificação de identidade, gestor e acesso ao produto. Os bloqueios seguem a ordem cardápio → rascunho → produto. A operação restringe o produto à empresa e ao cardápio.

Uma política UPDATE restritiva impede alterações diretas de produtos publicados pelo navegador. Edições diretas anteriores à publicação mantêm suas permissões existentes. O trigger permite apenas mudanças de visibilidade pelo fluxo autorizado; outras alterações publicadas continuam exigindo rascunho.

Staging e produção possuem 101 migrations, sem pendências ou reparos no histórico:

| Migration | Arquivo local | Staging | Produção |
| --- | --- | --- | --- |
| menu_product_visibility | 20261114200329 | 20261114201932 | 20261114202127 |
| menu_tracking_branding | 20261114200459 | 20261114201933 | 20261114202129 |

Verificações remotas confirmaram bloqueio anônimo, proteção do token e instalação da política restritiva. Produção manteve os mesmos 15 produtos, todos visíveis, antes e depois das migrations. Nenhum produto real foi ocultado nos testes.

Advisors de segurança não apontaram novas permissões inseguras. Permanecem os avisos já existentes sobre tabelas privadas sem políticas e proteção contra senhas vazadas desativada.

## Validação

- `npm run validate`: 427 testes aprovados.
- pgTAP local: 29 arquivos, 769 verificações; inclui 23 casos da visibilidade, autorização, sincronização do rascunho e persistência após publicação.
- `scripts/menu-theme-browser.mjs`: 18 cenários em 320, 390 e 1440 px, duas ofertas e três cores de destaque (rosa, branco e preto); cópia Pix automática/manual, confirmação e acompanhamento, sem erros ou transbordamento.
- `scripts/panel-navigation-browser.cjs`: quatro larguras, claro/escuro, ocultar/reativar, preservação de dados, cancelamento da exclusão, falha simulada e permissões de funcionário. Revisão visual em 320, 390, 768 e 1440 px.
- `scripts/panel-theme-browser.cjs`: 46 cenas, contraste no escuro e restauração do claro.

As verificações de navegador usam fixtures isoladas. Não enviam pedidos reais nem alterações aos catálogos dos estabelecimentos.

## Reversão

Reverter a publicação do frontend para o commit anterior `7c1dbb4362bb53fac7c96ce4d48f75751279e8e0`. As migrations são compatíveis com o frontend anterior e podem permanecer instaladas. Há uma cópia local das definições anteriores em `outputs/visibility-production-rollback.sql` para uma reversão de banco, se necessária, após restaurar a interface.
