# Republicação pela hospedagem real — 21/10/2026

## Resultado

A mesma versão já publicada foi republicada pelo GitHub Pages com sucesso:

- Commit: `1771d9c5d737682329e775b22d8e4ba171f7075e`.
- Workflow exclusivo do Pages: `336963902`, `dynamic/pages/pages-build-deployment`.
- [Execução 39289627446, tentativa 2](https://github.com/Edermax/Ogritech-site/actions/runs/39289627446/attempts/2), conclusão `success`, encerrada em **21/10/2026 às 00h54min15s de Brasília**.
- Jobs de build, status e deploy aprovados. Nenhuma rotina de cobrança, função Supabase, migration ou secret foi executada/alterada.
- A referência de `main` e o commit servido conferiam com o alvo antes do ensaio. Não houve merge dos candidatos de Cardápio.

A reexecução usa o SHA do evento original, conforme a [documentação do GitHub](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs). A API legada de builds do Pages continuou apresentando os timestamps da publicação inicial de 19/10; a evidência temporal deste exercício vem da tentativa 2 do workflow e de sua conclusão de deploy.

## Verificação HTTPS

O comando `node scripts/menu-production-rollback-rehearsal.mjs --hosted` verificou homepage, página/JavaScript do Cardápio, página/JavaScript de acompanhamento e painel. Todos retornaram HTTP 200 e conteúdo equivalente ao snapshot Git antes e depois; a conferência posterior foi concluída às **00h54min48s de Brasília**.

Quatro arquivos conferem byte a byte. A homepage e o painel recebem a proteção de e-mails do Cloudflare. A primeira comparação estrita detectou essa divergência e impediu avançar até sua identificação. A verificação agora reverte somente os links e spans de e-mail protegidos e o script exato de decodificação, mantendo hashes do conteúdo bruto e verificado. Nenhuma normalização genérica de HTML, espaços, texto ou scripts é aplicada. Testes garantem que mudança no JavaScript e injeção de outro script continuam divergentes.

As seis respostas apresentaram HSTS e `X-Content-Type-Options: nosniff`. Isso não comprova todos os controles possíveis da hospedagem, ausência de interrupção durante todo o deploy ou funcionamento de todos os assets e scripts no navegador.

## Limite de conclusão

Houve uma operação remota de republicação do frontend, da mesma versão existente. Os candidatos nos PRs permanecem sem promoção. O fechamento de entradas e a preservação do acompanhamento foram comprovados no CI isolado anterior, com 530 asserções SQL aprovadas; não foram repetidos com pedidos reais.

A recuperação do monitor funcional em produção continua pendente de catálogo e contratação prontos no lançamento coordenado. O gate de rollback permanece parcial; o exercício não deve ser apresentado como rollback entre versões diferentes ou homologação integral de produção.
