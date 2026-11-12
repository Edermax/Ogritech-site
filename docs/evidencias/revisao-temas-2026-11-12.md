# Revisão dos temas do painel — 12/11/2026

O responsável informou inconsistências nos temas após a publicação do PR #105. A revisão reproduziu texto quase branco sobre fundo branco nos botões de recusa e retirada do cardápio do ar, além do cabeçalho/balão do Ajudante Ogritech. O aviso de cardápio não publicado também mantinha fundo claro no escuro.

## Causa e correção

As regras antigas do tema claro agrupavam IDs dentro de `:is()`. Essa especificidade fazia os fundos claros vencerem algumas regras do escuro. O ajudante também possuía superfícies claras fixas fora do espaço principal do cardápio.

A correção fica em seletores condicionados a `html[data-panel-theme="dark"]`, ajustando ações neutras, estados desabilitados, aviso de rascunho e superfícies/ações do ajudante. As folhas `panel-controls.css` e `admin-theme.css` permanecem intactas; o tema claro, a identidade dos cardápios públicos, nomes, fotos e dados não são alterados. A versão da folha escura é atualizada nas duas páginas para invalidar caches.

## Verificação

- `npm run validate`: 399 testes aprovados.
- `npm run test:panel-theme-browser`: 38 cenas em 390 e 1440 px, com os módulos e o HTML reais e dados sintéticos. Inclui conta/assinatura, senha, pedidos, configurações, produtos, publicação, botões desabilitados, comprovante, revisão, ajudante e resposta, notificações lidas/não lidas, relatório, rascunho e administração.
- Em cada cena, mede contraste de texto e procura superfícies claras indevidas no escuro; verifica também igualdade dos estilos computados ao retornar para o claro. Prévia de identidade do cardápio e área de QR Code são preservadas como conteúdo, sem impor as cores do painel.
- A preferência escura persiste após recarregar; a seleção explícita de Claro restaura o tema original.
- Reprodução anterior: contraste de aproximadamente 1,1:1 nos botões e 1,05:1 no título do ajudante; as cenas corrigidas passam no critério automatizado de 4,5:1 para texto normal e 3:1 para texto grande. Textos em controles desabilitados são excluídos dessa exigência de contraste; seus fundos continuam verificados.
- Capturas e resultados em `outputs/panel-theme-review/`, com exemplos fictícios. A auditoria de cores complementa a conferência visual e não constitui certificação completa de acessibilidade.

O teste usa as mesmas fixtures do teste de operações do lojista, exportadas sem executar o cenário principal durante importação. Um job próprio no CI executa a revisão dos temas e guarda as capturas como artefato, prevenindo a repetição dessas falhas. Não há alterações no banco nem nas funções de produção.
