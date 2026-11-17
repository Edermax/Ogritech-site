# Ogritech Catálogo — validação local de 17/11/2026

Implementação na branch `feat/catalogo-planos-segmentos-20261117`, baseada em `a9a6675`. A pasta original `work/Ogritech-site` e suas mudanças anteriores foram preservadas; trabalho realizado em worktree isolado. Nenhuma alteração remota, envio de mensagens ou cobrança real foi executada.

| Verificação | Resultado |
| --- | --- |
| `npm run validate` | Check estático, política de migrations e 480 testes Node aprovados. Baseline: 474. |
| Replay do banco | Todas as 108 migrations aplicadas em banco vazio; 34 arquivos pgTAP e 938 asserções aprovadas. |
| `npm run test:catalog-browser` | 24 jornadas, zero erros de página, zero chamadas externas. |
| `node scripts/split-offers-browser.mjs` | 22 verificações aprovadas de cadastro, contratos anteriores, painel e administração, em celular e desktop. |
| `node scripts/configurable-plans-browser.cjs` | Administração e cadastro de planos personalizados, indisponibilidade e preservação de preço contratado aprovados. |
| `node scripts/menu-customization-browser.mjs` | Opções, limites, preços e sacola aprovados em 390 e 1440 px; zero erros/chamadas externas. |

Os testes executam os handlers financeiros reais com banco/provedor substituídos; o pgTAP executa as funções e políticas reais em Postgres. Foram verificados os quatro valores canônicos, intervalo de recorrência, fim de mês/ano bissexto, preservação do período adquirido, trial único, downgrade, autorização por estabelecimento, cupom/idempotência, orçamento e histórico restrito. As suítes anteriores de erros, concorrência, pagamentos, cancelamentos e reconciliação continuam aprovadas.

As telas foram renderizadas com Playwright/Edge instalado e inspecionadas: home no celular, catálogo de artesanato no celular e painel com controles de teste Completo. Imagens e JSONs ficam em `outputs/catalog-review/browser/`, com resultados adicionais nas pastas das suítes de regressão. Artefatos são locais/CI, sem dados pessoais reais.

O container dedicado foi parado ao final para evitar consumo desnecessário. Para reproduzir o banco neste computador, inicie-o com `docker start ogritech-catalog-validation-20261117` e execute: `node scripts/catalog-local-database.cjs --reset-isolated --test`. O runner só admite o container dedicado `ogritech-catalog-validation-20261117`, sem rede e sem portas. Auth/Storage são importados apenas como esquema vazio do stack local anterior; dados, usuários e assinaturas anteriores não são copiados. O runner não reseta o banco original. No CI, o fluxo padrão continua `supabase db reset` e `supabase test db`.

Limite: ambiente financeiro remoto e comportamento real do Mercado Pago não foram homologados nesta rodada. Particularmente, alterar a periodicidade de uma recorrência existente precisa confirmar frequência e próxima data de cobrança no provedor. Não foi aplicada migration remota nem publicada esta versão. A próxima etapa segue a [sequência de publicação](../OGRITECH_CATALOGO.md).
