# Temas da administração Ogritech — 12/11/2026

Pedido: estender ao painel administrativo o padrão visual aplicado ao painel dos clientes.

As regras novas são exclusivas de `html[data-panel-theme="dark"] body.platform-admin-page`. A ação principal de operação fica em cyan, ações secundárias mantêm superfícies neutras, arquivamento conserva a borda tracejada e controles desabilitados continuam legíveis, sem parecerem habilitados. Há feedback de hover/foco, indicadores coerentes para assinaturas/cobranças e fundo de sobreposição adequado às janelas. Campos desabilitados seguem a mesma paleta.

O tema claro, `admin-theme.css`, `panel-controls.css`, o código administrativo e suas operações permanecem intactos. Não há alterações no banco, funções, permissões, cadastros, planos ou valores. As duas páginas atualizam a versão da folha compartilhada para `20261112.3`; os seletores novos não alteram o painel dos clientes.

## Verificação

- `npm run validate`: 399 testes aprovados.
- `npm run test:admin-theme-browser`: 57 cenários, em 390, 768 e 1440 px. Carrega o HTML, a navegação e os módulos administrativos reais, com autenticação e registros sintéticos. As fixtures rejeitam operações de gravação.
- Abrange sete áreas: visão geral, negócios, acessos, plano, assinaturas, revisão de testes e cobranças. Confere detalhes/edição de negócio, busca vazia, edição/criação de usuário, editor de plano, prévia de fatura, formulários de pagamento/devolução, revisão de teste e apresentação do cartão de credencial sem gerar uma senha.
- Verifica contraste no escuro, preservação dos estilos claros após alternância, ausência de transbordamento horizontal, persistência da preferência, foco de teclado e distinção dos estados habilitado/hover/desabilitado. Nenhum formulário é enviado e nenhum pagamento, convite ou credencial é criado.
- `npm run test:panel-theme-browser`: os 38 cenários anteriores continuam aprovados. As rotinas de auditoria visual são compartilhadas entre os dois testes para manter os mesmos critérios.
- O job `panel-theme` do CI executa ambos os testes e guarda capturas/resultados com dados fictícios em `outputs/panel-theme-review/`. A conferência de cores complementa a revisão visual e não representa certificação integral de acessibilidade.


## Integração com a versão atual — 15/11/2026

As regras visuais foram reaplicadas sobre a versão atual, preservando a navegação administrativa, planos, atendimento humano e ajustes financeiros. As páginas usam `panel-dark.css?v=20261115.3`. Os testes administrativos atuais passaram nos 63 cenários; o teste de troca de conta passou em 390 e 1440 px, sem requisições externas.

A publicação conjunta também inclui a correção de mensagens da redefinição de senha: senha recusada pode ser corrigida na mesma página, sem consumir um segundo link. Links inválidos continuam bloqueados. Sete testes de recuperação aprovados, incluindo o caminho legado e os dois formatos de código de erro do Auth. Nenhuma senha real, e-mail, cobrança ou registro de cliente foi alterado durante as verificações.
