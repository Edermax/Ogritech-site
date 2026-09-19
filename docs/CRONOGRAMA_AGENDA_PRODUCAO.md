# Cronograma de produção — Agenda Ogritech

Início: 29/08/2026. Objetivo: colocar a Agenda Ogritech em piloto assistido com uma empresa real, preservando segurança, rastreabilidade e possibilidade de rollback.

## Fase A — Base reproduzível (29 a 30/08)

- Integrar migrations, testes, lockfile e configuração do CI que já foram validados em staging.
- Garantir que `main`, checkout local e staging tenham o mesmo histórico de migrations.
- Corrigir o pipeline até obter validação estática e de banco aprovadas.
- Marcar os três pilares não disponíveis como `Em breve`.

Critério de aceite: CI verde em um checkout limpo e `supabase db push --linked --dry-run` sem divergência no staging.

Status em 29/08/2026: **concluída**. O CI executou validação estática e banco limpo com sucesso; 23 migrations foram aplicadas localmente; 83 testes de banco passaram; a migration pendente foi aplicada no staging e a verificação final retornou banco remoto atualizado.

## Fase B — Disponibilidade real (31/08 a 03/09)

- Modelar jornada semanal, intervalos, bloqueios, folgas e fuso horário por empresa.
- Vincular profissionais aos serviços que executam.
- Criar RPC de consulta de horários disponíveis baseada na duração do serviço.
- Trocar horários fixos do frontend por disponibilidade calculada pelo banco.
- Cobrir concorrência, limites de horário e bloqueios com pgTAP.

Critério de aceite: cliente só visualiza horários realmente reserváveis; duas tentativas simultâneas nunca ocupam o mesmo intervalo.

Status em 29/08/2026: **concluída e validada no staging**. O painel passou a configurar serviços por profissional, jornada semanal com até dois períodos diários e folgas/bloqueios. O salvamento é transacional, rejeita períodos sobrepostos e alimenta a consulta real de horários. A migration foi promovida e o teste operacional remoto foi aprovado.

## Fase C — Agendamento público (04 a 07/09)

- Criar endereço público por empresa, sem exigir senha do consumidor.
- Capturar nome, WhatsApp, e-mail e consentimento mínimo.
- Aplicar limitação de frequência, proteção antiabuso e política de antecedência.
- Criar links seguros para consulta e cancelamento.
- Remover qualquer identidade demonstrativa das contas reais.

Critério de aceite: uma pessoa sem conta consegue agendar pelo celular e recebe uma referência segura sem acessar dados de terceiros.

Status em 29/08/2026: **concluída e validada no staging**. Foi criada a rota mobile-first `/agendar/?empresa=...`, configurável pelo gestor, com catálogo público limitado, disponibilidade real, nome, WhatsApp, e-mail, consentimento, honeypot, limite por contato, referência e token secreto para consulta/cancelamento. O token é armazenado somente como hash no banco e nenhuma tabela operacional foi liberada ao visitante. Uma reconstrução limpa aplicou 26 migrations; 118 testes locais e 32 testes operacionais remotos foram aprovados. O advisor não apontou falhas no schema; permanece para a Fase E ativar a proteção de senhas vazadas no Supabase Auth.

## Fase D — Operação confiável (08 a 10/09)

- Substituir atualizações em lote por RPCs transacionais de confirmação, conclusão, ausência e cancelamento.
- Aplicar máquina de estados e auditoria no banco.
- Enviar notificações de solicitação, confirmação e cancelamento; preparar lembrete.
- Implementar a substituição consentida de profissional conforme `docs/SUBSTITUICAO_PROFISSIONAL_AGENDA.md`, preservando o atendimento original até a resposta do cliente e usando os botões `Aceitar {nome}`, `Escolher outro(a) profissional` e `Cancelar`.
- Instrumentar erros de API, autenticação, conflitos e latência.

Critério de aceite: todas as mudanças de estado são atômicas, auditáveis e notificadas.

Status em 29/08/2026: **núcleo operacional concluído e validado no staging**. Confirmação, conclusão, ausência e cancelamento agora usam uma RPC com bloqueio de linha, versão esperada, autorização por vínculo profissional e máquina de estados. Atualizações diretas de status foram bloqueadas. Cada criação ou transição grava um evento imutável e gera, na mesma transação, uma notificação interna e uma mensagem de e-mail na fila durável. O painel recebeu central de notificações, contagem de não lidas, registro de leitura, confirmação com observação e histórico por atendimento. A reconstrução limpa aprovou 180 testes de banco e 12 testes do frontend. O transporte SMTP/e-mail e a telemetria externa permanecem para a Fase E, pois exigem credenciais e domínio do provedor.

## Fase E — Produção e piloto (11 a 15/09)

- Aplicar migrations no projeto de produção com backup e plano de rollback.
- Configurar Auth, SMTP, Edge Functions, cabeçalhos, MFA e alertas.
- Executar smoke test completo com dados fictícios.
- Cadastrar a primeira empresa, treinar o responsável e operar o piloto assistido.
- Registrar incidentes, métricas e decisão de ampliação.

Critério de aceite: sete dias de piloto sem perda de dados, acesso cruzado, conflito de agenda ou falha crítica sem tratamento.

## Ordem de liberação comercial

- Agenda online: `Disponível` somente após a Fase E.
- Landing pages: `Em breve`.
- Orçamento online: `Em breve`.
- Cardápio online: `Em breve`.

As datas são metas de execução e podem avançar se um critério de aceite não for comprovado. Qualidade e segurança bloqueiam promoção para a fase seguinte.
