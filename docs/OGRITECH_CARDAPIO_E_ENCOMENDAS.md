# Ogritech Cardápio e Ogritech Encomendas

Decisão autorizada pelo usuário em 13/11/2026. Banco e funções publicados em produção; frontend entregue pelo PR #112, com publicação automática no GitHub Pages após merge.

## Oferta

| Produto | Mensal | Anual | Escopo |
|---|---:|---:|---|
| Cardápio | R$ 29,90 | R$ 299,00 | Catálogo com fotos, preços, pesos, variações e adicionais; seleção e resumo para continuar no WhatsApp |
| Encomendas | R$ 49,90 | R$ 499,00 | Recursos operacionais anteriores: catálogo, entrega, retirada, agendamento, recebimento e acompanhamento de pedidos |

O teste inicial dura 14 dias e é único por CPF/CNPJ entre os dois planos. A regra está no banco: a chave `(product_code,tax_document)` permanece compartilhada e a troca não pode ampliar `trial_ends_at` nem alterar `trial_started_at`. Não se cria uma segunda conta para efetuar a troca.

## Comportamento das trocas

- Trocas são feitas pela central de assinatura do painel, pela página `/assinatura/` ou pelo painel administrativo.
- Os recursos mudam na mesma conta, preservando catálogo, imagens, link público e histórico.
- Prazo de teste ou de acesso pago é preservado. O novo preço vale na próxima cobrança, sem cobrança proporcional.
- Trocar um teste já vencido não reabre acesso gratuito.
- Pagamento pendente e cancelamento em andamento precisam ser resolvidos antes da troca.
- Para cartão, o backend atualiza a recorrência com o valor calculado no servidor. Falha no provedor impede a troca; falha posterior de persistência tenta restaurar o valor anterior e registra falha de compensação sem expor credenciais.
- Clientes existentes do antigo Cardápio permanecem na operação completa, agora denominada Encomendas. O plano legado `foundation` e o produto técnico `menu` são mantidos para compatibilidade; o novo plano usa `cardapio`.

## Cardápio público e painel

O consumidor escolhe produtos e opções, revisa quantidades e subtotal estimado, e abre o WhatsApp público configurado. Ainda precisa enviar a mensagem no aplicativo. A seleção não confirma pedido ou disponibilidade. Pagamento e entrega são combinados diretamente com o estabelecimento.

Não há checkout de entrega, criação de pedido, código ou acompanhamento de pedido no Cardápio. O servidor bloqueia os endpoints de criação de pedidos e as políticas RLS bloqueiam o monitor de pedidos nesse plano. O histórico de Encomendas é preservado no downgrade.

O lojista mantém cadastro, edição, preços, fotos, identidade, horários e publicação do catálogo. Configurações de entrega/pagamento, métricas operacionais, pedidos e pedido de teste ficam fora da experiência Cardápio. É necessário configurar um WhatsApp público para publicar; removê-lo exige despublicação.

## Arquivos principais

- `product-offers.js`: catálogo de preços e capacidades utilizado pelos painéis e cadastro.
- `whatsapp-selection.js` e `cardapio/`: seleção pública e mensagem com itens, pesos, opções e subtotal.
- `index.html`, `cardapio-digital/`, `criar-cardapio/`, `contato/`, `assistant-widget.js`: apresentação e contratação das duas ofertas.
- `admin.js`, `painel/`, `commercial-admin.js`, `subscription-admin.js`, `assinatura/`: gestão e troca de planos.
- `supabase/functions/ogritech-billing/`: preços, cadastro, autorização e troca da oferta; `billing-lifecycle` e template financeiro usam o nome contratado.
- `supabase/migrations/20261113175621_split_menu_offers.sql`: catálogo, preços, proteção do teste, recursos e sincronização dos registros.
- `config/menu-release-package.json`, política e lote de migrations: pacote atualizado, mantendo os bloqueios de publicação existentes.

## Verificação

