# Cadastro exclusivo por plano — 14/11/2026

Os botões específicos de Cardápio e Encomendas conduziam à comparação dos dois
planos, mesmo quando o visitante já havia escolhido. A navegação foi separada:

- “Testar grátis” no cabeçalho e “Criar meu cardápio grátis” na página inicial
  continuam em `/criar-cardapio/`, com a comparação dos planos.
- “Testar Cardápio grátis” abre `/criar-cardapio/cardapio/`.
- “Testar Encomendas grátis” abre `/criar-cardapio/encomendas/`.

Cada página exclusiva tem título, benefícios, preços e cadastro próprios do
plano escolhido. Não apresenta cards de comparação nem seletor de plano.
O visitante pode usar o link discreto “Comparar os planos” para retornar
voluntariamente à comparação. Os cards da comparação também conduzem às
páginas exclusivas. Os botões e dados estruturados da home e de Cardápio Digital
apontam diretamente para os novos destinos.

URLs antigas com `?plano=cardapio` ou `?plano=encomendas` são encaminhadas ao
cadastro correspondente, preservando o parâmetro de ambiente. Nas páginas
exclusivas, o plano da página tem precedência sobre um parâmetro conflitante.
O formulário continua usando o mesmo script e o backend existente, com o código
do plano em um campo oculto e preços/resumo conforme a periodicidade.

Validação: 429 testes Node e verificações estáticas/migrations aprovados.
Quinze cenários de navegador aprovados, incluindo cliques reais do cabeçalho e
dos dois planos em 390/1440 px, comparação → cadastro exclusivo, links antigos,
parâmetro conflitante e envio simulado de cada plano anual. Capturas das duas
páginas revisadas nos dois tamanhos. Zero erros de página ou requisições externas;
nenhuma conta, pedido ou cobrança real criada.
