# Monitor de produção do Cardápio — Diniz Doces

- A variável `MENU_HEALTH_URL` do ambiente `production` aponta para `https://ogritech.com.br/cardapio/?empresa=diniz-doces&env=production`. A referência do projeto é a de produção e a chave do catálogo é publicável.
- O workflow [Monitor production, execução 42149277938](https://github.com/Edermax/Ogritech-site/actions/runs/42149277938) passou em 5/11/2026, após a publicação do cardápio da Diniz.
- Página pública: HTTP 200, contrato do catálogo presente, 325 ms. RPC pública `public_menu`: HTTP 200 e resposta válida. Disponibilidade de contratação `trial_readiness`: HTTP 200 e resposta válida. Falhas reportadas: nenhuma.
- A telemetria da janela de 20 minutos reportou zero erros 5xx, 429, falhas de autenticação e falhas de criação de pedido. A janela não continha tentativas de pedido; o monitor mede falhas quando houver tráfego, mas esta execução não substitui um pedido real de ponta a ponta.
- Não havia incidente aberto com a etiqueta `production-monitor`. Nenhum pedido, pagamento ou assinatura foi criado pela sonda.
- O preflight de produção repetido em 5/11 retornou HTTP 200 para cotação mensal (R$ 49,90), anual (R$ 499) e disponibilidade do teste grátis; um webhook sem assinatura recebeu HTTP 400. As quatro sondas passaram. Esse teste não cria checkout nem valida cobrança, liquidação ou notificação financeira reais.
