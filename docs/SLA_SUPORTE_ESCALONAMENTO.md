# SLA interno de suporte e escalonamento — piloto

Versão 1.0 — 01/09/2026  
Estado: definido para uso interno; publicação comercial bloqueada até a nomeação da equipe e validação da cobertura.

## Escopo

Este documento organiza o atendimento durante o piloto assistido da Agenda Ogritech. Os tempos são objetivos operacionais internos, não garantia contratual de disponibilidade ou resolução.

## Cobertura inicial

- Responsável pelo suporte técnico do Cardápio: **Eder Ogrizio Silva**, informado pelo responsável e registrado em 21/10/2026. Substituto e cobertura ainda pendentes; esta nomeação não ativa os prazos abaixo.
- Janela proposta: dias úteis, das 09h às 18h, horário de Brasília.
- Fora da janela, somente alertas S1 exigem acionamento imediato, desde que a escala tenha um responsável nominal confirmado.
- A cobertura só entra em vigor quando dono do piloto, operador principal, suporte técnico e substituto estiverem preenchidos no runbook.
- Solicitações com dados pessoais devem usar o canal privado oficial; issues públicas não podem conter nomes, contatos, tokens, observações de atendimento ou conteúdo de clientes.

## Severidade e objetivos internos

| Nível | Exemplos | Ciência/triagem | Contenção ou alternativa | Atualizações |
|---|---|---:|---:|---:|
| S1 Crítico | acesso entre empresas, vazamento, dupla reserva sistêmica, perda de dados ou agenda indisponível para todos | 15 min | 1 hora; recuperação essencial observa RTO de até 4 horas úteis | a cada 30 min |
| S2 Alto | criação, consulta ou cancelamento falha para parte relevante dos usuários, sem exposição de dados | 2 horas úteis | 4 horas úteis | a cada 2 horas úteis |
| S3 Médio | falha com alternativa segura, degradação localizada ou erro sem impacto financeiro/dados | 1 dia útil | plano em até 2 dias úteis | diariamente |
| S4 Baixo | dúvida, ajuste visual, melhoria ou problema cosmético | 2 dias úteis | priorização no backlog | na mudança de estado |

O prazo de ciência mede o tempo até reconhecer, classificar e assumir o caso. O prazo de contenção não equivale a correção definitiva. Quando não houver solução segura, suspender a função afetada e comunicar a alternativa disponível.

## Fluxo de atendimento

1. Receber pelo canal oficial e criar um identificador sem expor dados pessoais.
2. Registrar horário, ambiente, empresa afetada, impacto e evidência mínima.
3. Classificar S1 a S4 e identificar se há dados pessoais.
4. Acionar os papéis exigidos pela matriz abaixo.
5. Conter o impacto, preservar evidências e aplicar alternativa segura.
6. Validar recuperação com smoke test e confirmar ausência de acesso cruzado.
7. Comunicar a normalização, documentar causa e abrir ações preventivas.
8. Encerrar somente após evidência técnica e aceite do responsável operacional.

## Matriz de escalonamento

| Situação | Primeiro responsável | Escalonamento obrigatório |
|---|---|---|
| Dúvida operacional ou cadastro | Operador principal | Suporte técnico se houver falha reproduzível |
| Falha técnica S2 a S4 | Suporte técnico | Dono do piloto se ultrapassar o objetivo ou afetar vários usuários |
| Falha S1 | Suporte técnico e líder do incidente | Dono do piloto, privacidade e controlador afetado imediatamente |
| Suspeita envolvendo dados pessoais | Líder do incidente | Responsável de privacidade e jurídico, conforme `lgpd/PLANO_RESPOSTA_INCIDENTES.md` |
| Pedido de titular | Responsável de privacidade | Controlador e jurídico quando complexo, disputado ou excepcional |
| Indisponibilidade com restauração | Suporte técnico | Dono do piloto; seguir `PLANO_CONTINUIDADE_PILOTO.md` |
| Cobrança, estorno ou emissão fiscal | Financeiro/comercial | Responsável de negócio e contabilidade |

## Canais previstos

| Canal | Uso | Estado |
|---|---|---|
| `contato@ogritech.com.br` | entrada comercial geral | PENDENTE DE TESTE |
| `suporte@ogritech.com.br` | suporte operacional e técnico | PENDENTE DE TESTE |
| `financeiro@ogritech.com.br` | cobrança e documentos fiscais | PENDENTE DE TESTE |
| `privacidade@ogritech.com.br` | direitos do titular e privacidade | PENDENTE DE TESTE |
| GitHub Issues privado ao time | registro técnico sem dados pessoais | DISPONÍVEL |

## Critérios para ativar este SLA

- [ ] Quatro papéis operacionais possuem nome e meio privado de contato.
- [ ] Operador e substituto aceitaram a janela de cobertura.
- [ ] Os quatro endereços receberam e responderam a uma mensagem de teste.
- [ ] Existe acesso seguro aos canais por pelo menos duas pessoas autorizadas.
- [ ] Foi realizado um exercício S1 e um S2, com tempos registrados.
- [ ] O resultado do exercício respeitou os objetivos ou gerou plano corretivo.

## Revisão

Revisar após o beta fechado, após qualquer S1/S2 e trimestralmente durante a operação. Uma futura oferta comercial deverá distinguir claramente disponibilidade da plataforma, tempo de ciência, contenção e resolução.
