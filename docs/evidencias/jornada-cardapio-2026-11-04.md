# Jornada do Cardápio — 04/11/2026

O painel de cardápios publicados abre a gestão de pedidos e remove o guia de criação. Proprietários podem conferir configurações salvas, preparar produtos em rascunho e publicar as alterações. A retirada do ar tem botão separado e confirmação. Funcionários acessam pedidos sem chamadas exclusivas de gestores. Os avisos de salvamento ficam visíveis e falhas de rascunho restauram o catálogo em memória.

## Validação

- 334 testes Node aprovados.
- Navegador com HTML, CSS, login.js e auth.js reais e backend sintético isolado. Desktop e celular passaram por login, criação, configuração, produto, teste, revisão, publicação, edição em rascunho, falha de gravação, cancelamento de retirada do ar e atendimento por funcionário.
- Capturas e relatório local em outputs/menu-owner-journey. Nenhum pedido real foi enviado.
- Replay de 82 migrations e 571 asserções SQL em 22 arquivos aprovado no CI do commit cb558031f6c1dcef0802798d11c32396061eb60d.
- Staging recebeu a mesma migration e passou nas 69 asserções de onboarding dentro de transação com rollback.
- Backup criptografado de hoje aprovado no run 41818989689. Recuperação em banco descartável aprovada no run 41843052561.
- Produção recebeu somente preserve_menu_special_hours. O dry-run posterior retornou fila vazia. O alias histórico foi aplicado apenas à cópia local de deploy, sem reparo de histórico.
- Cardápio público Diniz aberto em navegador isolado, com 11 produtos e domingo das 09h às 13h, sem erro JavaScript. O vínculo e as permissões da proprietária foram conferidos por consultas SQL autenticadas somente leitura.

O teste de login usou credenciais sintéticas. A senha pessoal da Diniz não foi utilizada nesta revisão. A publicação do frontend é acompanhada pelo PR 58.
