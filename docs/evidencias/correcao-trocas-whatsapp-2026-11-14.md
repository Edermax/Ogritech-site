# Correção de trocas de plano e WhatsApp — 14/11/2026

O usuário autorizou implementar os dois problemas reproduzidos na revisão. Base: produção `864e8b4e74317021ef67b97ed6e83337991c8056`.

## Comportamento

- Cada signup tem uma reserva persistida antes de tocar no provedor. Solicitações concorrentes recebem conflito e não alteram a recorrência.
- O commit exige o token da reserva. A função antiga de commit deixa de ser executável pelo `service_role`; alterações de preço por outros caminhos ficam bloqueadas enquanto existir operação pendente.
- Em falha ou resposta perdida do banco, a reconciliação consulta o preço canônico atual. Nunca restaura um preço obtido antes de outra confirmação.
- Uma falha de reconciliação mantém a reserva. O worker de cobrança existente recupera operações após 15 minutos, gira o token e somente libera depois de conferir o valor do provedor. A janela supera a [duração máxima de 400 segundos do worker hospedado](https://supabase.com/docs/guides/functions/limits). O workflow existente roda a cada 30 minutos.
- Após dez recuperações sem confirmação, o registro permanece bloqueado em `manual_review`, com erro no job. Suporte deve conferir o preço atual no banco e no provedor e usar o RPC de conclusão com o token vigente somente após confirmar a consistência. A reserva nunca expira simplesmente para liberar outra cobrança.
- O Cardápio publicado exige WhatsApp brasileiro válido, com normalização de DDI. A regra cobre publicação, troca de plano, edição e remoção de ambas as fontes de contato. Um contato alternativo válido permite trocar a origem sem interromper o catálogo.
- Planos mensais/anuais, datas de acesso e teste único de 14 dias permanecem preservados. As interfaces apresentam a mensagem de conflito ou o motivo de bloqueio retornado pela API.

## Validação

- `npm run validate`: 425 testes Node, estática e política das 98 migrations aprovados.
- Banco local em transação com rollback: 28 suítes, 740 asserções, sem falhas.
- Nova suíte SQL: 42 asserções, também aprovadas em staging com rollback e identidades sintéticas únicas.
- Concorrência com sessões PostgreSQL distintas: três corridas de contato/publicação/plano e uma disputa de reserva aprovadas. O script cria e remove um banco temporário, preservando o banco de origem. Agendadores são inertes nessa cópia; a suíte SQL normal usa as migrations sem alteração.
- Handler real com banco/provedor substituídos: duas requisições concorrentes fazem uma única atualização de preço; resposta perdida reconcilia o preço confirmado; erro do provedor mantém reserva; recuperação verifica preço e token.
- Backup criptografado: [43539297823](https://github.com/Edermax/Ogritech-site/actions/runs/43539297823), artefato `ogritech-production-20261114T011616Z`.
- Restauração isolada: [43539743553](https://github.com/Edermax/Ogritech-site/actions/runs/43539743553), aprovada.

## Homologação e publicação

Staging: migration nativa `guard_menu_offer_changes`, versão `20261114012026`; `ogritech-billing` v33 e `billing-lifecycle` v22. Nenhum pagamento, SMS, e-mail ou mudança de assinatura de cliente real foi realizado nos testes.

Produção: aguarda CI integral deste candidato e promoção coordenada da migration e das duas funções. O frontend apenas melhora a apresentação dos erros, com cache atualizado. Não há alteração dos termos ou de segredos de pagamento.
