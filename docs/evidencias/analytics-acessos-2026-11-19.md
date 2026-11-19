# Estatísticas de acesso e jornada — 19/11/2026

Solicitação: acompanhar visitantes, páginas, cliques, alcance da navegação e abandono de etapas. O usuário escolheu explicitamente acompanhar dentro do administrador da Ogritech. Implementação em `feat/analytics-acessos-20261119`, baseada no main publicado `3bb000b854772c4b12efaae779e98278f33b99ba`.

## Produto

Administração → Resumo → Tráfego e conversão; atalho “Acompanhar visitas e cliques” no resumo. Filtros por período (hoje, 7, 30, 90 dias ou intervalo personalizado) e por área (site/cadastro, painel/plataforma, vitrines/pedidos ou todas). Datas do relatório usam America/Sao_Paulo.

O relatório mostra visitantes estimados por navegador, sessões, visualizações, engajamento, evolução diária, páginas e marcos de rolagem, tempo ativo, ações clicadas, origem por categoria, classe de dispositivo e passagens entre páginas. Os funis de cadastro e de uso do painel contam visitantes que realmente avançaram na ordem das etapas, dentro do período. O cadastro só é contado como concluído após a confirmação da criação; o salvamento/publicação só gera evento após sucesso ou confirmação do estado salvo. Os filtros não deixam uma resposta antiga sobrescrever a consulta mais recente. Há exportação CSV apenas de dados agrupados.

Não há gravação de tela, mapa de coordenadas, captura de teclas ou identificação nominal de visitantes. A lista “Onde clicam” mostra ações previstas (ex.: criar vitrine, escolher plano, entrar, abrir Produtos, adicionar à sacola), sem coletar textos do DOM ou nomes de produtos. A origem é uma categoria fixa; campanhas e URLs livres não são armazenadas. Rotas com loja ou pedido viram códigos genéricos. Tokens e parâmetros de URL não são enviados.

## Coleta e interpretação

A medição opcional fica desativada até a pessoa permitir. Recusar e permitir têm a mesma apresentação; “Preferências de estatísticas” permite rever a escolha. Revogar descarta a fila não enviada, impede novas requisições e remove os identificadores locais. Bloqueio de armazenamento do navegador não quebra o site. A coleta fica fora das rotas administrativas, de recuperação de senha, das soluções encerradas e de visitas de homologação/robôs identificados, salvo teste sintético explicitamente habilitado.

A preferência tem validade de 180 dias e o identificador aleatório do navegador, de 90 dias. Valores expirados deixam de autorizar a coleta ou identificar o navegador. A sessão por aba é renovada após 30 minutos sem evento ou 12 horas de duração. Não há vínculo com conta, nome, e-mail, telefone, estabelecimento ou pedido. Navegadores distintos podem ser a mesma pessoa; recusas, bloqueadores, falhas de rede e mudanças de dispositivo reduzem a cobertura. O relatório sinaliza essas limitações. O histórico detalhado começa na ativação; visitas anteriores não são reconstruídas.

Eventos são enviados em lotes de até 20, com IDs de deduplicação e fila limitada. A saída da página usa keepalive e preserva cliques mesmo com outro envio pendente. A ordem usa o horário de ocorrência e um contador monotônico da sessão, permitindo que lotes cheguem fora de ordem. O servidor recusa relógios mais de 24 horas atrasados ou mais de cinco minutos adiantados. O horário de recebimento é separado e controla a retenção. Abas ocultas não aumentam o tempo ativo. Repetir uma permissão já válida não cria visualização adicional.

## Banco e segurança

Migration `platform_usage_analytics`: quatro tabelas privadas com RLS e sem acesso direto aos clientes; entrada pública estritamente validada e consulta agregada restrita a administrador da plataforma com perfil ativo. Os wrappers públicos são security invoker; as implementações privadas fixam search_path e conferem as permissões antes da leitura. O proprietário de um estabelecimento não pode ler métricas globais. Não há alteração de produtos, preços, estoque, pedidos ou assinaturas existentes.

O coletor aceita apenas um vocabulário fechado, rejeita campos excedentes, limita tamanho/lote e impede misturar visitantes/sessões. IDs iguais são idempotentes. Sinais de rede são usados somente como proteção adicional contra abuso, não como autenticação: recebem HMAC com segredo privado e variação diária antes de entrar em uma tabela temporária de limites. Endereço e cabeçalhos brutos não são persistidos. Há limites por minuto e por sessão; analytics de navegador continua sendo uma medição aproximada, sem finalidade contábil ou de autorização.

