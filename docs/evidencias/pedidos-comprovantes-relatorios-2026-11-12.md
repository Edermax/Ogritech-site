# Pedidos, comprovantes, relatórios e temas — 12/11/2026

## Regras confirmadas e estado

O responsável escolheu relatórios somente de pagamentos recebidos e edição restrita a rever confirmação ou recusa. As seis alterações estão implementadas no PR #105. Produção ainda não recebeu essas mudanças.

Homologação: três migrations aplicadas, total de 96; `menu-order-receipts` e `menu-receipt-cleanup` implantadas. Bucket privado, tarefas de relatórios e limpeza ativas; credenciais internas necessárias já configuradas, verificadas somente por presença. Smoke sem autenticação retorna 401 para comprovantes e 403 para limpeza.

Produção: inventário remoto consultado somente para leitura; 93 migrations, última `menu_trial_review_api_hardening`. Três migrations novas pendentes. Nenhum pedido, pagamento, arquivo de cliente ou mensagem de produção foi criado nos testes.

## Verificações

- Aplicação: `npm run validate`, 399 testes aprovados, incluindo autorização antes de assinar upload, limites, assinatura real do arquivo, conflito de versão, comprovante opcional, URLs privadas e limpeza com falha temporária sem confirmação indevida de exclusão.
- Banco: [replay limpo e testes aprovados](https://github.com/Edermax/Ogritech-site/actions/runs/43154975863), 96 migrations, 26 arquivos e 663 verificações. Inclui resposta imediata com número sequencial, idempotência, sequência independente por estabelecimento, proteção do token de acompanhamento, auditoria de decisões, isolamento de arquivos/relatórios, recusa posterior e comparação financeira (R$ 100 contra R$ 80 = +R$ 20 e +25%).
- Navegador: `npm run test:menu-merchant-browser`, com Playwright disponível por `NODE_PATH` ou instalado no ambiente. Usa páginas e módulos reais com dados sintéticos e respostas controladas; não substitui a conferência após publicação. Testa 390 e 1440 px: pagamento com arquivo, revisão sem alterar o pagamento, detalhes nas notificações, relatório semanal/mensal, abertura nativa do PNG e geração de JPEG/PNG/PDF. Funcionário sem acesso aos relatórios financeiros e sem ações de gestão. Sem erros de JavaScript nem transbordamento horizontal no painel de pedidos.
- Temas: cliente e administrador testados em celular/computador; escolha persiste após recarregar. Estilos computados dos principais elementos voltam aos mesmos valores ao selecionar Claro. Cartões e ações do administrador conferidos visualmente no escuro. `panel-controls.css` e `admin-theme.css` preservados.
- Exportações: PDF real exportado foi conferido com Poppler e renderizado em PNG. Sem linhas sobre o texto, cortes ou sobreposição. Nomes extensos e dez itens preservados, inclusive em teste de estresse com nomes sem espaços e imagem de altura adaptada para 3.989 px.

Artefatos locais reproduzíveis ficam em `outputs/orders-ui/`, fora do Git: capturas de pagamento, notificações, relatórios, administrador e arquivos exportados. Os cenários de navegador e os testes de aplicação/banco estão versionados.

## Publicação pendente

Publicar banco e duas funções antes da interface. Verificar permissões, bucket privado, Cron e presença das credenciais, inicializar os relatórios encerrados e conferir a versão publicada.

A autorização anterior de produção refere-se ao PR #104. Para este lote, obter autorização específica de publicação e do novo backup criptografado com restauração isolada no GitHub Actions privado. A revisão automática recusou anteriormente essa exportação/processamento de dados sem autorização específica. O teste deve apagar os arquivos descriptografados e o banco temporário ao final, sem restaurar em produção.

No rollback, preservar números, eventos e anexos vinculados. Não remover registros de pagamento nem reverter as migrations com exclusão de dados.
