# Personalização do cardápio — Diniz Doces — 14/11/2026

Revisão com o catálogo público real da Diniz, obtido pela RPC anônima sem
consultar pedidos ou clientes. Há produtos com dez opções de tamanho e até
dezoito recheios. A tela anterior apresentava uma lista extensa sem o tamanho
escolhido, contador ou total visível durante a personalização.

O catálogo mantém a paleta, a identidade visual, as imagens e a organização
geral. Produtos personalizáveis recebem ação de largura inteira, “Personalizar
pedido” ou “Personalizar solicitação”, e o seletor informa quantas opções de
tamanho/variação estão disponíveis.

A personalização compartilhada agora apresenta:

- Produto, tamanho selecionado e quantidade no cabeçalho.
- Etapas numeradas, indicação de obrigatório/opcional, limites e contador.
- Opções com estado selecionado mais evidente; duas colunas no computador.
- Busca nos grupos com mais de oito opções, preservando escolhas já marcadas.
- Bloqueio das alternativas ao atingir o limite, com orientação para trocar.
- Quantidade de adicionais utilizável e validada contra os limites do grupo.
- Total estimado e ação “Adicionar à sacola” sempre visíveis no diálogo.
- Progresso e mensagens que identificam a etapa a completar.

O cálculo usa o mesmo helper de preço do carrinho, incluindo escolhas gratuitas
e adicionais pagos. Itens sob orçamento mostram “Valor de referência”. O servidor
permanece responsável pelo valor final. Não houve mudança no catálogo real,
preços, regras comerciais, assinatura, banco ou backend.

As melhorias não dependem do slug Diniz: são padrão para os grupos de opções de
qualquer cardápio e herdam a identidade visual já cadastrada.

Validação: 429 testes Node, verificações estáticas e classificação de migrations
aprovados; 18 cenários existentes de tema/contraste em 320, 390 e 1440 px passaram.
O novo roteiro `scripts/menu-customization-browser.mjs` passou em 390/1440 px
com o catálogo real da Diniz e com uma confeitaria fictícia de outro slug.
Cobertura: obrigatoriedade, busca sem resultado, manutenção das escolhas na
busca, limite de recheios, desmarcar/trocar, quantidade inválida, adicionais pagos
com escolha incluída, orçamento e conteúdo da sacola. Nenhuma chamada de criação
de pedido foi permitida; zero erros de página ou requisições externas.

Capturas antes/depois revisadas em `outputs/menu-customization/`. O catálogo
público usado na inspeção ficou apenas nos arquivos locais ignorados. O roteiro
com dados fictícios foi incluído no CI, com capturas como artefato.
