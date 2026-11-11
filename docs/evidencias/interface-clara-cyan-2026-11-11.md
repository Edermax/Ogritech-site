# Página principal e painel com tema claro e ciano

A página principal e o painel dos negócios foram revisados por capturas em navegador. O visual misturava fontes editoriais, tons quentes, cartões escuros e controles de contraste variável. A nova direção usa superfícies claras, cartões brancos, texto escuro, fonte do sistema e somente ciano como destaque da plataforma.

Na página principal, os exemplos continuam com os mesmos nomes, fotos, preços e unidades. A tipografia agora acompanha o painel, e os botões têm hierarquia mais clara. O rodapé usa o símbolo existente com identificação textual visível sobre branco. O tema editorial compartilhado continua nas outras páginas que já o utilizavam.

No painel, as cores são limitadas ao escopo panel-readable-controls. Os cardápios públicos, dados dos estabelecimentos, logos e fotos não foram modificados. Os nomes internos de classes antigas foram mantidos para preservar os controladores existentes; o destaque dourado foi substituído por ciano. Abas, navegação inferior, formulários, pedidos, indicadores, publicação, assinatura e janelas receberam o mesmo padrão. Na criação, as cinco etapas usam uma grade própria no celular para não quebrar palavras. Botões e campos foram conferidos em telas estreitas.

O Ajudante mantém o avatar e os fluxos existentes. Apenas as páginas com o novo tema recebem suas superfícies claras. Seu painel móvel limita a altura à janela disponível. A versão dos recursos foi atualizada para carregar os novos estilos.

## Verificação

- Os 375 testes passaram, assim como as verificações estáticas e de política de migrations.
- A página e os controladores reais foram renderizados no Edge com dados isolados em 320, 390 e 1440 px.
- Foram conferidos carrossel e FAQ da página principal; Pedidos, Produtos, Configurar e Publicação; criação de cardápio; assinatura; Ajudante; janela de instalação; formulário de senha; e cabeçalho com as duas ações da conta.
- Não houve erros JavaScript nem transbordamento horizontal nas telas avaliadas. A assinatura recebeu limites de largura nos elementos de grade e nos campos nativos para corrigir transbordamento em 320 px.
- A checagem de contraste dos textos ativos avaliados usou 4,5:1 para texto comum e 3:1 para texto grande. As prévias de identidade escolhidas pelo estabelecimento foram preservadas fora dessa substituição de tema.
- A revisão visual final confirmou que os nomes das etapas de criação permanecem inteiros em 320 e 390 px.

Os ensaios não alteraram pedidos, assinaturas, credenciais ou permissões reais. Nenhuma instalação de app foi confirmada no sistema operacional.

As capturas e relatórios locais estão em outputs/ui-complete-*, outputs/ui-final-creation-* e outputs/ui-final-home-1440.png. Eles usam negócios e clientes fictícios para a revisão do painel.
