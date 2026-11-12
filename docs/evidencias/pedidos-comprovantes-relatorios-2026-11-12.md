# Pedidos, comprovantes, relatórios e temas — 12/11/2026

## Regras confirmadas e estado

O responsável escolheu relatórios somente de pagamentos recebidos e edição restrita a rever confirmação ou recusa. As seis alterações estão implementadas no PR #105. Banco e funções publicados em produção após autorização explícita. A interface integra o mesmo PR e é liberada pelo merge em `main`.

Homologação: três migrations aplicadas, total de 96; `menu-order-receipts` e `menu-receipt-cleanup` implantadas. Bucket privado, tarefas de relatórios e limpeza ativas; credenciais internas necessárias já configuradas, verificadas somente por presença. Smoke sem autenticação retorna 401 para comprovantes e 403 para limpeza.

Produção: três migrations aplicadas em ordem (`20261112050314`, `20261112050324`, `20261112050335`), total de 96, última `menu_order_response_snapshot`. Funções `menu-order-receipts` e `menu-receipt-cleanup` v1 ativas. Nenhum pedido, pagamento, arquivo de cliente ou mensagem externa de produção foi criado nos testes. A inicialização dos relatórios gerou três notificações internas de períodos encerrados.

## Verificações

- Aplicação: `npm run validate`, 399 testes aprovados, incluindo autorização antes de assinar upload, limites, assinatura real do arquivo, conflito de versão, comprovante opcional, URLs privadas e limpeza com falha temporária sem confirmação indevida de exclusão.
- Banco: [replay limpo e testes aprovados](https://github.com/Edermax/Ogritech-site/actions/runs/43154975863), 96 migrations, 26 arquivos e 663 verificações. Inclui resposta imediata com número sequencial, idempotência, sequência independente por estabelecimento, proteção do token de acompanhamento, auditoria de decisões, isolamento de arquivos/relatórios, recusa posterior e comparação financeira (R$ 100 contra R$ 80 = +R$ 20 e +25%).
- Navegador: `npm run test:menu-merchant-browser`, com Playwright disponível por `NODE_PATH` ou instalado no ambiente. Usa páginas e módulos reais com dados sintéticos e respostas controladas; não substitui a conferência após publicação. Testa 390 e 1440 px: pagamento com arquivo, revisão sem alterar o pagamento, detalhes nas notificações, relatório semanal/mensal, abertura nativa do PNG e geração de JPEG/PNG/PDF. Funcionário sem acesso aos relatórios financeiros e sem ações de gestão. Sem erros de JavaScript nem transbordamento horizontal no painel de pedidos.
- Temas: cliente e administrador testados em celular/computador; escolha persiste após recarregar. Estilos computados dos principais elementos voltam aos mesmos valores ao selecionar Claro. Cartões e ações do administrador conferidos visualmente no escuro. `panel-controls.css` e `admin-theme.css` preservados.
- Exportações: PDF real exportado foi conferido com Poppler e renderizado em PNG. Sem linhas sobre o texto, cortes ou sobreposição. Nomes extensos e dez itens preservados, inclusive em teste de estresse com nomes sem espaços e imagem de altura adaptada para 3.989 px.

Artefatos locais reproduzíveis ficam em `outputs/orders-ui/`, fora do Git: capturas de pagamento, notificações, relatórios, administrador e arquivos exportados. Os cenários de navegador e os testes de aplicação/banco estão versionados.

## Liberação em produção

Banco e funções publicados antes da interface. Bucket privado e Cron ativos, URL e segredo de limpeza conferidos somente por presença/formato. Não há pedidos reais sem número nem testes consumindo sequência; sequências por estabelecimento válidas. Auditoria continua sem tabelas públicas sem RLS e sem novos avisos de segurança além dos já existentes.

O responsável autorizou expressamente o PR #105, o novo backup criptografado e a restauração isolada. [Backup 43158089637](https://github.com/Edermax/Ogritech-site/actions/runs/43158089637) concluído, artefato privado `ogritech-production-20261112T050002Z`. [Restauração 43158503043](https://github.com/Edermax/Ogritech-site/actions/runs/43158503043) aprovada: 274 verificações; arquivos descriptografados e banco temporário apagados. Nenhuma restauração em produção. O [CI final funcional](https://github.com/Edermax/Ogritech-site/actions/runs/43156662230) passou no commit `5bd45c48cb2756692f16aea99e893629a90d3699`.

No rollback, preservar números, eventos e anexos vinculados. Não remover registros de pagamento nem reverter as migrations com exclusão de dados.

Conferência de preservação: 15 pedidos, 23 itens e três cardápios. Digests idênticos antes/depois, desconsideradas somente as quatro colunas novas dos pedidos: pedidos `a1edfd062cb416e8f4892c2f93907230`, itens `31552a0ac9f2589d6e4386d5e0017814`, cardápios `a955ede3257b0ff8aba5a1cb61e7a365`. Campos anteriores, inclusive datas de atualização, preservados.
