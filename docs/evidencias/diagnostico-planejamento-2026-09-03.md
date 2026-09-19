# Diagnóstico do planejamento — 03/09/2026

Responsável pela execução: Codex. Fase 01 concluída como diagnóstico; produção não liberada.
Data de referência: 03/09/2026, America/Sao_Paulo. Fontes remotas consultadas via GitHub CLI em modo de leitura.

## Resultado

A base local passa nas validações disponíveis, mas há alterações não commitadas que não estão cobertas pelo CI do commit publicado. A operação continua bloqueada por ciclo sintético incompleto, beta não executado e 28 pendências na configuração operacional. As fases 02 e 03 podem começar independentemente.

## Revisão e ambiente

- HEAD local e revisão das execuções remotas consultadas: `1c55381357ff5133935c7363417377ea21d5aecf`, de 02/09/2026.
- Node local: 24.18.0. CI: Node 22 e Supabase CLI 2.116.0.
- O README ainda cita CLI 2.115.0 nos requisitos; CI e package.json apontam 2.116.0 como referência. O package.json usa faixa `^2.116.0`, não fixação exata. Conferir lockfile/versão efetiva na preparação do banco da fase 03.
- Arquitetura preservada: frontend HTML/JavaScript, Supabase Auth e PostgreSQL/RLS. Nenhuma migração de framework proposta.
- A seleção local/staging/produção está documentada no README. Nenhuma chamada de teste mutável foi feita a staging ou produção neste diagnóstico.

Alterações preexistentes preservadas: admin.html, admin.js, agendar/agendar.js, agendar/index.html, config/migration-release-policy.json, docs/CRONOGRAMA_AGENDA_PRODUCAO.md, painel/index.html, script.js, style.css, supabase/functions/platform-users/index.ts, sw.js e dois arquivos de testes. Também existem arquivos não rastreados de estilos, documentos de jornadas, outputs, script de relatório, teste de capacidade e quatro migrations:

- `20260902204329_add_appointment_reassignment_offers.sql`
- `20260903143540_link_public_bookings_to_client_auth.sql`
- `20260903163213_enforce_plan_capacity.sql`
- `20260903201148_fix_plan_capacity_access.sql`

O diagnóstico não atribui autoria nem validação remota a essas alterações. A leitura Git usou uma exceção `safe.directory` apenas no comando, sem alterar configuração global.

## Validações locais executadas

| Verificação | Resultado | Evidência |
|---|---|---|
| `npm run validate` | Saída 0; 46 testes aprovados, nenhum falhou ou foi ignorado; checagem estática de 16 scripts, 10 páginas e 44 migrations | `outputs/diagnostico-validate.log` |
| Auditoria de migrations, incluída em validate | 44 classificadas; expectativa staging=44; produção=36 aplicadas + 8 retidas segundo a política local | Mesmo log; `config/migration-release-policy.json` |
| `npm run check:operations` | BLOQUEADO, 28 pendências; saída 0 é comportamento informativo e não aprovação | `outputs/diagnostico-operations.log` |
| `npm run check:onboarding` | PRONTA_PARA_SIMULACAO: 2 serviços, 2 profissionais, 6 intervalos, nenhum erro | `outputs/diagnostico-onboarding.log` |

Os testes locais não executam pgTAP nem comprovam aplicação das quatro novas migrations no banco. Não foi realizado reset, deploy, alteração de configuração remota, envio de mensagem ou criação de monitor.

## Evidências atuais do GitHub

