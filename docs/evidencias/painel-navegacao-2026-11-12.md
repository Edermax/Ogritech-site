# Navegação do painel do cliente

## Resultado

O painel passa a ter cinco destinos estáveis para responsáveis: **Pedidos, Produtos, Cardápio, Vendas e Conta**, na mesma ordem no computador e no celular. Funcionários continuam com Pedidos e Conta. Os destinos usam o conjunto de ícones existente e identificam a área atual por texto e `aria-current`.

- **Pedidos:** lista antes de compartilhamento, ajuda e preferências de avisos. Os avisos do dispositivo ficam em uma seção expansível após a lista. Ações continuam junto do respectivo pedido.
- **Produtos:** catálogo antes do formulário. Adicionar produto abre o editor; Editar abre o item existente. Salvar/Cancelar ficam juntos em uma barra visível durante a rolagem. Excluir e ordenar um produto ficam em Mais ações. Alterações não salvas exigem confirmação ao deixar o editor.
- **Cardápio:** visualização pública, compartilhamento e QR Code ficam neste destino. Atendimento e Publicação são as abas locais. A abertura duplicada do link público foi removida. A configuração inicial mantém o passo a passo existente.
- **Vendas:** acesso direto aos relatórios semanais/mensais e aos indicadores. Os relatórios também podem continuar sendo abertos pelas notificações. A janela do relatório usa cabeçalho compacto, corpo rolável e JPEG/PNG/PDF alinhados no rodapé. Fechar devolve o foco à origem da abertura.
- **Conta:** reúne senha/tema, assinatura, instalação, exportação de dados e saída da sessão. A exportação permanece restrita ao proprietário. A saída fica em um grupo separado ao fim.

Ajuda tem um acesso permanente no cabeçalho; o botão flutuante e o banner repetido deixam de competir com as tarefas. A ordem visual das áreas segue a ordem de navegação. As abas locais consideram apenas controles visíveis na navegação por teclado.

## Implementação

`panel-navigation.js` organiza os elementos e integra os destinos aos controladores existentes. `commercial-admin.js` expõe uma interface pequena de seleção/estado/novo produto e continua responsável pelas operações do cardápio. Consultas, validações e operações de assinatura, pagamento, publicação e armazenamento usam as rotas existentes.

`panel-navigation.css` aplica o arranjo com as variáveis dos temas existentes. As referências dos arquivos alterados foram versionadas. O service worker passa ao shell v20 e inclui os novos recursos e ícones no precache. A preferência explícita de tema claro continua protegida contra o escurecimento automático do navegador.

## Verificação

- `npm run validate`: verificações estáticas, política de migrations e 399 testes aprovados.
- `npm run test:panel-navigation-browser`: oito combinações de largura/tema (320, 390, 768 e 1440 px, nos temas claro e escuro), com tarefas pelas ações reais do painel.
- Confere ordem/rótulos, alvos de toque, ação do primeiro pedido e edição do primeiro produto acessíveis na tela inicial do cenário, ausência de transbordamento, abertura/cancelamento da edição e proteção de alterações não salvas.
- Executa salvar produto em rascunho e publicar pela área Cardápio com respostas isoladas; confere o payload, recarregamento e novo estado dos botões.
- Confere preservação da edição de atendimento ao visitar Conta, bloqueio de saída sem salvar, acesso direto a relatórios e exportações alinhadas, cadastro inicial e restrição da interface do funcionário.
- `npm run test:panel-theme-browser`: 44 cenas aprovadas, incluindo Vendas, editor e Mais ações. Confere contraste no escuro e restauração da aparência clara.
- `npm run test:account-theme-browser`: claro/escuro, sistema escuro, Auto Dark, persistência e diálogo de senha aprovados.
- `npm run test:menu-merchant-browser`: pagamento com comprovante, revisão de decisão, detalhes de notificações, exportações, tema e relatório com nomes longos aprovados.
- Revisão final de teclado e capturas em celular aprovada. Capturas/resultados em `outputs/panel-navigation/` e `outputs/panel-theme-review/`.

Todos os ensaios usam autenticação e dados simulados. Nenhuma operação de teste grava em produção. O novo ensaio de navegação integra o job de interface do CI. Implementação local, ainda não publicada.
