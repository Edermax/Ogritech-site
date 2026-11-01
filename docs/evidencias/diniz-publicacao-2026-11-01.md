# Ativação técnica da Diniz — 01/11/2026

Pedido do responsável: disponibilizar o cardápio real da Diniz e o acesso de proprietária com senha inicial. Criação administrativa por código e um único pedido interno sem cobrança foram autorizados especificamente na conversa.

## Acesso e catálogo

- Conta vinculada exclusivamente à Diniz, papel `owner`, sem acesso à administração da plataforma. Login real e ausência de acesso a perfis de outras empresas conferidos novamente em 01/11.
- Senha inicial gerada em memória, ausente do repositório e dos arquivos de publicação. Nenhum convite ou mensagem enviado nesta execução.
- Catálogo em produção: quatro categorias, onze produtos, dois produtos personalizados sob consulta. Revisão e os oito requisitos de onboarding concluídos. Exatamente um pedido interno marcado como teste e concluído, sem cobrança ou mensagem.
- Acesso administrativo gratuito concedido até 14/11/2026, às 18h31 (Brasília), sem cobrança automática. Não representa contratação, assinatura financeira ou aceite em nome da proprietária.

## Banco e recuperação

- [CI da correção de catálogo](https://github.com/Edermax/Ogritech-site/actions/runs/41334899717): replay limpo de 80 migrations e 561 asserções em 21 arquivos SQL aprovados.
- [CI dos testes isolados](https://github.com/Edermax/Ogritech-site/actions/runs/41335550041): verificações estáticas, 316 testes Node e banco aprovados no commit `66aa190706793678445a8ca41870afde68452f1d`.
- [Backup criptografado de 01/11](https://github.com/Edermax/Ogritech-site/actions/runs/41298316841) e [restauração em banco descartável](https://github.com/Edermax/Ogritech-site/actions/runs/41335545853) aprovados. O ensaio usa o artefato existente, sem nova exportação, e exclui dados gerenciados de Auth e Storage.
- O primeiro ensaio revelou consultas globais nos testes de pedidos; foram limitadas às empresas fictícias dos próprios testes. Nenhum dado de produção foi removido para fazer a suíte passar.
- A única migration pendente, `preserve_menu_catalog_metadata`, foi aplicada primeiro em staging e depois em produção. Os dois ambientes têm 80 migrations; o dry-run posterior de produção retornou fila vazia. Não houve reparo artificial de histórico.
- Metadados de consulta são preservados em edição e republicação; somente `order_mode` e `configuration_required` podem ser alterados pelo cliente. Isolamento por empresa e permissões anônimas preservados.

## Frete e publicação

- A chave existente do Geoapify foi cadastrada somente no cofre de produção como `GEOAPIFY_API_KEY`, sem criar nova conta, chave ou plano pago.
- A conferência real detectou que a busca livre da origem devolvia o centro da cidade, resultando em frete incorreto. A busca estruturada por rua, número e CEP identificou o imóvel com confiança 1,0.
- A correção exige imóvel, rua e número correspondentes, cidade/estado/país corretos e confiança mínima de 0,8. Respostas de centro de cidade são rejeitadas antes da rota; CEP comum continua funcionando.
- Link curto preparado: `/diniz-doces/`; destino canônico `cardapio/?empresa=diniz-doces&env=production`. O ambiente explícito evita reutilizar a seleção de staging guardada no navegador.
- Homologação remota da correção de precisão aprovada: rota da origem ao ponto público de conferência resultou em 12,8 km, faixa de 13 km e taxa de R$ 16,25. O endereço sem número foi rejeitado com 422, sem cotação. Não foi criado pedido.
- 327 testes Node e verificações locais aprovados com a correção de geocodificação, incluindo integração com provedores simulados para rejeitar centroides antes de consultar rotas.
- Nesta etapa, o menu ainda aguarda a promoção da função de frete corrigida e a publicação coordenada do frontend. Não divulgar a prévia fictícia como link real.

As verificações técnicas não substituem as pendências jurídicas, fiscais ou comerciais já registradas. Nenhuma cobrança real foi iniciada ou homologada nesta ativação.
