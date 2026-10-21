# Preparação do pacote de publicação — 20/10/2026

## Entrega

Comando local somente leitura para gerar um pacote a partir de um commit Git, com hashes dos arquivos e fila de migrations. O workflow de validação gera e armazena o pacote do candidato por sete dias. Não existe modo de aplicação ou conexão de banco nesse comando.

O pacote contém 23 migrations pendentes, sete funções de produção com autenticação explícita, arquivos compartilhados, arquivos essenciais do frontend, referência de rollback e sete gates ainda pendentes. Ferramentas sandbox e IA externa de staging são excluídas. A decisão de publicação continua bloqueada; a geração do artefato não a altera.

## Divergência corrigida no candidato

Consulta somente leitura das funções do staging confirmou `cep-lookup` versão 13, `verify_jwt=false`, import map ativo. Faltava seção correspondente no `supabase/config.toml`. O candidato agora declara a autenticação de gateway e os caminhos do entrypoint/import map, preservando a validação da chave pública no handler. O pacote recusa funções sem configuração explícita. Nenhum deploy remoto foi executado.

## Configuração concluída

Variável pública `MENU_HEALTH_PUBLISHABLE_KEY` criada no environment production do GitHub, usando a mesma chave pública do frontend para o projeto `mvzcoaiiwytycdqcvydf`. Nenhum token privilegiado ou secret de pagamento foi criado ou substituído. O monitor candidato e o restante da aplicação ainda precisam de promoção coordenada; a URL de saúde só poderá ser corrigida para um cardápio realmente publicado.

## Validação

Seis testes específicos aprovados: inventário e hashes, bloqueio de funções de homologação, proteção contra projeto de staging, cauda incompleta de migrations, entrypoint ausente, autenticação omitida e leitura de snapshot imutável. Validação completa e execução do pacote no commit candidato serão confirmadas pelo CI do PR.

## Pendências preservadas

Dados societários, revisão jurídica, implantação/emissão fiscal e responsáveis de suporte aguardam definição. O fechamento de novas entradas e a republicação do commit anterior ainda precisam de ensaio remoto. Não foram reaprovadas as jornadas do lojista e dos pedidos: os aceites existentes permanecem preservados. Não foram criados pagamentos, pedidos, clientes, backups adicionais ou publicações nesta rodada.
