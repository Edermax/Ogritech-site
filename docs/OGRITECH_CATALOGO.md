# Ogritech Catálogo — decisão de 17/11/2026

Estado: implementado e validado localmente na branch `feat/catalogo-planos-segmentos-20261117`, baseada em `origin/main` no commit `a9a6675`. Homologação de staging concluída; banco e funções promovidos em 17/11. O frontend é publicado pelo PR #146, com autorização do usuário. Esta especificação substitui a oferta anterior para novas contratações; condições e evidências históricas continuam preservadas.

## Oferta

### Estoque básico no Completo

Implementação local de 17/11/2026: controle opcional por produto, quantidade atual em unidades inteiras e histórico de entradas, saídas, ajustes e pedidos. O saldo é compartilhado entre opções do mesmo produto; estoque por combinação de variantes continua fora do escopo. Acesso exclusivo ao Completo efetivo, inclusive no teste de 14 dias. Veja [implementação e testes](evidencias/estoque-local-2026-11-17.md).

### Evolução local da vitrine e dos segmentos

Em 17/11/2026, o usuário aprovou a adequação da divulgação, cadastro, páginas públicas e painéis à vitrine online. A implementação está na branch `feat/vitrine-segmentos-local-20261117`, autorizada somente localmente. A home apresenta alimentação, artesanato e colecionáveis; a taxonomia central inclui 15 categorias amplas e preserva as especializações de alimentação, totalizando 19 opções. Alimentação usa “Cardápio”, artesanato usa “Catálogo” e outros produtos usam “Vitrine”. A alteração explícita de atividade preserva catálogo, endereço, histórico e contrato. Detalhes, testes e acesso à prévia: [relatório local](evidencias/vitrine-segmentos-local-2026-11-17.md).

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

O próximo valor/ciclo fica registrado na mesma assinatura Ogritech; o prazo adquirido permanece em `access_until`/`current_period_end`. No cartão, a API do Mercado Pago ignorou a alteração de frequência durante a homologação. Por isso, a troca de ciclo cancela e confirma a recorrência anterior antes de gravar a nova escolha. O cliente precisa autorizar um novo checkout, cujo início respeita o prazo adquirido. Não há duas recorrências ativas. A reserva durável permite retomar uma falha após o cancelamento, e notificações atrasadas da recorrência encerrada são ignoradas; estornos financeiros continuam seguindo o pagamento efetivo. Contratos sem cadastro financeiro recebem orientação explícita, sem ignorar silenciosamente a periodicidade pedida. Os quatro valores e intervalos foram criados/relidos como pending na conta de teste, sem cartão ou cobrança, e cancelados com confirmação. Isso não equivale a uma captura de pagamento real.

Cupom inicial: um código de desconto fixo por negócio, com validade opcional e valor limitado ao subtotal de produtos. Código e total são validados no servidor, vinculados à idempotência; o desconto não altera a assinatura Ogritech. Capa usa o mecanismo existente de rascunho e publicação da identidade visual.

## Custos e publicação

Novos uploads são redimensionados e comprimidos antes do envio direto ao storage; limites, MIME, namespaces e autorização do armazenamento permanecem. Não foi contratada infraestrutura adicional nem criada franquia arbitrária de visitas. Sem auditoria de consumo remoto, não há estimativa de custo em reais por conta.

Migrations desta entrega: `20261117132401_catalog_profiles_and_commercial_plans.sql`, `20261117161331_catalog_cycle_reauthorization.sql` e `20261117162012_fix_catalog_cycle_claim_parameter.sql`, nessa ordem, antes das funções e do frontend. A política de produção registra as três migrations aplicadas e seus aliases remotos. A publicação foi autorizada pelo responsável em 17/11. A mudança exige alinhamento da versão `4.0-2026-11-17` e do SHA-256 dos termos, sem reescrever aceites antigos.

Reversão: suspender novas adesões das ofertas problemáticas e manter backend compatível com os contratos já criados. Não restaurar snapshots antigos de clientes, pagamentos ou pedidos. Reverter apenas nomes ou frontend sem suporte aos novos planos pode causar divergência comercial.

## Verificação

