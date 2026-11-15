# Atendimento humano no Ajudante — 15/11/2026

O Ajudante oferece **Falar com atendimento humano** no menu e nas respostas do painel. Clientes com assinatura ativa ou teste gratuito vigente podem solicitar retorno por ligação, WhatsApp ou e-mail. Visitantes, leads, contas inativas e testes expirados recebem somente e-mail. A página principal mantém apenas e-mail mesmo quando existe uma sessão de cliente no navegador. O formulário separado de leads também passou a oferecer exclusivamente e-mail, sem exigir telefone.

A preferência confirmada pelo usuário foi solicitar retorno. O número oficial informado, (16) 99457-7762, aparece como alternativa direta apenas para clientes elegíveis. WhatsApp exige consentimento específico; todos os pedidos exigem autorização de contato. A tela registra uma solicitação de atendimento humano e não anuncia envio automático ou atendimento concluído.

Em **Administrativo → Negócios → Atendimento humano**, a equipe consulta solicitações recentes, abre o canal autorizado e marca o retorno como atendido. Carregar a fila ou criar a solicitação não envia mensagens. Pedidos novos não entram nas antigas filas de boas-vindas automáticas.

## Autorização

A RPC `assistant_contact_options` resolve as opções no servidor usando o perfil ativo e a assinatura do próprio estabelecimento. Não aceita ID de outro negócio. As bases Cardápio e Encomendas e suas variantes recebem os mesmos canais de atendimento. `active` respeita o fim do período; `trial` exige prazo futuro. Grace period e past due não liberam telefone/WhatsApp. Cancelamento agendado com período ainda ativo mantém os canais até o término.

A RPC de solicitação verifica novamente a elegibilidade antes de gravar telefone/WhatsApp, vincula o negócio/usuário autenticados e preserva as validações, consentimentos e limite de solicitações. Visitantes não recebem telefone na resposta de opções, nem podem forçar esses canais pela API. A fila usa as políticas existentes que permitem consulta e atualização apenas por administradores da plataforma. Links e dados no painel são escapados.

Falha ao confirmar a assinatura mantém e-mail disponível. Durante a consulta há um link de e-mail e uma opção de voltar; respostas atrasadas não reabrem um formulário abandonado. Falhas de envio mantêm os dados preenchidos.

## Banco e verificação

| Migration | Local | Staging | Produção |
| --- | --- | --- | --- |
| assistant_human_contact_channels | 20261115183838 | 20261115185519 | 20261115185651 |

103 migrations nos dois ambientes, sem pendências ou reparos no histórico. A fila de produção tinha zero solicitações antes e depois da promoção. Não foram alteradas assinaturas ou cobranças.

- 453 testes da aplicação aprovados.
- 31 arquivos SQL: 800 verificações anteriores, 22 novas de canais, consentimento, isolamento, teste expirado, perfil inativo, fila humana sem disparos e leads por e-mail.
- Navegador em 390/1440 px: visitantes, clientes elegíveis e sem elegibilidade, consentimento WhatsApp, solicitação autenticada nos canais telefônicos, links oficiais condicionais e registro de atendimento administrativo. Transporte simulado; sem contatos reais.
- 60 cenas administrativas de tema claro/escuro e 12 combinações de plano/perfil do ajudante aprovadas. Formulário de retorno verificado no tema escuro.
- Consulta anônima remota retornou somente e-mail. Nenhuma solicitação, e-mail, ligação ou mensagem WhatsApp real foi enviada nos testes.

O backup criptografado existente de 15/11 e o teste de restauração anterior permanecem as evidências de recuperação do lote. Para reverter a interface, usar a base `3add81462fe5f72b473a38f019331ec8ddd2077b`, preservando a restrição dos canais públicos no servidor. Os campos novos são opcionais para registros históricos e não precisam ser removidos. As solicitações humanas já registradas devem continuar disponíveis à equipe.
