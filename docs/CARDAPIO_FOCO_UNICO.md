# Reestruturação: Ogritech passa a oferecer somente Cardápio

Decisão de 20/10/2026: retirar as três outras ofertas, incluindo páginas e acessos operacionais existentes. Preservar dados históricos.

## Implementação para revisão

- Nova home orientada a Cardápio, demonstração visual, recursos, fluxo, preço e cadastro.
- Contato e assistente exclusivos do Cardápio; painel sem navegação para outros módulos.
- Agenda Online, contratação antiga, agendamento, páginas, propostas e portal do cliente de agenda substituídos por páginas de encerramento com encaminhamento à home e noindex.
- Sitemap e cache atualizados para remover as experiências encerradas.
- Backend de contratação recusa novos testes de outros produtos com HTTP410; lifecycle não gera novas renovações para produtos encerrados.
- Banco: scripts/sql/retire-non-menu-products.sql preparado para desativar disponibilidade dos três produtos e revogar RPCs operacionais públicas. Não executado em staging ou produção nesta alteração.

## Publicação e encerramento de acessos

1. Inventariar clientes e assinaturas dos três produtos no banco e no provedor, conferir compromissos e cancelamentos necessários. Não encerrar acesso deixando recorrências antigas cobrando.
2. Revisar e testar o SQL de retirada em staging; verificar que catálogo, pedidos, autenticação, exportação e assinatura do Cardápio continuam disponíveis.
3. Publicar frontend e handlers na janela aprovada, retirar permissões antigas e confirmar rotas encerradas e ausência de novas renovações.
4. Preservar registros, backups e portabilidade; não excluir contas, negócios, pedidos ou históricos.

Os módulos de origem continuam no código para histórico e compatibilidade administrativa, mas suas páginas não os carregam. A retirada efetiva de permissões no servidor depende da etapa de banco e de publicação. A base desta branch é a branch do PR18, que contém as correções de pagamento ainda em revisão.

A atualização da comunicação inclui minutas de Termos v3.0 e Privacidade v2.0. Antes da publicação, obter revisão aplicável, atualizar BILLING_TERMS_VERSION/BILLING_TERMS_SHA256 e registrar os aceites com a nova versão. Os segredos atuais e aceites históricos não foram alterados.

Verificacao local: 236 testes passaram, sem falhas ou skips; checagem estatica aprovada. Na previa, imagens carregadas, carrossel funcionando e sem overflow horizontal na largura observada. Nenhum deploy ou SQL de retirada foi executado em producao.

Banco: 5 assercoes pgTAP da retirada passaram no staging em transacao com rollback: produtos antigos indisponiveis, Cardapio ativo, public_menu preservado, agendamento e propostas sem acesso publico. Nenhuma alteracao persistente nesta verificacao.

## Revisao da jornada de cadastro, painel e assinatura
- Cadastro alinhado ao identificador de termos 3.0-2026-10-20; configurar versao/hash no servidor somente apos revisao e antes de publicar.
- Painel filtra o catalogo para menu, nao inicializa dados da Agenda em segundo plano e carrega o workspace uma unica vez. Assinatura e dados continuam acessiveis em contas com vinculos historicos multiproduto.
- Assinatura preserva a mensagem e o acesso no cancelamento agendado, limpa Pix e links de estados anteriores, oculta contratacao enquanto carrega e em estados ja pagos ou com pagamento em andamento.
- Retorno do checkout consulta apenas pagamentos pendentes, com limite de tentativas e sem anunciar pagamento recebido antes da confirmacao.
- Backend rejeita novo checkout quando ja existe assinatura ou pagamento pendente, antes de chamar o provedor.
- Verificacao: 241 testes locais sem falhas ou skips e sintaxe dos quatro scripts alterados aprovada. Nenhuma conta criada, cobranca executada ou configuracao de producao modificada nesta revisao.
