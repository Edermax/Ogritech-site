# Publicação de estoque e correções — 18/11/2026

Autorização atual do usuário: “Esta assim, publique correções”, acompanhada da captura do erro SSL 526. Escopo: publicar o estoque opcional do Completo e as correções revisadas, incluindo texto da home; reparar o HTTPS do domínio existente. Não altera preços, contratos ou provedor financeiro.

Base de produção: `b854c51963cbbb92f4956d90396a3f72aa468b7f`, com 111 migrations até `catalog_business_segments`. Implementação local `48e08b9` e revisão `914ffbb`.

## Evidências anteriores ao release

- 490 testes Node, 1.074 asserções pgTAP, quatro verificações de concorrência e 182 cenários de interface aprovados. Detalhes em [revisão](revisao-2026-11-18.md).
- Replay limpo das 112 migrations feito em PostgreSQL isolado sem rede. A migration nova é aditiva; nenhum produto recebe saldo inicial e pedidos anteriores não sofrem baixa retroativa.
- Inventários remotos consultados novamente: staging e produção com 111 migrations, sem o estoque ainda aplicado.
- Backup criptografado novo aprovado: execução `44303961609`, artefato `ogritech-production-20261118T123014Z`. Restauração aprovada na execução `44339857554`, antes da migration de produção.

## Homologação

Migration aplicada no staging como `20261118123010_catalog_product_inventory`. Conferência remota confirmou saldo e movimentos vazios, autorização falsa para tenant nulo, bloqueio de leitura anônima, ausência de edição direta do histórico pelo cliente e nenhuma função pública privilegiada nova. Advisors: nenhum ERROR; avisos de RLS sem política em tabelas privadas e proteção de senha vazada permanecem registrados. Tabelas privadas têm privilégios revogados e são acessadas por funções autorizadas.

A execução integral das 74 asserções via conector expirou na confirmação e não foi contabilizada como aprovada remotamente. A suíte integral foi aprovada no PostgreSQL isolado (1.074 asserções) e será novamente executada no CI sobre o commit de publicação. Nenhum usuário, pedido ou saldo sintético foi persistido no staging.

## Reparo de HTTPS

O GitHub Pages apresentava certificado vencido, estado `bad_authz`, para `ogritech.com.br` e `www.ogritech.com.br`; Cloudflare devolvia 526. Não havia registro CAA restritivo nas consultas públicas. A emissão foi reiniciada recolocando o mesmo domínio nas configurações do GitHub Pages, conforme a documentação oficial. A configuração foi restaurada imediatamente. O GitHub gerou os commits `5e76787` (remoção de CNAME) e `19b9213` (recriação); o conteúdo final é igual à configuração anterior. Esses commits foram integrados à branch de publicação.

Estado: publicação em andamento. Este registro será atualizado com homologação, restauração, versões remotas, CI e verificações finais.
