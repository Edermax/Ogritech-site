# Primeiro acesso restaurava a conta anterior — 14/11/2026

O cadastro novo foi provisionado com cliente, signup, perfil de proprietário e
estabelecimento próprios e consistentes. Na inspeção inicial, o usuário Auth
ainda aguardava confirmação do convite e não possuía registro de login.

O botão posterior ao cadastro já recebia uma URL com `primeiro_acesso=1`, mas
`login.js` ignorava esse marcador e restaurava automaticamente a sessão persistida
do navegador. Isso podia abrir o estabelecimento da conta anteriormente usada.
O contexto de administração de estabelecimento também precisava ser removido
quando um proprietário comum entrasse no mesmo navegador.

Correção:

- Primeiro acesso e `trocar_conta=1` encerram somente a sessão local, limpam o
  contexto operacional anterior e exigem login explícito.
- O e-mail do cadastro é lembrado como orientação, por ambiente, no armazenamento
  da aba; não é credencial nem autorização. Uma sessão salva com outro e-mail não
  é restaurada automaticamente enquanto esse novo cadastro estiver pendente.
- Login explícito limpa contexto de usuário/estabelecimento e modo master antes
  de gravar o perfil autenticado. Flags master antigas forçam recarga segura.
- Troca de usuário ou saída em outra aba oculta o painel anterior e descarta seu
  contexto. Uma troca durante a leitura do perfil não pode reexibir o painel.
- O resultado do cadastro explica a confirmação do convite antes de entrar. O
  link de login continua marcado para primeiro acesso mesmo sem URL no retorno.
- Scripts de login, painel e cadastro receberam nova versão para atualizar cache.

Isolamento em produção: ensaio somente de leitura, dentro de transação com
rollback, usando o papel `authenticated` e o sujeito da conta nova. A função de
pertencimento autorizou o estabelecimento próprio e negou o outro; consultas de
cardápios, pedidos e perfis do outro estabelecimento retornaram zero registros.
Essas verificações têm escopo definido e não equivalem a uma auditoria completa
de todas as rotas. Nenhum perfil, vínculo, senha ou dado comercial foi alterado.

Validação: 439 testes Node, incluindo oito regressões de sessão; dois cenários
de navegador em 390/1440 px com sessão antiga e login novo; 16 cenários de
cadastro/planos; 46 cenas existentes do painel com temas claro/escuro. Zero erros
de página ou requisições externas nos roteiros. Não houve confirmação de e-mail,
envio de mensagem ou login real em nome do usuário.

O acesso real continua exigindo que o titular confirme o convite e use suas
credenciais. Não foram gravados e-mail, identificadores ou tokens particulares
neste documento.
