# Fase 03 — cancelamento autenticado e capacidade de planos

Referência: 03/09/2026, America/Sao_Paulo. Migration gerada/aplicada em 04/09 UTC. Executor: Codex. Sem empresa-piloto; todos os dados utilizados foram fictícios.

## Correção entregue no staging

O novo endpoint `client_cancel_my_appointment` falhava com SQLSTATE `42501` porque tentava alterar status sem definir o contexto exigido pelo trigger de transições atômicas. A migration corretiva `20260904023556_harden_authenticated_booking_actions.sql` define o contexto de autoatendimento, mantém a autorização por `client_user_id = auth.uid()` e restaura o contexto anterior após a operação. A auditoria e as notificações continuam na mesma transação.

A função de vínculo por telefone agora exige `auth.users.phone_confirmed_at` preenchido. Ter um número cadastrado, isoladamente, não permite reivindicar reservas. A correção preserva grants restritos a authenticated e o isolamento das implementações no schema private.

O defeito de cancelamento foi reproduzido antes da correção. A migration foi ensaiada com rollback, aprovada nos testes e aplicada somente no staging `fuesdztsvrkkgnbqhcxi`, com versão remota `20260904023742`. O mesmo teste foi repetido após a aplicação persistente.

## Testes novos

| Arquivo | Resultado | Cobertura |
|---|---|---|
| `supabase/tests/database/authenticated-booking.test.sql` | 14/14 aprovados no staging | Listagem individual, cancelamento próprio/alheio, auditoria, restauração do contexto, repetição idempotente e vínculo somente com telefone confirmado |
| `supabase/tests/database/plan-capacity.test.sql` | 16/16 aprovados no staging | Limites de serviços, profissionais e acessos; inativação/reativação; redução abaixo do consumo; cliente final fora da contagem; consulta restrita ao gestor |
| `npm run validate` | 46 testes locais aprovados | Validação estática, política de migrations e testes JavaScript existentes |

Os dois arquivos pgTAP usam transação e rollback. Consulta posterior confirmou zero empresas, usuários e planos fictícios remanescentes. Os testes de capacidade são sequenciais; ainda não comprovam disputa simultânea entre conexões.

Security Advisor após a aplicação: apenas o aviso preexistente de [proteção contra senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Nenhum plano foi contratado ou configuração de Auth ativada.

Evidências integrais: `outputs/fase03-auth-capacity-evidence.json` e `outputs/fase03-auth-capacity-validate.log`.

## Inventário e política

- Local: 45 migrations classificadas.
- Staging: 44 migrations aplicadas, incluindo a correção.
- Produção: baseline de 36; nove migrations retidas na política local. Nenhuma aplicação em produção.
- Aliases de versões remotas atualizados para vínculo Auth, correção de acesso aos planos e esta correção, sem alterar históricos de banco.
- Continua ausente no staging: `add_appointment_reassignment_offers`.

## Substituição de profissional: estado real

A migration existente foi ensaiada dentro de uma transação no staging e revertida integralmente. A tabela e as duas funções de sugestão foram criadas com sucesso; consulta posterior confirmou que a tabela não persistiu.

Isso comprova criação SQL, não conclusão da funcionalidade. A leitura do código encontrou apenas a criação da oferta e wrappers de sugestão. Ainda faltam respostas do cliente (aceite/recusa), expiração operacional, integração da reserva temporária com a agenda normal e interface correspondente. A constraint de sobreposição das ofertas, isoladamente, não bloqueia uma reserva na tabela normal da agenda. Não ativar nem promover esta funcionalidade enquanto esses critérios estiverem incompletos.

Não confundir a ausência dessa funcionalidade adicional com necessidade de empresa-piloto: a Agenda básica pode continuar sendo validada com dados fictícios. O escopo do lote de lançamento deverá explicitar se a substituição fica para depois.

## Limites e próximos passos

O ciclo de 14 dias e o beta privado continuam com os critérios existentes. SMS ainda precisam de homologação de provedor e interface antes de exigir login no fluxo público. Estes testes de banco não substituem essa homologação.

O Docker foi iniciado para permitir replay em um projeto local exclusivo, `ogritech-phase03-20260903`, com porta de banco 55322 e cópia das migrations, testes e seed. O resultado desse ensaio será registrado abaixo ao término. Nenhum banco local preexistente deve ser resetado.

## Replay local concluído

O comando `supabase db start` no projeto isolado aplicou as 45 migrations e o seed a uma base nova, usando PostgreSQL 17.6.1.165. Não foi necessário resetar qualquer banco existente. Em seguida, `supabase test db --local` aprovou sete arquivos e 220 testes, com `Result: PASS`.

Evidências: `outputs/fase03-local-db-start.log` e `outputs/fase03-local-db-tests.log`. A cópia exata de migrations, seed, configuração e testes está em `outputs/fase03-local-db-20260903/supabase/`. O projeto do ensaio é `ogritech-phase03-20260903`; o banco usou a porta 55322. Encerrar somente esse projeto ao terminar, sem `--all` e sem apagar volumes. Log de encerramento: `outputs/fase03-local-db-stop.log`.

A base local inclui a migration de sugestão de substituição, portanto seu replay está comprovado. Seus fluxos ainda incompletos continuam sem aceite funcional e a migration não foi aplicada ao staging persistente. As 220 asserções não devem ser apresentadas como homologação da substituição.
