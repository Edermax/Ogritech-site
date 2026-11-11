# Logo ou foto opcional na identificação do negócio

O espaço de identificação do negócio no cabeçalho agora usa a imagem já cadastrada na aparência do cardápio. O gestor pode clicar nesse espaço para abrir Configurar e o campo opcional Logo ou foto do negócio, sem recarregar os dados nem descartar alterações do formulário.

Foi reutilizado o fluxo existente de upload para menu-images, com caminhos por estabelecimento, validação de JPEG/PNG/WebP, assinatura do arquivo, dimensões e limite de 5 MB. Nenhum novo campo obrigatório ou endpoint foi criado. O painel acompanha a imagem salva no rascunho; a imagem pública continua seguindo a confirmação de publicação existente. Funcionários visualizam o logo publicado e não recebem permissão para editar.

Sem imagem, após remoção ou em caso de erro no carregamento, o ícone padrão permanece visível. Imagens existentes e nomes dos negócios são preservados. O controle tem área de toque de pelo menos 44 px e identificação acessível.

Validação: 375 testes passaram; verificações estáticas e de migrations passaram. No Edge, a página e os controladores reais foram executados contra dados isolados nas larguras 390 e 1365 px. Foram conferidos logo existente, abertura do editor a partir de Assinatura e dados, upload opcional, salvamento, recarregamento dos dados, remoção e visualização sem edição para funcionário. Não houve erros JavaScript nem publicação automática da aparência durante esses testes. Nenhum arquivo ou cadastro real foi alterado.
