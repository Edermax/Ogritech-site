# Padronização das operações do Cardápio — 5 de novembro de 2026

- O PR [#63](https://github.com/Edermax/Ogritech-site/pull/63) validou código e migrações em um banco limpo. A checagem estática e a suíte de banco passaram no run [42138039041](https://github.com/Edermax/Ogritech-site/actions/runs/42138039041).
- Homologação recebeu, nesta ordem, `standard_menu_contact_and_orders` (versão remota `20261106001516`) e `live_delivery_zone_updates` (`20261106003532`). O contato configurável e as três funções públicas foram confirmados por consulta. A escrita direta de zonas pelo papel `authenticated` está desabilitada.
- Produção recebeu as mesmas migrações na mesma ordem após o CI, com versões remotas `20261106003917` e `20261106003929`. O cardápio público da Diniz continuou publicado com 4 categorias, 11 itens, 50 zonas ativas e o WhatsApp `5516991596865`.
- A mudança do frontend ainda depende do merge e da publicação do GitHub Pages. Nenhum pedido real foi criado ou alterado para testar as ações operacionais.
- A opção de cálculo automático por rota da Diniz permanece específica dessa loja. O caminho padrão dos demais clientes usa as taxas por região configuradas no painel.