- [CI Validate](https://github.com/Edermax/Ogritech-site/actions/runs/33648059583): jobs `static` e `database` aprovados em 02/09 no HEAD acima. O workflow de banco executa start, reset e pgTAP; o resultado não abrange as mudanças locais não commitadas.
- [Diário #7](https://github.com/Edermax/Ogritech-site/issues/7): três comentários com datas únicas aprovadas, 01, 02 e 03/09. Cada dia informa 6 reservas criadas/canceladas, isolamento e limpeza aprovados. p95 registrado: 167, 235 e 947 ms, respectivamente. A variação deve ser acompanhada; isoladamente não comprova regressão.
- [Piloto de 03/09](https://github.com/Edermax/Ogritech-site/actions/runs/33782751487): passos de interface publicada, simulação, artefato e diário efetivamente aprovados, não ignorados.
- [Monitor de produção](https://github.com/Edermax/Ogritech-site/actions/runs/33816836460) e [monitor de staging](https://github.com/Edermax/Ogritech-site/actions/runs/33805923838): conclusão success em 03/09.
- [Backup](https://github.com/Edermax/Ogritech-site/actions/runs/33731796541), [drift](https://github.com/Edermax/Ogritech-site/actions/runs/33734325182) e [Auth](https://github.com/Edermax/Ogritech-site/actions/runs/33736488963): conclusão success em 03/09. Conteúdo dos artefatos e ensaio de restauração não foram reavaliados neste diagnóstico; success do workflow não é auditoria independente de todos os controles.
- Lista de issues abertas consultada: somente diário #7 e [beta #8](https://github.com/Edermax/Ogritech-site/issues/8), sem issues das labels de incidente. Isso é um retrato da consulta, não garantia futura.
- Beta #8 permanece bloqueado pelo aceite do ciclo técnico; participantes e roteiro ainda não concluídos. Produção deve permanecer desativada durante o beta privado/staging.

## Reconciliação das divergências

| Divergência | Conclusão e tratamento |
|---|---|
| Consolidado diz quatro migrations retidas; política local diz oito | O documento de 02/09 é histórico; quatro novas migrations foram acrescentadas à cópia local. Considerar oito retidas no planejamento atual, sem afirmar que as 44 já estão aplicadas no staging. Confirmar inventário remoto na fase 03. |
| `auditedAt` da política continua 02/09, mas inclui migrations de 03/09 | Metadado histórico não comprova nova auditoria remota. Atualizar somente após consulta aos bancos na fase 03. |
| README lista etapas de infraestrutura que o consolidado dá como concluídas | Usar evidências datadas e distinguir infraestrutura implantada de liberação comercial. Não refazer infraestrutura sem necessidade. |
| SMTP e convite para contato@ foram testados, mas quatro canais estão pendentes | O teste histórico de Auth confirma aquele fluxo de entrega/aceite; não comprova envio, recebimento e resposta dos quatro canais. Manter pendência operacional. |
| Skill recém-instalada sugere Auth.js/Drizzle | Não altera decisões do projeto; preservar Supabase Auth e arquitetura existente. |
| Novas jornadas locais versus site monitorado | Substituição, login SMS e limites de planos exigem testes próprios antes de promoção. Login permanece opcional segundo o documento da jornada. Não impor novos provedores ao beta básico. |

## Situação das metas

| Meta | Situação |
|---|---|
| G1 | Diagnóstico estabelecido e testes locais aprovados. Banco/integrações das alterações locais ainda NÃO VERIFICADOS. |
| G2 | 3/14 dias aprovados; ciclo incompleto. Evidências de isolamento cobrem as execuções sintéticas consultadas. |
| G3 | Beta não executado; nenhuma métrica de usabilidade real comprovada. |
| G4 | BLOQUEADA: configuração reporta 28 pendências. |
| G5 | BLOQUEADA pelas dependências; não há nova autorização de lançamento. |
| G6 | NÃO INICIADA; modelo pronto para simulação, empresa real e janela não definidas. |

## Fila priorizada para execução

| Prioridade | Ação | Responsável/dependência | Evidência esperada |
|---|---|---|---|
| P0 — antes de promover | Validar as quatro migrations e jornadas locais em banco/staging; confirmar inventários e versões | Técnico, fase 03 | pgTAP, testes transacionais e registro de paridade da revisão avaliada |
| P0 — antes de operar | Nomear cinco titulares e cinco substitutos; verificar quatro canais | Negócio/operação, fase 02 | Configuração e testes de canal autorizados |
| P0 — antes de operar | Dados societários e revisão de Termos, Privacidade e acordo | Negócio e profissional jurídico | Aceites reais e referência privada |
| P1 | Definir preço, método de cobrança, emissão fiscal e política do piloto | Negócio/contabilidade | Decisões documentadas; gateway só se necessário |
| Gate temporal | Completar 14 datas válidas e acompanhar incidentes | Rotina já existente, fase 03 | Diário aprovado; não criar rotina duplicada |
| Gate de uso | Definir operador, três participantes e janela; executar beta após aceite técnico | Responsável Ogritech, fase 04 | 3/3 jornadas e média ≥ 8 |
| Gate final | Registrar seis aprovações, revisão, ambiente e decisão | Técnico e negócio, fase 05 | Checklist e configuração concordantes |

As 28 pendências se dividem em 10 nomeações, 4 canais, 4 requisitos societários/jurídicos, 4 decisões comerciais e 6 aprovações. Não equivalem a 28 defeitos de software.

## Próxima ação

Iniciar a fase 02 pela coleta consolidada de responsáveis/decisões, enquanto a fase 03 verifica a cópia local e as migrations. Não aguardar passivamente o ciclo de 14 dias para preparar essas entregas. O diagnóstico está concluído com limitações explícitas; nenhuma meta de lançamento foi declarada concluída.
