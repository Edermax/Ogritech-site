# Ajudante do painel: planos e perfis

O Ajudante usa o plano, o perfil e a etapa carregados pelo painel em `OgritechMenuWorkspace.state()`. Não consulta armazenamento antigo para escolher um plano e não presume Encomendas ou proprietário enquanto o contexto não estiver confirmado. A matriz de orientações fica em `assistant-panel-help.js`; o widget apresenta as respostas e confere a disponibilidade do destino antes de navegar.

| Assunto | Ogritech Cardápio | Ogritech Encomendas | Perfil |
| --- | --- | --- | --- |
| Pedidos | Explica o atendimento no WhatsApp e o recurso do Encomendas | Orienta consulta e decisões nos pedidos | Funcionário consulta; proprietário e administrador fazem a gestão |
| Vendas e relatórios | Informa que a aba não está incluída e apresenta o Encomendas | Orienta relatórios dos pedidos registrados na plataforma | Proprietário e administrador |
| Entrega, retirada e agendamento | Explica que são combinados no WhatsApp e apresenta o Encomendas | Orienta as configurações e os prazos dos produtos | Proprietário e administrador |
| Pagamentos de pedidos, comprovantes e Pix | Explica a combinação pelo WhatsApp e apresenta o Encomendas | Diferencia pagamentos dos pedidos e pagamento da assinatura | Gestão de pedidos por proprietário e administrador; assinatura pelo proprietário |
| Notificações de pedidos | Explica que as notificações da plataforma exigem Encomendas | Orienta ativação em cada dispositivo compatível | Proprietário, administrador e funcionário |
| Produtos, fotos e opções | Orienta cadastro e personalização | Orienta cadastro e personalização | Proprietário e administrador |
| WhatsApp e compartilhamento | Explica a seleção enviada pelo cliente ao WhatsApp | Diferencia o contato do estabelecimento e o registro de pedidos na plataforma | Proprietário e administrador |
| Atendimento e horários | Identificação, WhatsApp e horários; sem indicar os controles exclusivos do Encomendas | Atendimento, horários, entrega, retirada e pagamentos | Proprietário e administrador |
| Publicação | Primeira publicação sem pedido de teste nem pagamentos da plataforma | Primeira publicação com as etapas do Encomendas | Proprietário e administrador |
| Plano e assinatura | Mostra o plano e encaminha às opções de assinatura | Mostra o plano e encaminha às opções de assinatura | Somente proprietário; demais perfis recebem a orientação de procurá-lo |
| Aplicativo | Orienta instalação sem prometer novos recursos | Orienta instalação sem prometer novos recursos | Todos os perfis operacionais confirmados |
| Conta e permissões | Explica as permissões do perfil e a própria conta | Explica as permissões do perfil e a própria conta | Todos os perfis operacionais confirmados |

Com o cardápio publicado, a orientação de produtos descreve a atualização automática ao salvar, a preservação dos ocultos e a nova tentativa em Produtos. Na implantação inicial, os atalhos respeitam a escolha do modelo e as etapas de atendimento.

Quando o plano não inclui um recurso, o proprietário recebe um link para `painel/?secao=configuracoes#subscriptionCenter`, com o ambiente atual preservado. O clique abre as opções de assinatura, sem executar troca de plano ou cobrança. A troca continua exigindo a confirmação do fluxo existente. Administradores e funcionários não recebem esse atalho de alteração.

Respostas abertas são atualizadas quando o contexto muda. Enquanto o plano está carregando, não são oferecidos atalhos de um plano anterior. Cada clique é validado de novo; a navegação mantém as proteções de alterações não salvas do painel. Essas regras apenas adaptam o atendimento: autorização, cobrança e limites continuam sendo aplicados no servidor.

Verificações: `tests/assistant-panel-help.test.mjs` cobre a matriz de respostas, planos desconhecidos e etapas de implantação. `scripts/assistant-profiles-browser.cjs` cobre os dois planos, os três perfis, celular e desktop, links de assinatura sem mutação, mudanças de plano com a ajuda aberta, contexto em carregamento, ação desatualizada e proteção de produto não salvo. Usa somente fixtures isoladas.
