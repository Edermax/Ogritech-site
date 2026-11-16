# Notificações da administração — 16/11/2026

Implementação local na branch `feat/admin-notifications-20261116`, baseada em `23403f4` de `origin/main`. A pasta principal de desenvolvimento foi preservada. Nenhum ambiente remoto foi alterado.

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

Aplicar `20261116191650_platform_admin_notifications.sql` antes de publicar o frontend administrativo. Os arquivos novos constam do pacote de release. A migration está classificada como pendente de produção, e a autorização do lote foi redefinida para pendente porque a aprovação anterior dizia respeito à fila já publicada.

Staging, produção, dry-run remoto e publicação não foram executados nesta implementação. Os aliases históricos das migrations foram preservados.
