# Evidência — Fase 7B

Data local: 10/09/2026.

## Resultado

O beta automatizado do Ogritech Cardápio passou em 8 de 8 cenários: pizzaria, lanchonete/hamburgueria, restaurante/marmitaria e confeitaria/bolos/doces, cada um em desktop de 1440 × 1000 e celular de 390 × 844.

Cada cenário carregou o cardápio real do frontend com fixture sintética em memória, consultou o assistente determinístico, exigiu confirmação antes de adicionar uma opção, configurou o produto, revisou o carrinho, aceitou o aviso de privacidade e criou exatamente um pedido fictício. O navegador confirmou conteúdo visível, ausência de overflow horizontal, zero erros de JavaScript e zero origem externa.

## Evidências produzidas

- relatório estruturado: `outputs/menu-beta-7b/report.json`;
- oito capturas em `outputs/menu-beta-7b/`, uma por segmento e viewport;
- contrato resumido: `config/menu-beta-phase-7b-result.json`;
- executor repetível: `scripts/menu-beta-browser.mjs`.

Quatro capturas representativas foram inspecionadas visualmente após o ensaio. Todas apresentaram conteúdo, identidade Ogritech, indicação explícita de demonstração, catálogo, preço, finalização e confirmação do pedido, sem página vazia ou sobreposição de erro.

## Isolamento e limpeza

Todas as requisições foram interceptadas e limitadas à origem `.invalid` de cada cenário. Não houve chamada a Supabase, OpenAI ou outro serviço. Os contextos do navegador foram fechados e os estados em memória descartados. Não existem dados remotos para limpar.

## Limites

O resultado aprova somente a simulação automatizada local. Não houve participante humano, banco remoto, empresa real, mensagem, WhatsApp, IA paga ou publicação. O beta humano e qualquer staging ou produção continuam dependentes de nova autorização.

## Validação geral

A validação geral foi aprovada: 18 scripts, 10 páginas, 60 migrations classificadas e 116 testes Node passaram. O executor de navegador também passou separadamente nos 8 cenários.
