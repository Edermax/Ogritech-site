# Monitoramento funcional — 20/10/2026

## Diagnóstico somente leitura

- A variável `MENU_HEALTH_URL` do ambiente production aponta para `https://ogritech.com.br/cardapio/?empresa=diniz-doces-previa-7d1`.
- Página pública: HTTP 200, estrutura esperada presente, 758 ms na coleta.
- RPC anônima `public_menu`: HTTP 400, catálogo indisponível. Consulta limitada aos slugs publicados em `public.online_menus`: nenhum registro em produção.
- `trial_readiness` da contratação: HTTP 503, `product_catalog_unavailable`.
- A consulta de telemetria com `ifNotFinite` foi aceita pela API real: uma chamada na janela e p95 de 1270 ms. Campos de caminho `request.path` confirmados para `edge_logs`.
- Nenhum pedido, pagamento, assinatura, publicação de cardápio ou alteração de banco foi executado.

## Correção preparada

Sondas independentes verificam HTML, catálogo público, contratação e telemetria; falhas de uma sonda não ocultam as demais. Relatos sanitizados não contêm mensagens arbitrárias de provedores. Contratos de catálogo e métricas incompletos não são tratados como sucesso. Janelas de coleta são limitadas a 1–1440 minutos. Janelas sem amostras usam p95 zero sem ocultar métricas ausentes.

O publicador de incidentes é compartilhado entre produção e ensaio, pagina as issues, reduz avisos repetidos e exige relatório completo para fechar alertas. O modo `drill` usa label e título separados, sem secrets ou serviços reais.

## Validação

- 14 testes focados do monitor e incidentes aprovados.
- `npm run validate` aprovado: verificação estática, política de 78 migrations e 264 testes JavaScript.
- Abertura e fechamento reais da issue de ensaio: aguardando execução do workflow candidato.

## Limite de conclusão

Monitor candidato ainda precisa ser promovido. Produção não tem cardápio publicado e a contratação não está pronta; o gate continua `PARTIAL`. Após o lançamento coordenado, configurar a chave pública e a URL válida, executar o monitor real e confirmar recuperação. Ensaio sintético não autoriza marcar disponibilidade real como aprovada.
