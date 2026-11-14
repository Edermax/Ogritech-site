# Reabertura do cardápio Diniz Doces — 14/11/2026

O botão “Explorar um cardápio real” apontava corretamente para `/diniz-doces/`,
com redirecionamento ao catálogo de produção. A RPC retornava `22023`,
“Cardápio indisponível”: o acesso administrativo gratuito terminou em
14/11/2026 às 18h31, horário de Brasília. O estabelecimento estava ativo e o
catálogo permanecia publicado.

A pedido do responsável para corrigir e abrir o estabelecimento, foi concedida
uma cortesia administrativa de 14 dias, até 28/11/2026 às 18h31. A assinatura
administrativa passou de `trial` para `active`, mantendo o início original,
valor zero e ausência de próxima cobrança. Não há signup de billing vinculado,
assinatura no provedor, novo teste gratuito ou cobrança criados nesta operação.
A alteração foi limitada à assinatura existente da Diniz e registrada em
`platform_billing_audit_log`, com os valores anterior e posterior.

A mensagem pública distingue a indisponibilidade informada pelo backend de
uma falha de conexão, preservando a ação de tentar novamente. O script recebeu
uma nova versão na URL para atualizar o cache dos visitantes.

Validação: RPC anônima de produção `public_menu` com HTTP 200, título Diniz
Doces, oferta Encomendas, quatro categorias e onze produtos. Nove testes de
recuperação e link curto passaram, incluindo indisponibilidade seguida de
reabertura. Verificações estáticas aprovadas. Nenhum pedido foi enviado.

A inspeção visual pelo navegador automatizado não estava disponível: o uso do
navegador local está desativado nas configurações do Work. O link foi solicitado
no painel de navegador do Codex; a resposta da ferramenta foi `queued`.
