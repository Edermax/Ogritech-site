# Tema claro cyan no painel do administrador — 11/11/2026

O painel exclusivo do proprietário (`admin.html`) agora usa o mesmo padrão visual claro da página principal e do painel dos clientes: fundo `#f5f8fb`, superfícies brancas, texto `#172d3a` e cyan como único destaque de marca.

## Alterações

- Navegação, indicadores, atalhos, tabelas e cartões com contraste e hierarquia consistentes.
- Botões principais em cyan; ações secundárias com contorno; arquivamento com borda tracejada e nome explícito. Estados de cobrança continuam identificados por texto, com diferenciação adicional de fundo e borda.
- Janelas de detalhes e formulários de negócios, plano, usuários e financeiro com fundo branco, campos legíveis e indicação de foco.
- Marca visível também no celular; botões de saída e de ações com altura mínima de 44 px. Tabelas continuam virando cartões em telas menores.
- Tema isolado em `admin-theme.css`, carregado depois dos estilos estruturais. Metadado de cor do navegador atualizado. Sem fontes, imagens ou dependências adicionais.

## Verificação

O ensaio de navegador utiliza `admin.html`, estilos e `admin.js` reais com Auth, tabelas e função de listagem de usuários simulados localmente. Nenhum dado real foi acessado ou modificado pelo ensaio.

- Seis tamanhos de tela: 360×640, 390×844, 768×700, 1024×768, 1440×900 e 1440×500.
- Navegação nas seis áreas: visão geral, negócios, acessos, plano, assinaturas e cobranças.
- Busca com estado vazio, detalhes e edição de cadastro preservando valores, abertura dos editores de plano e usuário, cálculo da prévia de cobrança e fechamento com Escape.
- Texto visível conferido contra fundo efetivo com os limites de contraste AA; sem rolagem horizontal ou erros JavaScript nos cenários exercitados.
- Validação completa local aprovada: 375 testes, verificações estáticas de 22 scripts e 9 páginas e política das 91 migrações.
- Capturas e relatório locais: `outputs/admin-light/` (ignorados pelo Git).

As alterações de produção são exclusivamente de apresentação. Não mudam regras de acesso, assinatura, financeiro ou dados dos clientes. Emissão/baixa/devolução de cobranças, convites e outras mutações reais não foram executadas para validar esta mudança visual.