Baseline antes das mudanças: 474 testes Node aprovados. Resultado final: `npm run validate` aprovado com 485 testes; aplicação limpa das 110 migrations e 947 asserções pgTAP em 34 arquivos, sem falhas. O banco de validação fica em um container local isolado sem rede; nenhum banco remoto ou banco local de uso anterior foi resetado.

`npm run test:catalog-browser`: 25 jornadas aprovadas, sem erros de página ou chamadas externas. Abrange três perfis, dois planos, dois ciclos, divulgação em celular/desktop, seleção preservada no cadastro, catálogo público, orçamento pelo WhatsApp, troca de apresentação, controles do Completo no teste, restrições do Essencial e otimização de imagens. As suítes de regressão `split-offers-browser.mjs` (22 verificações), `configurable-plans-browser.cjs` e `menu-customization-browser.mjs` também passaram. Os navegadores usam dados sintéticos; não comprovam uma cobrança real. Evidências reproduzíveis e limites estão em [validação local](evidencias/catalogo-validacao-local-2026-11-17.md).

## Áreas afetadas e reaproveitamento

| Área | Implementação |
| --- | --- |
| Divulgação e cadastro | Home, `/cardapio-digital/`, contato e `/criar-cardapio/`; novos preços e links preservando perfil/ciclo. Alimentação usa Cardápio Essencial/Completo, vinculados ao Ogritech Catálogo. |
| Painel do negócio | `commercial-admin.js` e `catalog-admin.js`; modelos existentes, apresentação, cupom fixo, capa e histórico restrito. |
| Administração e assinatura | Catálogo administrativo de planos existente; `product-offers.js`, `subscription-admin.js` e `/assinatura/`; snapshots de contrato, seleção de plano/ciclo e capacidades efetivas. |
| Catálogo público | `/cardapio/`, apresentação central em `catalog-profiles.js`, seleção/WhatsApp ou checkout conforme autorização do servidor; orçamento sem venda por preço de referência. |
| Banco e cobrança | Uma migration nova, sem modificar as anteriores; billing, lifecycle e webhook existentes; novos preços versionados e recorrência de 1 ou 12 meses. |
| Imagens e cache | Storage e identidade existentes; compressão de uploads, nomes imutáveis e novo shell do service worker. |

Não foram criadas tabelas de catálogo, cobrança ou pedidos por segmento. As colunas novas registram versão comercial, acesso adquirido na transição, ciclo da operação e um cupom por negócio. Um registro privado das recorrências encerradas impede que seu cancelamento atrasado altere o contrato substituto. Modelos, categorias, preços, opções, relatórios por estabelecimento, publicação em rascunho, storage e isolamento já existentes foram reaproveitados.

## Sequência de publicação preparada

1. Revisar o commit e o pacote imutável gerado por `npm run prepare:menu-release`. Conferir gates atuais, backup/restore e o dry-run da migration; autorização histórica de outro release não libera este.
2. Em staging autorizado, aplicar a migration nova, publicar as três funções financeiras alteradas e alinhar a versão/hash dos termos; publicar o frontend compatível e invalidar o shell. Homologar Pix/cartão, quatro preços, alteração de ciclo, próxima cobrança, recuperação e eventos duplicados, usando apenas fixtures autorizadas.
3. Após homologação e autorização de produção, aplicar a mesma ordem: banco → funções/configuração/termos → frontend/cache. Conferir planos ativos, contratos antigos, teste único, domínio público, isolamento e monitoramento sem gerar mensagens ou cobranças reais de teste.
4. Se houver falha, interromper novas adesões e reconciliar operações pendentes. Preservar dados e contratos criados durante o release; não executar uma reversão destrutiva da migration.

Publicação autorizada em 17/11. Backup criptografado e restauração aprovados; staging passou 48 asserções com rollback. Acompanhe o estado do release em [publicação](evidencias/catalogo-publicacao-2026-11-17.md). Os gates históricos de operação/fiscal/jurídico permanecem registrados em `config/menu-production-launch.json`, sem tratá-los como aprovados por testes de código. Não há uma estimativa de consumo real do provedor ou franquia numérica de tráfego definida nesta entrega.

Fontes técnicas: [Supabase — uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads), [Supabase — RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Mercado Pago — atualização de assinatura](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/update-preapproval/put).
