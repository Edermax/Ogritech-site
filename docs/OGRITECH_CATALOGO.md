# Ogritech Catálogo — decisão de 17/11/2026

Estado: implementado e validado localmente na branch `feat/catalogo-planos-segmentos-20261117`, baseada em `origin/main` no commit `a9a6675`. Ainda não homologado remotamente ou publicado. Esta especificação substitui a oferta anterior para novas contratações; condições e evidências históricas continuam preservadas.

## Oferta

| Plano | Mensal | Anual | Capacidades |
| --- | ---: | ---: | --- |
| Catálogo Essencial | R$ 9,90 | R$ 99,00 | Produtos, fotos, opções, identidade básica, link, QR Code e seleção para WhatsApp. |
| Catálogo Completo | R$ 29,90 | R$ 299,00 | Essencial, operação de pedidos, entrega local, retirada, relatórios existentes, cupom fixo e capa. |

Anual significa uma cobrança a cada 12 meses, sem desconto adicional ou parcelamento prometido. Os recursos são iguais nas duas periodicidades. Novas ofertas usam os códigos `catalogo-essencial` e `catalogo-completo`, com as famílias de capacidades existentes `cardapio` e `encomendas`. O produto técnico continua `menu`.

Planos antigos `cardapio` e `foundation` deixam de aceitar novas contratações; seus IDs, preços, snapshots e assinaturas existentes permanecem. Planos administrativos personalizados são preservados. Preço de catálogo não substitui preço contratado.

## Segmentos

Ogritech Catálogo é a apresentação geral. Alimentação mantém a experiência Cardápio, com os modelos de pizzaria, lanchonete, restaurante e confeitaria. Artesanato/personalizados e produtos em geral usam os modelos `crafts` e `products` da tabela de modelos existente. A apresentação não decide permissões ou cobrança.

Reutilizados: produtos, categorias, opções, variações, quantidade mínima, antecedência, solicitação de orçamento, publicação, identidade, pedidos, WhatsApp, QR Code e assinatura. Os novos modelos criam categorias iniciais; não criam produtos publicados. Mudar a apresentação de um catálogo já existente usa uma operação separada e preserva produtos, endereço e assinatura.

Não fazem parte desta entrega: estoque por combinação de variações, frete nacional, integrações com transportadoras ou marketplaces, editor visual de personalização, serviço adicional de IA ou anúncios de terceiros.

## Teste e transição

14 dias únicos por CPF/CNPJ e responsável, compartilhados entre planos, segmentos e periodicidades. Novas contratações experimentam o Completo, preservando a escolha futura do Essencial ou Completo e do ciclo mensal ou anual. Não há gratuito permanente nem cartão obrigatório no início.

Trocas não ampliam teste ou prazo adquirido. Redução do Completo preserva as capacidades pagas até o fim do período comprado. Alterações de plano e ciclo usam reserva durável e reconciliação do provedor, sem cobrança proporcional. Cobrança anual exige recorrência de 12 meses. Pedidos anteriores possuem uma consulta restrita com conclusão/cancelamento, sem permitir novos pedidos fora do Completo.

O próximo valor/ciclo fica registrado na mesma assinatura; o prazo adquirido permanece em `access_until`/`current_period_end`. No cartão, o backend só confirma a alteração se o provedor devolver valor e intervalo corretos; falhas disparam reconciliação e mantêm a reserva quando a recuperação não é confirmada. A aceitação real da alteração de frequência e a manutenção da próxima data de cobrança no Mercado Pago precisam ser homologadas antes de liberar esta versão remotamente. Contratos legados sem registro financeiro recebem uma orientação explícita para configurar pagamento antes de mudar o ciclo; a solicitação não é ignorada silenciosamente. As provas locais substituem o provedor por uma implementação sintética, sem cobranças.

Cupom inicial: um código de desconto fixo por negócio, com validade opcional e valor limitado ao subtotal de produtos. Código e total são validados no servidor, vinculados à idempotência; o desconto não altera a assinatura Ogritech. Capa usa o mecanismo existente de rascunho e publicação da identidade visual.

## Custos e publicação

Novos uploads são redimensionados e comprimidos antes do envio direto ao storage; limites, MIME, namespaces e autorização do armazenamento permanecem. Não foi contratada infraestrutura adicional nem criada franquia arbitrária de visitas. Sem auditoria de consumo remoto, não há estimativa de custo em reais por conta.

