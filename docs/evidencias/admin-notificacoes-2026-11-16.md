# Notificações da administração — 16/11/2026

Implementação na branch `feat/admin-notifications-20261116`, baseada em `23403f4` de `origin/main`. A pasta principal de desenvolvimento foi preservada. A publicação foi autorizada pelo usuário depois da visualização local; a implantação do banco está registrada abaixo.

## Comportamento

- Sino em todas as áreas administrativas, contador de não lidas e aviso acessível de atividade pendente.
- Criação de conta de acesso (`auth.users`): um aviso de novo cadastro. Entradas posteriores na mesma conta não geram outro cadastro.
- Cada evento `published` de `menu_onboarding_events`, incluindo republicação do catálogo: um aviso de publicação. Salvar rascunho e despublicar não notificam.
- Cada novo `platform_callback_requests`, inclusive visitante por e-mail: um aviso de atendimento humano com acesso à fila existente.
- Atualização a cada 15 segundos enquanto a página está visível; atualização ao retornar à página, reconectar ou usar o botão Atualizar.
- Histórico paginado, leitura individual e leitura de todos os eventos até o limite observado, com estado separado por administrador. Abrir o sino não marca tudo como lido.
- Os eventos são gravados junto à transação de origem e continuam disponíveis após fechar o painel. Não há carga retroativa de cadastros ou publicações anteriores à ativação.
- Avisos são exibidos dentro do painel. Não foi implementado envio por e-mail, WhatsApp ou push com o aplicativo fechado.

## Segurança

As duas tabelas têm RLS e não oferecem acesso direto a visitantes ou usuários autenticados. As RPCs públicas são `security invoker`; as implementações privadas exigem administrador da plataforma com perfil ativo. Somente os gatilhos internos criam eventos. O frontend usa `textContent` para conteúdo de usuários e uma lista fixa de destinos internos.

As leituras são idempotentes e associadas a `auth.uid()`. O limite de "marcar todas" preserva eventos recebidos após a consulta. A atualização periódica só começa depois da validação administrativa e é encerrada ao sair, limpando o histórico da tela.

## Verificação

- `npm run validate`: sintaxe, classificação das 107 migrations e **474 testes Node aprovados**.
- `supabase/tests/database/platform-admin-notifications.test.sql`: **24 asserções pgTAP aprovadas**, incluindo os três gatilhos reais, autorização, paginação, leitura por administrador, repetição, corrida de marcação e rollback sem aviso fantasma.
- Suíte SQL: **899 asserções aprovadas** nos arquivos existentes e no novo teste. Execução em `admin_notifications_20261116`, uma cópia isolada dos schemas da aplicação do PostgreSQL local, com as seis migrations posteriores à base local aplicadas em transações individuais. Os schemas Storage e extensões necessários aos testes também foram copiados/preparados. `cron.job(jobname,active)` foi copiado como snapshot do banco local para conferir a configuração existente, sem executar nem criar tarefas agendadas nessa cópia. Isso não constitui replay limpo das 107 migrations nem validação de produção.
- Todos os testes SQL usam rollback; zero notificações e zero leituras de fixture remanescentes ao final.
- `node scripts/admin-notifications-browser.cjs`: aprovado em **390, 768 e 1440 px**, com dados sintéticos e serviços externos interceptados. Validados temas claro/escuro, ausência de overflow, teclado/Escape e retorno de foco, texto sem execução de HTML, acesso ao atendimento, leitura individual, chegada durante "marcar todas", paginação de 65 eventos, recuperação de erros e início/fim da atualização periódica.
- Capturas e resultado do navegador em `outputs/admin-notifications/` (artefatos locais ignorados pelo Git).
- `git diff --check`: aprovado.

## Ativação

Aplicada `20261116191650_platform_admin_notifications.sql` antes da entrega do frontend administrativo. Os arquivos novos constam do pacote de release. A autorização do lote foi atualizada após o pedido explícito de publicação; não houve migração de dados históricos nem alteração das credenciais.

## Publicação autorizada — atualização

- [PR #145](https://github.com/Edermax/Ogritech-site/pull/145): entrega do sino e das notificações ao painel online.
- [Backup criptografado](https://github.com/Edermax/Ogritech-site/actions/runs/43952478339): concluído com sucesso, artefato `ogritech-production-20261116T204543Z`.
- [Restauração do backup em ambiente descartável](https://github.com/Edermax/Ogritech-site/actions/runs/43953202665): concluída com sucesso antes da migração em produção.
- [Validação de banco em instalação limpa](https://github.com/Edermax/Ogritech-site/actions/runs/43953056340/job/133600334611): 107 migrations reproduzidas, 33 arquivos SQL, 899 asserções aprovadas e teste de concorrência aprovado. O primeiro job de interface da mesma execução identificou uma lista antiga de RPCs de leitura nos testes de aparência; foi atualizada para reconhecer `platform_notification_inbox`, mantendo a proibição de mutations. Localmente, 63 cenas de aparência e oito cenários de navegação passaram após o ajuste.
- Staging `fuesdztsvrkkgnbqhcxi`: migration `20261116204208`, total de 107 migrations. As 24 asserções executadas no ambiente remoto passaram com rollback. Zero fixtures de teste remanescentes.
- Produção `mvzcoaiiwytycdqcvydf`: migration `20261116204928`, total de 107 migrations. Smoke transacional verificou os três gatilhos reais, acesso à caixa de entrada por administrador ativo, marcação de leitura e recusa de visitante anônimo. Rollback integral confirmado; zero usuários e pedidos fictícios remanescentes.
- A análise de segurança não introduziu advertências ou erros novos. Os avisos informativos de RLS sem políticas nas duas tabelas são deliberados: o acesso direto permanece revogado e somente as RPCs autorizadas alcançam os dados. A advertência anterior sobre proteção de senhas vazadas permanece fora do escopo desta entrega.
- Inventário de migrations, aliases e auditoria de schema reconciliados com as 107 migrations efetivamente aplicadas. A aplicação foi feita por migration explícita via MCP, sem `db push`, sem reparo de histórico e sem execução de uma fila de migrations.

O frontend é entregue pelo GitHub Pages após a integração da PR, com os arquivos administrativos versionados para atualização do cache. A prévia local e suas fixtures não fazem parte do fluxo do painel online; os arquivos públicos continuam usando o Supabase de produção configurado no projeto.
