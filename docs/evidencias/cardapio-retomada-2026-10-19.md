# Retomada do Cardápio — execução dos itens 1, 4 e 5

Data: 19/10/2026, horário de referência America/Sao_Paulo.
Base publicada e local antes das mudanças: `a51eec70580ba606d7c187e5e38c4d0fffdb0829`.

## Escopo e aceite do responsável

O usuário autorizou executar a conciliação da versão publicada (1), a homologação da passagem do teste à assinatura (4) e a atualização de monitoramento, backup e critérios de liberação (5). Declarou os itens 2 e 3 finalizados. As jornadas do lojista e dos pedidos ficam concluídas por esse aceite; não foram reexecutadas nem atribuídas a um ambiente que o usuário não especificou.

## 1 — Conciliação concluída

A API GitHub Pages confirmou o commit acima, publicado em 03/10/2026. A branch principal aponta ao mesmo commit. A árvore local estava limpa antes desta execução. Inventário verificável em `config/menu-environment-inventory.json`.

| Ambiente | Migrations registradas | Constatação |
|---|---:|---|
| Produção | 55 | Núcleo, trial e ponte de cobrança presentes; editor completo, ordenação/entrega e rascunhos ausentes |
| Staging | 74 | Editor e rascunhos presentes; `billing_rejected_email_event` ainda ausente |
| Repositório após esta execução | 76 | Inclui a nova correção de confiabilidade, ainda não aplicada permanentemente |

As quatro funções de billing de produção estão ACTIVE: `ogritech-billing` v7, `billing-lifecycle` v8, `mercado-pago-webhook` v6 e `billing-email-dispatch` v6. A função do assistente externo não aparece nesse inventário de produção.

A migration `billing_rejected_email_event` consta em produção com versão `20261003162614`; o arquivo local usa `20261003025228`. A diferença foi registrada como alias, sem alterar SQL ou histórico remoto. Os oito aliases antigos do staging não correspondem ao inventário atual e foram removidos da configuração; nenhum reparo de histórico foi executado.

O lote específico estava desatualizado: exigia novamente migrations já aplicadas. Foi reconciliado com a fila atual: 21 pendentes em produção, cinco dependências diretas ainda retidas para o produto, incluindo a correção nova. A classificação agora valida, mas a promoção permanece bloqueada e o dry-run histórico não autoriza a fila atual.

## 4 — Homologação isolada e correções verificadas

### Falhas reproduzidas ou confirmadas

- O endpoint público `trial_readiness` de produção retorna `product_catalog_unavailable`. Consulta somente leitura confirmou o plano Cardápio ativo, porém sem SELECT de `service_role` no catálogo. Também faltam permissões para o backend usar clientes de cobrança, assinaturas e inbox de eventos.
- A cotação anual pública retorna R$ 499,00 e desconto de 1667 pontos-base, mas o CHECK atual só permite 0, 300, 500 ou 1000. A escolha anual falha ao persistir.
- Aprovação atual altera o cadastro de cobrança sem atualizar o período da assinatura usada pelo controle de acesso do Cardápio.
- A suspensão atual desativa o estabelecimento e pode afetar a Agenda do mesmo cliente.
- Seleção de Pix usa o fim original do trial, permitindo renovação antes do vencimento pago.
- Worker de expiração não revalida pagamento concorrente; duplicidade de pagamento não é protegida atomicamente por ID financeiro.
- Webhook já registrado, mas não processado por falha transitória, retorna sucesso ao ser reenviado sem tentar novamente.
- Erros de gravação de pagamento ou suspensão podem ser tratados como sucesso; chave Pix muda entre tentativas de uma mesma operação.

Uma bateria inicial de 19 asserções contra a implementação atual apresentou 12 falhas. Essa bateria usa entrada deliberadamente inconsistente em alguns testes para verificar que o servidor calcula e protege o período; os resultados não significam 12 incidentes com clientes reais.

### Candidato preparado

Migration `20261019154554_menu_billing_lifecycle_reliability.sql` e alterações locais em três funções:

- grants limitados ao backend de cobrança; nenhum novo acesso para anon/authenticated;
- compatibilidade do desconto anual, preservando valores legados permitidos;
- cálculo do período no banco e sincronização apenas da assinatura Cardápio;
- bloqueio atômico por cadastro e deduplicação pelo pagamento efetivo;
- revalidação de vencimento antes da suspensão;
- renovação pela data de acesso vigente e recuperação após recusa;
- reprocessamento de eventos não concluídos; falhas financeiras retornam erro;
- conferência do valor e moeda antes de liberar o Cardápio;
- normalização do ID e status financeiro nas notificações de assinatura;
- chave Pix estável por tentativa e verificação de persistência ao escolher pagamento.