Uma rotina diária descarta eventos recebidos há mais de 90 dias e sessões expiradas. Ela também remove sinais de abuso com mais de dois dias; considerando o intervalo entre execuções, esses códigos podem permanecer por até três dias. Os novos objetos não dão permissão direta de leitura de tabelas privadas. Índices cobrem período, retenção, sessão/visitante e consulta do funil.

O desenho das opções de privacidade segue as orientações de escolha e revogação do [Guia de Cookies da ANPD](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-cookies-e-protecao-de-dados-pessoais.pdf). Os privilégios e funções seguem a [documentação oficial do Supabase](https://supabase.com/docs/guides/database/functions). O aviso público de privacidade passa à versão 2.1, descrevendo o comportamento implementado, mantendo a indicação anterior de minuta para revisão. Isso não constitui uma certificação jurídica de conformidade.

## Validação e estado da release

As 56 asserções SQL locais passaram em transação revertida, incluindo privilégios, campos pessoais rejeitados, deduplicação, ordem real versus ordem de chegada, intervalo de datas, superfícies e retenção. O navegador aprovou 29 verificações de consentimento, rolagem/tempo ativo, fila, recusa/revogação, CSV, falhas e filtros, além de temas claro/escuro em 320, 390, 768 e 1440 px. A navegação administrativa existente também passou. Uma escolha mantida em outra aba não apaga a fila nem cria visualização adicional; ações anteriores à permissão não são reprocessadas como atividade coletada. A primeira validação identificou inclusão indevida de scripts em duas rotas encerradas; elas foram restauradas sem scripts, preservando a regra anterior.

Homologação: migration `20261119115857`, total de 115 migrations. As 56 asserções passaram em transação revertida, com zero estabelecimento e zero eventos sintéticos remanescentes. Os advisors acrescentaram somente quatro avisos informativos de tabelas privadas com RLS e acesso negado por padrão, correspondentes às quatro tabelas novas. O aviso anterior de senhas vazadas permanece.

505 testes Node passaram. A navegação administrativa anterior passou nos oito cenários. O [CI 44521732082](https://github.com/Edermax/Ogritech-site/actions/runs/44521732082) aprovou as três suítes no candidato inicial `878c6625ad53e4d937ff3c225f3d2e3e0bce78f0`, com replay de 115 migrations, 1.205 asserções em 39 arquivos e concorrência. O candidato final inclui os ajustes testados para não reprocessar ações anteriores à permissão e para não duplicar visualizações ao manter a escolha em outra aba.

Os endpoints reais de staging também foram conferidos por HTTP com a chave pública: lote vazio recusado com HTTP 400/22023 e relatório anônimo recusado com HTTP 401/42501. Essas sondas enviaram zero eventos válidos e não alteraram clientes.

## Autorização de produção pendente

A aplicação de `platform_usage_analytics` no projeto de produção foi recusada pela revisão automática antes de executar SQL. Motivo informado: a migration cria coleta persistente de dados e expõe RPCs anônimos; sua publicação em produção não foi explicitamente autorizada pelo usuário. A escolha de usar o administrador confirma o local de consulta, mas não foi aceita pela revisão como autorização suficiente para essa aplicação.

Nenhum caminho alternativo foi usado para contornar o bloqueio. A consulta somente de leitura confirmou 114 migrations, ausência da nova tabela e do novo coletor em produção. O frontend continua no commit publicado `3bb000b854772c4b12efaae779e98278f33b99ba`; o PR #157 não foi integrado. O lote permanece não autorizado e retido até resposta explícita para aplicar a migration em produção e publicar o monitoramento do PR #157. Os relatórios continuam restritos ao administrador; apenas o recebimento de eventos foi projetado para visitantes sem login.

Não foram enviados eventos sintéticos a produção. Capturas e logs ficam em `outputs/analytics-acessos-20261119/` na raiz e `outputs/usage-review/` no worktree. O ambiente de teste é exclusivo e não contém cópia de clientes. O CI do candidato final será guardado na evidência local antes do pedido final de autorização.
