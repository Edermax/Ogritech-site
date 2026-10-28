# Verificações independentes do lançamento — 27/10/2026

## Mudanças

- Gate de lançamento passou a usar os dez critérios do contrato do Cardápio, preservando autorizações e pendências. Não consulta mais o diário, beta e incidentes exclusivos da antiga Agenda.
- Incidentes de produção, backup, schema e segurança Auth continuam bloqueando o parecer técnico. Issues com múltiplas labels são contadas uma vez.
- O workflow executa permissões e pedidos em banco local reconstruído e isolado, substituindo o bot da Agenda. Não chama clientes ou banco de produção para criar registros.
- O pacote de evidências acompanha os arquivos e diretórios citados pelo contrato, registra arquivos ausentes e exige resultado explícito do teste de banco para não anunciar aprovação com teste ausente, cancelado ou falho.
- A auditoria de schema foi reconciliada com o banco já publicado: 79 migrations, última fix_menu_catalog_draft_delete_order. A expectativa antiga de 55 migrations causava alerta indevido. A expectativa de políticas sobrepostas foi reduzida de 11 para zero; as exigências de RLS e ausência de definers públicos expostos continuam em zero.

## Verificação

- 298 testes Node passaram. Incluem bloqueio comercial mesmo com testes técnicos aprovados, falha/ausência do teste de banco, expansão de evidências e ausência de arquivos.
- SQL completo da auditoria executado por leitura em produção, sem exceções e sem modificações.
- Consulta independente: 79 migrations; zero tabelas públicas sem RLS; zero grupos de políticas permissivas sobrepostas; zero SECURITY DEFINER públicos executáveis por anon/authenticated.
- Verificação estática e política de classificação de migrations passaram. A política de release histórica ainda descreve 55 aplicadas e 24 retidas; não foi usada como inventário remoto atual.

## Limites preservados

Não foram criadas contas, aceites, assinaturas, pagamentos, convites ou pedidos. Nenhum preço ou cardápio da Diniz foi publicado. Cadastro e aceite continuam com a proprietária. O alerta do catálogo público permanece dependente de um cardápio real publicado; não usar exemplo para encobri-lo.
