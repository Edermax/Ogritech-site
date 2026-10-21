# Backup e restauração corrigidos — 19/10/2026

Atualização posterior de pagamento: token isolado e planos de teste configurados; homologação financeira ainda bloqueada por erros do provedor. Ver [evidência de homologação](cardapio-homologacao-mercadopago-2026-10-19.md).

## Resultado

**Backup criptografado e restauração isolada aprovados.** Esta evidência substitui o estado pendente do ensaio de continuidade, sem alterar o resultado histórico da falha anterior.

O usuário autorizou expressamente a exportação de `public`/`private` de produção, armazenamento criptografado como artefato autenticado no repositório GitHub `Edermax/Ogritech-site`, retenção de sete dias e ensaio de restauração isolado. Os dados gerenciados de Auth e Storage permanecem excluídos. Após o aceite, a execução foi permitida pela revisão automática.

## Backup

- [Execução 39288297613](https://github.com/Edermax/Ogritech-site/actions/runs/39288297613): success.
- Commit técnico: `b36141a9a500f045c3a03fb4953bb9740cdd405d`.
- Branch: `codex/backup-relations-acl-20261019`.
- Artefato: `ogritech-production-20261019T164846Z`, 73.258 bytes, não expirado na consulta.
- Conteúdo: roles, schema, dados de public/private, ACLs das funções e ACLs de schemas/tabelas/colunas/sequências.
- Criptografia e checksum preservados conforme o procedimento existente; nenhum dado descriptografado foi publicado.
- Sem mudança no banco de origem.

## Restauração

- [Execução 39288776485](https://github.com/Edermax/Ogritech-site/actions/runs/39288776485): success.
- Entrada: exatamente o artefato acima, com `expect_menu_schema=true`.
- Checksum, descriptografia e extração: aprovados.
- Restauração transacional de schema, dados e ACLs: aprovada.
- **252 asserções pgTAP, nove suítes, zero falhas.**
- Inclui fundação/ativação multiproduto, catálogo, pedidos, onboarding e ciclo comercial do Cardápio, além das suítes da Agenda.
- Arquivos descriptografados removidos e banco Supabase efêmero excluído ao final.
- Não houve restauração sobre produção nem alteração de seus dados.

## Correção operacional

A falha anterior ocorria porque o ambiente local aplicava grants padrão às relações restauradas. O novo `relation-acl.sql` remove esses padrões e reaplica as ACLs efetivas da origem, preservando inclusive privilégios por coluna. Sete verificações transacionais específicas desse ciclo também passaram com rollback.

A correção dos workflows e do exportador foi integrada pelo [PR #17](https://github.com/Edermax/Ogritech-site/pull/17), após aprovação dos checks de código e banco no [CI 39289143996](https://github.com/Edermax/Ogritech-site/actions/runs/39289143996). Commit de integração: `1771d9c5d737682329e775b22d8e4ba171f7075e`. Contém somente três arquivos operacionais; não inclui as correções de billing ainda locais. A rotina diária de backup passa a incluir as ACLs das relações.

GitHub Pages confirmou build concluído desse commit às 16:55:46 UTC. A referência de rollback foi atualizada e seus seis arquivos foram verificados no Git. O checkout local mantém a base anterior e as alterações não publicadas preservadas; foi feito fetch do commit, sem reset, descarte de arquivos ou promoção do candidato de billing.

## Pagamentos e limites restantes

A ativação das credenciais de teste do Mercado Pago foi autorizada e concluída pelo usuário, incluindo o formulário e a validação de identidade. A tela autenticada confirmou os dados das credenciais de teste; o token foi mantido oculto, sem cópia ou exportação. A aplicação de teste gerada pelo provedor é `2354123347267667`, com vendedor de teste `3778177682`. A configuração no staging e a homologação de pagamentos continuam pendentes e separadas da aprovação do backup. Nenhuma cobrança real foi criada.

Os itens 2 e 3 continuam concluídos por aceite do usuário. O lançamento do produto ainda depende dos demais gates; o sucesso desta restauração não autoriza promover as migrations ou funções de billing pendentes.
