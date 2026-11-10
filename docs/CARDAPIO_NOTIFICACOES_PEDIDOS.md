# Notificações de pedidos

O cadastro oferece uma escolha opcional, desmarcada. Ela guarda apenas o interesse neste navegador por 24 horas. A inscrição real exige acesso autenticado ao painel e um clique em **Ativar neste dispositivo**. A mesma opção aparece no início da criação do catálogo e em **Pedidos recentes**. É individual para cada dispositivo e conta; sair da conta cancela a inscrição local.

Compatibilidade: HTTPS e Web Push. Em iPhone/iPad, abrir pelo ícone após adicionar à Tela de Início (iOS/iPadOS 16.4 ou superior). O painel pode ficar fechado; configurações do sistema, economia de bateria, conexão e o navegador podem afetar a entrega. Os pedidos permanecem registrados no painel independentemente do aviso. Não há promessa de entrega instantânea.

## Implementação e privacidade

- Nenhuma permissão é solicitada automaticamente. Bloqueios, indisponibilidade e falhas de ativação têm mensagens próprias. Ambos os controles do painel mostram o mesmo estado.
- Somente contas ativas de proprietário, administrador ou funcionário da própria empresa, com Cardápio ativo, podem se inscrever. Máximo de cinco dispositivos ativos por conta. A tabela privada contém endpoints de entrega, sem acesso direto pelo cliente.
- Um pedido real em `received` gera um trabalho por dispositivo em uma fila transacional. Pedidos de teste e alterações de status não geram avisos. Falhas no disparo não impedem o pedido.
- O dispatcher autentica com segredo exclusivo. Usa leases e `SKIP LOCKED`, tenta até cinco vezes com espera progressiva e descarta avisos com mais de 15 minutos. O provedor recebe um push vazio assinado com VAPID. A notificação é genérica, sem dados do cliente. Um clique abre o painel no ambiente correspondente.
- A entrega pode repetir caso o processo pare após enviar e antes de confirmar; o tópico por pedido e a tag da notificação reduzem repetições visuais. Não há cobrança, e-mail nem WhatsApp associado a este recurso.
- Endpoints expirados são desativados. Trabalhos com mais de sete dias são removidos. Revogação da conta, produto ou acesso da equipe é conferida novamente ao consumir a fila.

## Configuração e publicação

1. Executar `npm run validate`, a jornada `scripts/menu-owner-journey-browser.mjs` e `supabase test db` em banco isolado. Revisar a migration `20261110231521_menu_order_push_notifications.sql` e a CI do commit exato.
2. Aplicar a migration primeiro em homologação. As tabelas são aditivas; os pedidos existentes e as inscrições de outros produtos não são modificados.
3. Usar CLI autenticada: `pwsh -File scripts/configure-menu-order-push.ps1 -Environment staging -CliPath <supabase.cmd> -Apply -Initialize`. Repete os mesmos secrets sem gerar novas chaves quando já há backup. Sem `-Apply`, apenas mostra o preflight. O script configura Vault e o cron de recuperação a cada minuto. O trigger acorda o worker assim que a transação do pedido confirma.
4. Publicar `menu-order-notifications` e `menu-order-push-dispatch` com `verify_jwt=false`: ambos autenticam dentro do handler. A primeira usa o JWT real do usuário; a segunda usa `x-menu-push-secret`. Manter `MENU_ORDER_PUSH_ENABLED=false` até verificar funções, permissões e cron. Ativar repetindo a configuração com `-Enable`, sem `-Initialize`.
5. Repetir para produção após a homologação. Atualizar o inventário de migrations com a versão remota observada. Publicar os arquivos estáticos junto com o novo service worker. Não habilitar notificações de nenhum cliente automaticamente.

Chaves privadas e segredo ficam nos secrets do Supabase; Vault contém somente URL e segredo do dispatcher. O backup local em `private/menu-order-push-<ambiente>.dpapi` é criptografado pelo Windows e exige o mesmo usuário e computador para leitura. Transferir por canal seguro para o cofre operacional antes de desativar esse computador. Não versionar nem imprimir chaves. Não regenerar VAPID em cada deploy: uma rotação exige nova inscrição dos dispositivos, feita pelo próximo clique de ativação.

## Verificação e reversão

Verificar resposta 401 sem sessão em `menu-order-notifications`, 403 sem segredo no dispatcher, cron ativo, tabelas privadas sem grants para `anon`/`authenticated` e zero erros da função. Testes automatizados substituem somente a fronteira de entrega do sistema operacional; a entrega em um aparelho real precisa de uma inscrição voluntária nesse aparelho.

Para suspender novos envios, configurar `MENU_ORDER_PUSH_ENABLED=false` e desativar o cron `menu-order-push-dispatch`. Isso preserva pedidos e permite cancelar inscrições pelo painel. Pode haver um aviso já aceito pelo provedor por até o TTL de cinco minutos. Reverter os estáticos ao commit anterior se necessário. Não remover as tabelas nem a migration como rollback; preservar as chaves para uma retomada posterior.

Referências: [Web Push no iOS/iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API), [agendamento de Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions), [VAPID](https://www.rfc-editor.org/rfc/rfc8292.html).
