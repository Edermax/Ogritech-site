# Retorno à administração da Ogritech

Ao abrir um cardápio diretamente pela administração, o administrador passa a encontrar “Voltar à Ogritech” no início da página. O botão aponta para Administração → Negócios, inclusive depois de recarregar a prévia. A origem é somente uma indicação de navegação: a sessão e a permissão de administrador são verificadas pelo servidor antes de exibir o retorno. O endereço compartilhável perde essa indicação após a verificação.

No painel de um estabelecimento aberto pela Ogritech, o botão aparece acima do cabeçalho, após a validação administrativa já existente. Sua exibição independe do carregamento dos dados comerciais. O controle antigo, condicionado à personalização do painel e inserido entre as ações do cabeçalho, foi removido. O retorno usa uma rota fixa no mesmo domínio e preserva o ambiente. O administrador continua autenticado; a entrada na administração remove o contexto operacional como já fazia anteriormente.

Proprietários que abrem sua própria vitrine mantêm “Voltar ao painel”. Visitantes e usuários sem permissão não recebem o retorno administrativo. Troca de conta ou encerramento de sessão não podem fazer uma autorização atrasada revelar o botão. Não há alteração de permissões, dados comerciais, funções de backend ou migrations.

Validação local: 509 testes Node, incluindo 21 verificações de sessão/retorno; 12 jornadas de navegador em 320, 390 e 1440 pixels, sem erros ou requisições externas. As jornadas verificam proprietário, visitante, usuário sem vínculo, administrador, recarga e retorno antes do carregamento do negócio. A suíte administrativa confere que “Abrir cardápio” transmite a origem e mantém abertura em nova aba com isolamento. Os controles têm pelo menos 44 pixels de altura, e o layout não apresenta rolagem horizontal nos tamanhos verificados.

Cache do aplicativo atualizado para v53. A suíte de retorno permite conferir a versão publicada com `OGRITECH_RETURN_BROWSER_PUBLISHED=1`, carregando arquivos públicos e mantendo contas e operações fictícias. Capturas e logs ficam em `outputs/menu-panel-return/`, `outputs/menu-panel-return-public/` e na pasta de evidências da tarefa na raiz do projeto.