Migration nova: `20261117132401_catalog_profiles_and_commercial_plans.sql`. Deve preceder funções e frontend compatíveis. A política de produção marca a migration como retida; uma autorização antiga de outro release não comprova aprovação desta publicação. A mudança exige alinhamento da versão `4.0-2026-11-17` e do SHA-256 dos termos, sem reescrever aceites antigos.

Reversão: suspender novas adesões das ofertas problemáticas e manter backend compatível com os contratos já criados. Não restaurar snapshots antigos de clientes, pagamentos ou pedidos. Reverter apenas nomes ou frontend sem suporte aos novos planos pode causar divergência comercial.

## Verificação

Baseline antes das mudanças: 474 testes Node aprovados. Resultado final: `npm run validate` aprovado com 480 testes; aplicação limpa das 108 migrations e 938 asserções pgTAP em 34 arquivos, sem falhas. O banco de validação fica em um container local isolado sem rede; nenhum banco remoto ou banco local de uso anterior foi resetado.

`npm run test:catalog-browser`: 24 jornadas aprovadas, sem erros de página ou chamadas externas. Abrange três perfis, dois planos, dois ciclos, divulgação em celular/desktop, seleção preservada no cadastro, catálogo público, orçamento pelo WhatsApp, troca de apresentação, controles do Completo no teste, restrições do Essencial e otimização de imagens. As suítes de regressão `split-offers-browser.mjs` (22 verificações), `configurable-plans-browser.cjs` e `menu-customization-browser.mjs` também passaram. Os navegadores usam dados sintéticos; não comprovam uma cobrança real. Evidências reproduzíveis e limites estão em [validação local](evidencias/catalogo-validacao-local-2026-11-17.md).

## Áreas afetadas e reaproveitamento

| Área | Implementação |
| --- | --- |
| Divulgação e cadastro | Home, `/cardapio-digital/`, contato e `/criar-cardapio/`; novos preços e links preservando perfil/ciclo. Alimentação usa Cardápio Essencial/Completo, vinculados ao Ogritech Catálogo. |
| Painel do negócio | `commercial-admin.js` e `catalog-admin.js`; modelos existentes, apresentação, cupom fixo, capa e histórico restrito. |
| Administração e assinatura | Catálogo administrativo de planos existente; `product-offers.js`, `subscription-admin.js` e `/assinatura/`; snapshots de contrato, seleção de plano/ciclo e capacidades efetivas. |
| Catálogo público | `/cardapio/`, apresentação central em `catalog-profiles.js`, seleção/WhatsApp ou checkout conforme autorização do servidor; orçamento sem venda por preço de referência. |
| Banco e cobrança | Uma migration nova, sem modificar as anteriores; billing, lifecycle e webhook existentes; novos preços versionados e recorrência de 1 ou 12 meses. |
| Imagens e cache | Storage e identidade existentes; compressão de uploads, nomes imutáveis e novo shell do service worker. |

Não foram criadas tabelas de catálogo, cobrança ou pedidos por segmento. As colunas novas registram versão comercial, acesso adquirido na transição, ciclo da operação e um cupom por negócio. Modelos, categorias, preços, opções, relatórios por estabelecimento, publicação em rascunho, storage e isolamento já existentes foram reaproveitados.

## Sequência de publicação preparada

1. Revisar o commit e o pacote imutável gerado por `npm run prepare:menu-release`. Conferir gates atuais, backup/restore e o dry-run da migration; autorização histórica de outro release não libera este.
2. Em staging autorizado, aplicar a migration nova, publicar as três funções financeiras alteradas e alinhar a versão/hash dos termos; publicar o frontend compatível e invalidar o shell. Homologar Pix/cartão, quatro preços, alteração de ciclo, próxima cobrança, recuperação e eventos duplicados, usando apenas fixtures autorizadas.
3. Após homologação e autorização de produção, aplicar a mesma ordem: banco → funções/configuração/termos → frontend/cache. Conferir planos ativos, contratos antigos, teste único, domínio público, isolamento e monitoramento sem gerar mensagens ou cobranças reais de teste.
4. Se houver falha, interromper novas adesões e reconciliar operações pendentes. Preservar dados e contratos criados durante o release; não executar uma reversão destrutiva da migration.

Pendências reais: homologação financeira remota, dry-run/backup/advisors atualizados e publicação autorizada. Os gates históricos de operação/fiscal/jurídico permanecem registrados em `config/menu-production-launch.json`, sem tratá-los como aprovados por testes de código. Não há uma estimativa de consumo real do provedor ou franquia numérica de tráfego definida nesta entrega.

Fontes técnicas: [Supabase — uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads), [Supabase — RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Mercado Pago — atualização de assinatura](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/update-preapproval/put).
