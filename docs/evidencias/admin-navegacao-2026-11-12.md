# Organização do painel administrativo — 12/11/2026

O painel administrativo segue o padrão de cinco destinos do painel do cliente, com áreas agrupadas por tarefa e posições estáveis no menu.

| Destino | Conteúdo |
| --- | --- |
| Resumo | Indicadores, atalhos e segmentos da carteira |
| Negócios | Carteira e revisões de cadastro para teste |
| Acessos | Proprietários e equipe dos negócios |
| Financeiro | Cobranças, assinaturas e planos |
| Conta | Identidade administrativa, tema e saída |

No celular, os cinco destinos ficam na barra inferior. No computador, permanecem na lateral. As subáreas têm navegação própria, mantendo o destino principal selecionado. Os hashes anteriores continuam funcionando, incluindo o histórico de voltar e avançar.

## Ações e filtros

- A ação principal de cada cadastro fica junto ao título, antes dos filtros identificados por rótulos.
- A busca de negócios permanece visível; segmento e escopo ficam em “Mais filtros” no celular, com indicação quando há filtros ativos.
- “Operar” passa a ser “Abrir painel”, tanto na carteira quanto nos detalhes do negócio.
- Ações menos frequentes, incluindo arquivar, cancelar e estornar, ficam em “Mais ações” no próprio registro.
- Os formulários apresentam Salvar e Cancelar no mesmo rodapé, com alvos de toque de pelo menos 44 pixels.
- Os cartões de negócios no celular mostram nome, status e ações antes dos dados complementares.
- Os estilos são exclusivos da administração, incluindo os ajustes de contraste e estados de botões no tema escuro.

## Verificação

Os testes de navegador carregam o HTML e os controladores reais com registros sintéticos. A configuração de dados é substituída por uma fixture que aceita somente as consultas necessárias; mutações são rejeitadas e requisições externas ao Supabase são bloqueadas. Nenhum formulário é enviado e nenhum dado de produção é alterado.

- `npm run test:admin-navigation-browser`: oito combinações de tamanho e tema, cobrindo oito áreas, filtros, ações secundárias, cancelar, histórico e alvos de toque. Larguras: 320, 390, 768 e 1440 pixels; temas claro e escuro.
- `npm run test:admin-theme-browser`: 60 cenas com cadastros, formulários, cobranças, revisões e conta; contraste no tema escuro, retorno ao claro, estados dos botões e persistência do tema.
- Verificações estáticas e política de migrations aprovadas; suíte completa com 400 testes aprovados.
- `npm run test:panel-theme-browser`: 44 cenas aprovadas na verificação de regressão do painel do cliente e das telas administrativas iniciais.

As verificações de navegador entram no workflow `Validate`, com capturas em `outputs/admin-navigation/` e `outputs/panel-theme-review/administration/` nos artefatos da execução.

Implementação preparada localmente. A publicação deve seguir o fluxo habitual de pull request, verificações e deploy.