### Resultados

- **26 asserções pgTAP aprovadas**, executando o SQL candidato e os dados sintéticos numa única transação do staging, encerrada por ROLLBACK.
- **11 testes de execução dos handlers aprovados**, usando o código TypeScript real com banco e provedor simulados. Nenhuma cobrança ou mensagem foi gerada.
- **217 testes Node aprovados** na suíte completa após as correções. Política geral e contrato específico do lote de migrations validados. A primeira execução revelou uma expectativa numérica antiga no teste da política; ela foi atualizada de 75/20 para 76/21 (migrations locais/retidas).
- Cobertura: mensal/anual, repetição, falha do provedor, erro de persistência, recuperação, expiração, cancelamento no fim do período, rejeição tardia, assinatura e preservação da Agenda.
- Consulta pós-ensaio: zero cadastro sintético, zero estabelecimento sintético e nenhuma função auxiliar candidata persistida.

**Limite:** homologação isolada aprovada; homologação com o Mercado Pago e implantação das correções ainda pendentes. Foi solicitada ao usuário a indicação de sandbox existente ou preferência por concluir sem pagamento externo. Não foi assumida autorização para cobrar clientes ou publicar em produção.

## 5 — Continuidade e critérios atualizados

### Backup e restauração

Backup de hoje concluído em [39227281955](https://github.com/Edermax/Ogritech-site/actions/runs/39227281955). Artefato `ogritech-production-20261019T090707Z`, 69.770 bytes, não expirado na consulta.

Foi disparado o [ensaio de restauração 39280286345](https://github.com/Edermax/Ogritech-site/actions/runs/39280286345), com esse backup e `expect_menu_schema=true`. Ele restaura em banco efêmero do runner, não sobre produção. Última consulta: **QUEUED**, sem executor iniciado. Não marcar restauração como aprovada enquanto não houver conclusão e logs dos testes.

### Monitoramento

O [monitor 39266857945](https://github.com/Edermax/Ogritech-site/actions/runs/39266857945) concluiu com HTTP 200 em 320 ms, zero eventos na janela e sem falhas. Nenhum incidente `production-monitor` estava aberto na consulta. A [rotina de billing 39235737914](https://github.com/Edermax/Ogritech-site/actions/runs/39235737914) terminou com zero cobranças, suspensões ou e-mails processados; sucesso sem atividade não comprova um pagamento.

`MENU_HEALTH_URL` aponta para `diniz-doces-previa-7d1`, mas esse slug tem zero registros em produção. O monitor atual verifica somente HTML e pode apresentar sucesso com o backend indisponível. O candidato local adiciona a chamada pública e sem mutação a `trial_readiness`, exigindo `ready=true` para `product=menu`. Os testes verificam que uma página HTTP 200 não esconde uma contratação indisponível. Falta publicar a correção e ensaiar o incidente no mecanismo real; nenhuma issue foi criada nesta rodada.

### Rollback

Referência de retorno da próxima janela atualizada para o commit que Pages efetivamente serve. Ensaio local confirmou os seis arquivos necessários no Git. Não houve republicação, fechamento de entradas ou restauração sobre produção. O contrato conserva correção aditiva e proibição de migrations down.

### Segurança e liberação

Consulta de produção: zero tabelas `menu_*` sem RLS e zero funções `backend_billing_*` executáveis por anon. Advisors: dois avisos informativos sobre outboxes privadas sem políticas e um aviso sobre [proteção contra senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Não houve alteração de Auth nem aceite automático desses achados.

Contrato de lançamento atualizado: aceite do responsável para as jornadas, evidência atual de banco/frontend/funções e pendências explícitas. A decisão segue **BLOCKED**; documentação antiga de setembro não deve ser usada como estado vigente.

## Trabalho restante para liberar o candidato

1. Concluir a restauração que está na fila do GitHub e registrar o resultado.
2. Homologar a integração do provedor no sandbox, caso seja o caminho escolhido.
3. Revisar a promoção coordenada de SQL e das funções, com commit imutável, dry-run atual e tratamento explícito das dependências retidas. Não aplicar as 21 migrations como um lote indiferenciado.
4. Publicar monitor e código após a decisão da janela; verificar prontidão real e abertura/resolução de incidente.
5. Concluir os gates jurídicos, operacionais e comerciais que ainda exigem responsáveis e decisões reais.

Itens 2 e 3 da solicitação original permanecem concluídos. Nenhuma migration foi aplicada permanentemente, função publicada, cobrança criada ou mensagem enviada nesta execução.
