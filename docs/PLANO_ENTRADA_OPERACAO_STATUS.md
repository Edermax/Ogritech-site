# Plano de entrada em operação — estado consolidado

Atualizado em: 02/09/2026
Escopo: entrada controlada da Agenda Ogritech, sem liberar automaticamente os demais produtos.

## Leitura executiva

A base técnica, o staging, a infraestrutura de produção, backup, restauração e monitoramento estão preparados. A Agenda permanece em pré-operação porque o ciclo sintético de 14 dias e o beta fechado ainda não terminaram. Esse acompanhamento ocorre diariamente de forma automática e não impede o avanço das pendências operacionais, jurídicas e comerciais.

## Concluído

| Frente | Evidência | Estado |
|---|---|---|
| Base reproduzível, migrations e CI | `CRONOGRAMA_AGENDA_PRODUCAO.md` e workflows do repositório | CONCLUÍDO |
| Disponibilidade e proteção contra conflito | testes de agenda e homologação de staging | CONCLUÍDO |
| Agendamento público seguro | `/agendar/?empresa=...`, RPCs públicas e testes | CONCLUÍDO EM STAGING |
| Operação transacional e auditável | máquina de estados, eventos e fila de notificações | CONCLUÍDO EM STAGING |
| Homologação interna com dados sintéticos | `evidencias/homologacao-interna-staging-2026-08-31.md` | CONCLUÍDO |
| Infraestrutura de produção | HTTPS, DNS, Auth, SMTP, Edge Function e cabeçalhos públicos verificados | CONCLUÍDO |
| Backup e restauração | `PLANO_CONTINUIDADE_PILOTO.md` e evidências datadas | CONCLUÍDO PARA O PILOTO |
| Monitoramento técnico | monitor de produção e monitores sintéticos de staging | CONCLUÍDO |
| SLA interno e escalonamento | `SLA_SUPORTE_ESCALONAMENTO.md` | DEFINIDO PARA O PILOTO |
| Captação corporativa | `evidencias/captacao-contato-staging-2026-09-01.md` | CONCLUÍDO EM STAGING |
| Página, proposta, cardápio e pedido | `evidencias/jornadas-comerciais-staging-2026-09-01.md` | CONCLUÍDO EM STAGING |
| Automações e alerta do backup | `evidencias/auditoria-automacoes-2026-09-02.md` | CONCLUÍDO |
| Paridade e política de promoção de migrations | `evidencias/paridade-migrations-2026-09-02.md` | CONCLUÍDO; 4 RETIDAS EM PRODUÇÃO |
| Correção do drift legado de políticas RLS | `evidencias/correcao-drift-rls-staging-2026-09-02.md` | VALIDADO EM STAGING; RETIDO EM PRODUÇÃO |
| Auditoria recorrente de drift do schema | workflow `Audit production schema drift` | AUTOMATIZADO DIARIAMENTE |
| Auditoria recorrente da segurança Auth | workflow `Audit Supabase Auth security`; mínimo de 8 e quatro classes de caracteres, promovidos após teste no staging | AUTOMATIZADO; HIBP DEPENDE DO PLANO PRO |
| Modelo replicável da primeira agenda | JSON validado, planilha operacional e workflow `Validate agenda onboarding model` | CONCLUÍDO PARA SIMULAÇÃO |
| Preparação operacional do go-live | Matriz de papéis, canais, handoff jurídico, cenários de preço e gate formal | ESTRUTURA CONCLUÍDA; NOMES E APROVAÇÕES PENDENTES |

## Em acompanhamento automático

| Frente | Estado | Liberação |
|---|---|---|
| Ciclo sintético da agenda | Execução diária de 01 a 14/09/2026 | Exige 14 datas únicas aprovadas e nenhum incidente aberto |
| Interface pública publicada | Verificação diária antes da simulação de reservas | Falha bloqueia o dia e abre incidente |
| Beta fechado | Preparado na issue #8 | Só inicia após aprovação técnica do ciclo e autorização dos convites |

Essas rotinas devem continuar em paralelo. Não é necessário interromper as outras frentes para aguardar cada execução diária.

## Pendente — exige decisão ou ação humana

| Prioridade | Pendência | Dependência para concluir |
|---|---|---|
| P0 | Nomear dono do piloto, operador principal, suporte e substituto | Nomes e disponibilidade reais |
| P0 | Definir três participantes do beta fechado | Apelidos/iniciais e autorização privada para contato |
| P0 | Provisionar e testar `contato@`, `suporte@`, `financeiro@` e `privacidade@ogritech.com.br` | Acesso administrativo ao provedor de e-mail |
| P0 | Preencher dados societários nos contratos | Razão social, CNPJ, endereço e representantes |
| P0 | Revisar Termos, Privacidade e acordo controlador-operador | Profissional jurídico responsável |
| P1 | Definir responsável por incidentes e pedidos LGPD | Nomeação e escala de cobertura |
| P1 | Escolher emissão fiscal e necessidade de gateway | Decisão contábil/comercial |
| P1 | Definir preço, cobrança e política comercial do piloto | Responsável de negócio |

## Sequência de avanço fora da agenda automática