- `npm run validate`: sintaxe, referências locais, classificação das migrations e suíte Node completa. **414 testes Node aprovados**, além da verificação estática e da classificação das 97 migrations.
- Banco local: todas as 27 suítes executadas em transação, após aplicar as migrations posteriores à base local de 28/09. **698 asserções aprovadas**, incluindo 35 novas para a divisão; rollback ao final, sem alterar dados persistidos. Isso é uma validação incremental, não um replay limpo de produção.
- `node scripts/split-offers-browser.mjs`: 9 cenários com fixtures locais, sem requisições externas: planos em desktop/celular, cadastro anual das duas ofertas, seleção pública WhatsApp/checkout e painéis com troca nos dois sentidos, incluindo o painel administrativo. Nenhum erro de JavaScript.
- Os testes do endpoint executam o handler real com banco/provedor substituídos. Testam preços mensais/anuais, autorização e isolamento por empresa, ausência de novo teste, atualização de recorrência, falha do provedor e compensação.
- Evidências de navegador: `outputs/split-offers/browser-report.json` e capturas na mesma pasta. Não houve contratação, mensagem ou cobrança real.

## Publicação

Publicar coordenadamente banco, funções e frontend. O novo frontend depende de `business_whatsapp_shares` e `split_menu_offers`; publicar apenas a página causaria divergência entre recursos anunciados e cobrança.

1. Confirmar o candidato de release e o CI com replay limpo do banco; conferir backup/retorno conforme o procedimento existente.
2. Homologar a migration `split_menu_offers`; WhatsApp já integrava a base atual.
3. Publicar `ogritech-billing`, `billing-lifecycle` e `billing-email-dispatch` com os arquivos compartilhados correspondentes.
4. Alinhar `BILLING_TERMS_VERSION=3.3-2026-11-13` e `BILLING_TERMS_SHA256=a515628a9b422c8f7d108180648480c9ef28a27e90b1b60fd28cff189d265617` aos bytes desta versão de `termos.html`, sem modificar aceites históricos.
5. Publicar frontend e service worker `ogritech-shell-v34`; executar o preflight somente de leitura para ambos os planos, com os quatro valores e os dois catálogos.
6. Homologar troca de plano com o provedor e a recorrência nos ambientes autorizados antes de considerar cobrança real validada.

A publicação foi autorizada pelo usuário. Nenhuma assinatura real foi alterada no provedor pelos testes. Registros históricos de evidências e migrations foram preservados.

## Candidato de publicação — 13/11/2026

Integrado sobre `1d3ac968dcf5964fbc88fca050f153200c8c1d0d`, preservando o tema, a navegação, o cadastro protegido, notificações, comprovantes e relatórios atuais. A migration agora estende as funções atuais sem substituir seus motores. Apenas `split_menu_offers` está pendente de promoção em produção; WhatsApp já estava publicado. Homologação de banco: 35 asserções aprovadas em transação com rollback no staging. Backup: run 43490064152. Restauração isolada: run 43491045932, ambos aprovados.

## Promoção de produção — 13/11/2026

- PR: https://github.com/Edermax/Ogritech-site/pull/112.
- CI integral aprovado: https://github.com/Edermax/Ogritech-site/actions/runs/43495220665 (estática, replay limpo das 97 migrations com 698 asserções SQL, temas, navegação e os nove cenários dos novos planos).
- Migration nativa `split_menu_offers`: staging `20261113192700`; produção `20261113194819`. Histórico remoto com 97 migrations, sem pendências.
- Funções de produção: `ogritech-billing` v20, `billing-lifecycle` v15 e `billing-email-dispatch` v13. Autenticação própria e configuração de JWT preservadas.
- Preflight de produção: quatro preços, readiness de ambos os planos e rejeição de webhook sem assinatura aprovados. Não iniciou conta, cobrança, pagamento ou mensagem.
- Auditoria de segurança: sem achado ERROR; aviso existente de proteção contra senhas vazadas permanece, sem mudança de configuração de Auth nesta entrega.
- Contratações antigas mantêm seus prazos, identidade, catálogo e recursos completos de Encomendas. Os termos 3.3 e seu hash são alinhados ao frontend no momento da liberação.
