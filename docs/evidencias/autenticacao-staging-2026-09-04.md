# Autenticação no staging — 04/09/2026

Estado: homologação real de SMS bloqueada por configuração dos provedores.

Consulta somente de leitura ao endpoint público /auth/v1/settings do staging fuesdztsvrkkgnbqhcxi retornou external.phone=false, external.email=true e disable_signup=false. Nenhum SMS, e-mail ou convite enviado; nenhuma configuração remota alterada.

O formulário oferece celular, mas esse canal não está ativo nesse ambiente. Corrigidas as mensagens de indisponibilidade quando auth=required: agora não orientam continuar sem login, pois o próprio envio exige sessão. A reserva pública opcional conserva sua alternativa por preenchimento de dados.

Adicionadas regressões executando o JavaScript da página com Auth simulado: OTP indisponível reativa botão e mantém a exigência; submissão sem sessão no modo obrigatório não chama a RPC de reserva. Essas verificações não são evidência de autenticação real.

## Próxima ação concreta

1. Configurar o provedor SMS do staging e definir um número controlado para homologação.
2. Com os provedores ativos, validar retorno para a mesma empresa/ambiente, restauração das escolhas, identidade exibida, criação de reserva vinculada ao usuário, consulta e cancelamento; conferir isolamento com uma segunda identidade.
3. Registrar resultados e limpar as reservas sintéticas. Não marcar esta etapa aprovada apenas com testes simulados ou provedores habilitados.

Credenciais devem ser configuradas diretamente nos painéis apropriados, sem serem inseridas nos arquivos ou na conversa. A escolha de contas/provedor e o acesso real precisam do responsável pelo projeto; não foram inventados dados de integração.

Referência de API consultada: https://supabase.com/docs/reference/javascript/auth-signinwithotp . O envio OTP real depende de provedor configurado. A consulta ao changelog em Markdown não pôde ser carregada pela ferramenta web nesta execução; nenhuma assinatura de API foi alterada.

O ciclo sintético permanece em 4/14. Esta atividade não representa um novo dia aprovado, publicação em staging ou liberação para produção.