1. Nomear os quatro papéis operacionais e a janela real de atendimento.
2. Provisionar e testar os quatro canais de e-mail.
3. Preencher os documentos com os dados societários.
4. Encaminhar o pacote jurídico para revisão externa.
5. Fechar decisão fiscal, cobrança e política comercial.
6. Após o ciclo técnico, executar o beta fechado com três pessoas.
7. Registrar responsáveis, commit, data e decisão no gate de go-live.

## Regra de liberação

Nenhuma conclusão técnica isolada libera produção. O go-live exige simultaneamente: ciclo sintético aprovado, beta fechado aprovado, papéis operacionais preenchidos, canais oficiais testados, pacote jurídico revisado, backup/restauração válidos e decisão conjunta dos responsáveis técnico e de negócio.

## Complemento do diagnóstico — 03/09/2026

O [diagnóstico do planejamento](evidencias/diagnostico-planejamento-2026-09-03.md) confirmou 46 testes locais aprovados e 3/14 datas aprovadas no diário sintético, sem issues de incidente abertas na consulta. O beta continua bloqueado. A configuração operacional reporta 28 pendências.

A política da cópia local agora classifica 44 migrations, sendo 36 na base de produção e 8 retidas. Isso substitui a contagem de quatro retidas apenas para o planejamento local; não comprova nova aplicação no staging. Há quatro migrations novas não commitadas e a data de auditoria da política permanece histórica. O CI aprovado no commit 1c55381357ff5133935c7363417377ea21d5aecf não cobre essas mudanças locais. A fase 03 deve validar banco e paridade antes de qualquer promoção.

As fases 02 e 03 estão prontas para iniciar. O relatório distingue evidência histórica de SMTP, verificação completa de canais operacionais e aprovação comercial. Nenhum lançamento foi autorizado por este diagnóstico.

### Verificação direta dos bancos e avanço operacional — 03/09/2026

A fase 03 consultou o histórico remoto: staging com 43 migrations, produção com 36. A migration de substituição de profissional não está aplicada no staging. As fixtures foram atualizadas para cadastrar o plano antes dos recursos; 190 asserções pgTAP passaram em cinco suítes com rollback. A cópia local ainda precisa de replay completo em banco vazio e homologação das novas jornadas. Detalhes: [prontidão do staging](evidencias/prontidao-staging-2026-09-03.md).

A [ficha de decisões do piloto](DECISOES_PENDENTES_PILOTO.md) centraliza a coleta operacional. As 28 pendências e os critérios de lançamento permanecem. Não foram enviados convites, promovidas migrations ou ativada produção.

### Cancelamento autenticado e capacidade — 03/09/2026

A correção de cancelamento autenticado e exigência de telefone confirmado foi aplicada apenas no staging. Trinta asserções novas de banco passaram, com rollback e limpeza comprovados. Política local: 45 migrations; staging: 44; produção baseline: 36, com nove retidas. A substituição permanece ausente no staging e incompleta funcionalmente. Detalhes e limitações: [evidência](evidencias/correcao-agenda-autenticada-2026-09-03.md). O lançamento continua condicionado aos gates existentes.

Replay local concluído em projeto Docker exclusivo: 45 migrations, seed e 220 testes pgTAP aprovados. O bloqueio de runtime local foi resolvido, sem alterar bancos preexistentes. Isso não encerra o ciclo sintético nem libera o beta antecipadamente.

## Jornada de interface — 04/09/2026

Reserva, consulta após recarga e cancelamento passaram no navegador móvel com frontend local e banco staging. Corrigidos link privado, mensagens de falha e cabeçalho da consulta; 49 testes locais aprovados. Duas reservas sintéticas canceladas, sem horário de teste ainda ocupado. Evidência: work/Ogritech-site/docs/evidencias/jornada-interface-staging-2026-09-04.md (caminho relativo à raiz do projeto). Fase 03 continua em andamento; último diário consultado: 3/14. Beta humano, provedores de autenticação e gates operacionais permanecem pendentes.

## Ciclo sintético — 04/09/2026: 4/14 aprovado

Execução manual autorizada concluída com sucesso às 10:24 (America/Sao_Paulo). Seis clientes simulados, seis reservas criadas e canceladas, isolamento e limpeza aprovados; 21 requisições, p95 de 398 ms. Interface publicada verificada e artefato diário arquivado. Diário atualizado automaticamente: https://github.com/Edermax/Ogritech-site/issues/7#issuecomment-5541079001 . Execução: https://github.com/Edermax/Ogritech-site/actions/runs/33877886734 . Contagem passa a quatro datas únicas aprovadas; faltam dez. Esta execução usa a revisão publicada no GitHub, não as alterações locais ainda não commitadas. Fase 03 permanece em andamento.


## Reformulação da autenticação — 04/09/2026

Por decisão do usuário, removidos o login social e a integração de calendário externo da Agenda. A identificação por celular permanece opcional até homologar SMS. Removidos botão, evento OAuth, estilos e instruções de configuração anteriores; ajustados testes e mensagens. Validação local: 51 testes aprovados. Alterações ainda locais, sem publicação. Ciclo sintético permanece 4/14.
