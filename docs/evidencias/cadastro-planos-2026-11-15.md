# Cadastro e gestão de planos — 15/11/2026

O administrador encontra **Criar novo plano** em **Financeiro e planos → Planos**. O formulário permite nome/código, base Cardápio ou Encomendas, preços mensal/anual, descrição, recursos apresentados, destaque, ordem, limite de usuários e disponibilidade para novas adesões. Nome, código e base são fixos após criar. Recursos escritos no formulário são descrições comerciais; as permissões efetivas seguem a base selecionada. Não há composição arbitrária de permissões.

Novos planos possuem link próprio de contratação. Os cadastros dedicados preservam a modalidade escolhida e apresentam os preços, benefícios e limite de usuários. O painel de assinatura, a contratação, a troca de plano, o ajudante e os e-mails existentes reconhecem o nome do plano. O formulário mantém os dados após falha ou alteração de preço e exige nova confirmação do valor atualizado.

Os valores dos planos principais permanecem preservados. Editar preços vale para novas contratações; cobranças já contratadas usam os valores registrados na assinatura. Desativar um plano impede novas adesões, mantendo o acesso e os limites das assinaturas existentes. Trocas entre variantes da mesma base são reconhecidas pelo ID do plano e não reiniciam o teste gratuito.

## Segurança e cobrança

- Criação/edição usa RPC administrativa com autorização no servidor, validação e auditoria. Acesso anônimo e gestor comum foram recusados nos testes.
- Preços vêm do catálogo no servidor; valores enviados pelo navegador não definem cobranças. O valor exibido é conferido antes de iniciar a contratação ou uma troca paga.
- Trocas preservam reservas duráveis e compensação do provedor. Se o preço mudar durante a operação, a alteração não é confirmada com valor divergente.
- Dados de cobrança permanecem em schema privado e a consulta pública expõe somente planos ativos e campos comerciais.

## Banco e publicação do servidor

| Migration | Arquivo local | Staging | Produção |
| --- | --- | --- | --- |
| configurable_menu_plans | 20261115135337 | 20261115145119 | 20261115154232 |

Ambientes com 102 migrations; nenhuma pendência, nenhum reparo de histórico. `ogritech-billing` v35 em staging/v24 em produção (bundle SHA-256 `30763fd55f7e1341cf6d982eccf98b7b359d6f784ee630aa7ea2bc915df36284`). `billing-email-dispatch` v19 em staging/v15 em produção. As funções mantêm autenticação própria e a configuração anterior do gateway.

As duas contratações existentes mantiveram os mesmos valores mensal/total e datas de término do teste: resumo antes/depois `3f7ecd5add782e56a9c83335a77d72a3`. Não foram criadas contas, cobranças, pedidos ou planos de clientes reais nos testes. Um SKU sintético usado na cotação remota de staging foi desativado ao final. O disparador de e-mails não foi invocado para testes.

Consulta anônima de produção retornou os dois planos principais corretos; anônimo não tem EXECUTE no cadastro administrativo. Advisors de saúde sem achados; segurança sem achados novos relacionados à mudança. Permanecem os avisos anteriores sobre tabelas sem políticas de leitura e [proteção contra senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Validação

- 451 testes existentes da aplicação aprovados, mais dois casos novos de identidade do plano e escape de HTML no e-mail.
- Banco local isolado: 30 arquivos, 800 verificações aprovadas, incluindo 31 novas sobre criação, autorização, limites, preços contratados, desativação, troca de mesma base e conflito de preços.
- `scripts/configurable-plans-browser.cjs`: criação/edição/desativação/reativação nas duas bases, 390/1440 px, falha de salvamento preservando formulário, contratação anual por ID, plano indisponível, falha de catálogo, preço alterado e assinatura existente com preço anterior. Sem erros de página ou transbordamento. Incluído na CI.
- `scripts/split-offers-browser.mjs`: 16 cenários anteriores de ofertas, contratação, painel e catálogo público aprovados, sem chamadas externas nas fixtures.
- Cotação HTTP real de staging confirmou o valor anual canônico de um plano sintético, ignorando valor forjado pelo cliente.

## Recuperação

Verificado por consulta o [backup criptografado de 15/11](https://github.com/Edermax/Ogritech-site/actions/runs/43707786238). O [teste de restauração anterior](https://github.com/Edermax/Ogritech-site/actions/runs/43539743553) passou. Uma tentativa de disparar outro backup foi rejeitada pela revisão automática por envolver nova cópia de dados para artefatos do GitHub; não houve contorno nem nova cópia. A publicação utilizou o backup já existente.

Em uma reversão operacional, retirar primeiro a criação de novos planos e desativar somente variantes problemáticas para novas adesões. Manter a migration e o backend com suporte aos valores contratados: reverter a cobrança para o código anterior após contratar uma variante pode perder o reconhecimento do seu preço. O código anterior à mudança está no commit `a1a83c0ff2942a641de953328b4fe3c69617b440`. Qualquer reversão de dados deve ser revisada contra as assinaturas criadas após a publicação.
