# Avanço da fase 03 — staging e testes de banco

Referência: 03/09/2026. Executor: Codex. Fase EM ANDAMENTO; não aprova beta ou produção.

## Paridade consultada diretamente

| Ambiente | Migrations no histórico remoto | Resultado |
|---|---:|---|
| Staging `fuesdztsvrkkgnbqhcxi` | 43 | Falta `add_appointment_reassignment_offers` frente às 44 locais |
| Produção `mvzcoaiiwytycdqcvydf` | 36 | Coincide com o prefixo da política local; oito continuam retidas |

A tabela `public.appointment_reassignment_offers` também não existe no staging. As migrations de vínculo de reservas ao Auth e capacidade de planos estão aplicadas. Versões remotas observadas: `link_public_bookings_to_client_auth=20260903154920`, `enforce_plan_capacity=20260903163936`, `fix_plan_capacity_access=20260903201303`.

Não alterar timestamps para forçar igualdade. A política local descreve a expectativa de entrega, não uma consulta ao histórico remoto; `npm run audit:migrations` sozinho não detecta essa ausência. O campo `auditedAt` antigo não foi atualizado para sugerir paridade completa.

Nenhuma migration foi aplicada neste avanço, em nenhum ambiente. A migration de substituição precisa de revisão e teste em banco antes de integrar o staging compartilhado.

## Falha reproduzida e corrigida nas fixtures

`staging-functional.test.sql` abortava com `P0001: Plano ativo não encontrado para este negócio`. As fixtures criavam profissionais/perfis/serviços sem cadastrar primeiro o cliente SaaS e seu plano, requisito introduzido pela nova migration de capacidade.

Ajustes realizados somente nos testes:

- `staging-functional.test.sql`: criar os clientes SaaS com plano Pro antes dos recursos.
- `staging-operations.test.sql`: mover o cliente SaaS antes do perfil/profissional/serviço.
- `appointment-operations.test.sql`: criar o vínculo comercial antes do perfil operacional.
- Nas duas suítes com master, usar Auth + `platform_admins`, como no bootstrap existente, sem criar perfil comercial owner sem empresa. Os testes de acesso global permanecem e passaram; não foi removida nenhuma asserção.

Nenhuma regra de capacidade, autenticação ou RLS foi desativada para fazer os testes passarem. A criação de perfil comercial sem empresa continua fora das fixtures válidas; se passar a ser requisito, deverá receber contrato e teste próprios.

## Execução pgTAP no staging

Docker local não estava disponível (pipe `docker_engine` inexistente). Foram usados os arquivos SQL do repositório via conexão Supabase, preservando `BEGIN` e `ROLLBACK`. Para capturar todas as asserções pelo conector, os resultados pgTAP foram agregados em tabela temporária da sessão, sem alterar as asserções originais.

| Suíte | Asserções aprovadas |
|---|---:|
| schema | 108/108 |
| profile-helper-security | 10/10 |
| staging-functional | 20/20 |
| staging-operations | 32/32 |
| appointment-operations | 20/20 |
| Total | 190/190 |

As suítes cobrem estrutura, RLS, papéis, acesso cruzado, criação/consulta/cancelamento público, rejeição de sobreposição, faturas/pagamentos/estornos, transições atômicas e fila de notificações. Não constituem ensaio de concorrência simultânea com múltiplas conexões.

Após o rollback, consulta independente confirmou zero empresas e zero usuários das fixtures remanescentes. As notificações de teste foram transacionais; não houve envio de mensagens pelo agente.

Resultados integrais e inventários: `outputs/fase03-staging-evidence.json`. A primeira tentativa funcional falhou antes do ajuste; os resultados salvos por suíte correspondem à repetição final.

## Advisors e limites da evidência

Security Advisor do staging retornou somente o aviso já conhecido de [proteção contra senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Não houve mudança de plano ou configuração. Isso não representa revisão jurídica nem auditoria completa da aplicação.

Os testes executaram contra o schema já aplicado no staging. Não comprovam replay das 44 migrations em banco vazio, equivalência integral do SQL local ao remoto, integração SMS, jornadas visuais das alterações locais, substituição de profissional ou todos os casos de capacidade de planos. Esses pontos continuam pendentes antes da promoção do respectivo lote.

## Próxima sequência técnica

1. Revisar e testar a migration ausente em ambiente isolado; validar ofertas, aceite, expiração e conflitos antes de aplicação no staging compartilhado.
2. Reproduzir o conjunto local em banco vazio quando Docker estiver disponível, incluindo seed e fixtures corrigidas.
3. Completar os testes específicos de capacidade de planos e vínculo/cancelamento autenticado antes da promoção dessas entregas.
4. Homologar provedores e interface apenas para as funcionalidades que entrarem no escopo aprovado.
5. Acompanhar o ciclo existente de 14 dias; último retrato confirmado no diagnóstico: 3/14. Não antecipar o beta por causa dos 190 testes.
