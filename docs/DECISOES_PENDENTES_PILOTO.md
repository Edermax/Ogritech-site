# Coleta histórica de decisões da Agenda

> Documento histórico preparado em 03/09/2026 para a frente Ogritech Agenda. Não representa o estado atual do piloto do Ogritech Cardápio. O estado vigente do Cardápio está em `config/menu-private-pilot-phase-7j-result.json` e `docs/evidencias/fase-7j-inicio-piloto-privado-cardapio-2026-09-17.md`.

Preparado em 03/09/2026. Fase 02 em andamento. Este documento organiza as pendências; não registra aprovações presumidas.

A configuração de referência é `config/operational-readiness.json`. Dados privados devem ficar no arquivo privado de operação; neste documento, registrar somente situação, iniciais quando apropriado e referência da evidência. Não preencher CNPJ, endereço, contatos pessoais ou dados de convidados em arquivos públicos.

## Situação registrada em 03/09/2026: ainda sem empresa-piloto da Agenda

O responsável pela Ogritech informou que ainda não tem uma empresa-piloto. Isso não bloqueia desenvolvimento, simulação com dados fictícios ou preparação do beta fechado. Não é necessário indicar agora o operador de uma empresa que ainda não foi selecionada. O beta requer três pessoas convidadas e um operador Ogritech, definidos quando a janela de teste estiver próxima e após o aceite técnico. Os papéis completos da operação comercial permanecem necessários antes da ativação real.

## Ficha de decisões

| Bloco | Informação necessária | Situação | Onde registrar o resultado |
|---|---|---|---|
| Operação | Dono do piloto, operador, suporte, privacidade e financeiro; titular, substituto e cobertura de cada papel | PENDENTE | Arquivo privado de operação; refletir situação na configuração |
| Canais | Responsável por contato@, suporte@, financeiro@ e privacidade@; confirmar envio, recebimento e resposta | PENDENTE | Evidência datada por canal |
| Sociedade | Dados da Ogritech e representante com poderes de assinatura | PENDENTE | Documentos privados do pacote jurídico |
| Jurídico | Profissional revisor e aceite de Termos, Privacidade e acordo controlador-operador | PENDENTE | Checklist jurídico existente |
| Comercial | Cenário de preço, implantação/mensalidade, vencimento, método de cobrança, política do piloto | PENDENTE | Decisão de negócio e configuração |
| Fiscal | Responsável contábil e forma de emissão fiscal | PENDENTE | Decisão validada pelo responsável |
| Beta | BETA-01 a BETA-03, operador e janela de até duas horas | PENDENTE | Registro privado; ficha anonimizada no beta |
| Primeira empresa | Empresa selecionada, operador e início possível | AINDA NÃO EXISTE; ETAPA POSTERIOR | Onboarding privado |
| Acompanhamento | Aceitar ou ajustar proposta de 7 dias corridos após ativação | PROPOSTA | PLANS.md, decisão D06 |

## Propostas para decisão

- Preservar cobrança manual e auditável no início, como previsto no projeto. Integrar gateway apenas após necessidade confirmada.
- Aproveitar a espera pelo ciclo técnico para concluir operação, canais e revisão dos documentos.
- Não tornar SMS obrigatório para o beta básico enquanto os provedores não forem homologados.
- Manter a agenda pública de produção desligada durante o beta privado/staging.

## Pacote jurídico pronto para encaminhamento autorizado

Usar [JURIDICO_HANDOFF_CHECKLIST.md](JURIDICO_HANDOFF_CHECKLIST.md), as páginas existentes de Termos/Privacidade e os documentos:

- [Acordo controlador-operador](lgpd/ACORDO_CONTROLADOR_OPERADOR.md).
- [Inventário de tratamentos](lgpd/INVENTARIO_TRATAMENTOS.md).
- [Direitos dos titulares](lgpd/PROCEDIMENTO_DIREITOS_TITULAR.md).
- [Resposta a incidentes](lgpd/PLANO_RESPOSTA_INCIDENTES.md).

Preencher dados fornecidos, identificar versão/data das minutas e registrar revisor, resultado e ajustes. Nenhum documento foi enviado; o pacote permanece aguardando dados e responsável.

## Protocolo de comprovação dos canais

Para cada canal: confirmar provisionamento, identificar operador e destinatário de teste autorizado, testar envio/recebimento/resposta e registrar data, resultado e referência sem conteúdo pessoal. Marcar `VERIFIED` somente após as três etapas. O teste histórico de convite do Auth para contato@ não substitui esse protocolo.

## Registro de aprovação

As seis aprovações (técnica, operacional, jurídica, comercial, cadastro do cliente e publicação) continuam pendentes. Quando houver aceite real, registrar responsável, data e escopo. A autorização para continuar o planejamento não equivale a preencher esses aceites.

## Validação

`npm run check:operations` lista as pendências; saída zero no modo informativo não significa aprovação. Para avaliar o gate estrito, definir `REQUIRE_OPERATIONAL_APPROVAL=true` apenas no processo de validação. Estado observado: 28 pendências. Onboarding: pronto somente para simulação.

