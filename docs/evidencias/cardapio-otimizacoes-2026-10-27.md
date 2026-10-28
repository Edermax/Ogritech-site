# Otimizações de uso e recuperação — 27/10/2026

## Correções entregues

- Editar um produto no catálogo publicado preserva sua posição e sort_order. Mudar de categoria remove a origem e insere após os produtos do destino, sem duplicar.
- Sugestões do assistente respeitam o mínimo do produto ao abrir/adicionar; quantidades explícitas válidas continuam preservadas.
- As imagens dos produtos usam loading lazy e decoding async; capa e logo continuam disponíveis no início da página.
- Falhas ao consultar o catálogo oferecem Tentar novamente. A indisponibilidade do assistente opcional não interrompe o catálogo.
- O acompanhamento tem Atualizar pedido. Rejeição de rede permite nova consulta; se já houver status consultado, uma falha posterior preserva esse status e informa que não foi atualizado.
- O assistente libera o envio e preserva a pergunta após falha de rede. Bloqueio de sessionStorage usa sessão temporária em memória.
- O ensaio de restauração exige schema e jornadas do Cardápio por padrão; backups históricos mantêm escolha explícita. IDs antigos de execução/artefato deixaram de ser preenchidos por padrão.

## Validação

Testes de regressão executam os handlers reais para posição do catálogo, mínimos, falhas de rede, retry e bloqueio de armazenamento. Verificação no navegador interno com catálogo fictício publicado do staging, apenas leitura: imagem carregou com lazy/async; consulta com credenciais fictícias inválidas exibiu erro com opção de nova consulta, sem criar pedido.

Nenhum backup, restauração remota, convite, aceite, cobrança ou pedido novo foi executado. A ativação da Diniz continua aguardando dados e aceite da proprietária.
