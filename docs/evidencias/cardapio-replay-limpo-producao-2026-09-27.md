# Evidência — replay limpo do lote do Ogritech Cardápio

Data: 27/09/2026  
Ambiente: Supabase local efêmero e isolado  
Produção e staging: não acessados nem alterados

## Resultado

- Supabase CLI: `2.116.0`, igual à versão fixada no CI.
- PostgreSQL local: `17.6`.
- Migrations aplicadas do zero: 65 de 65, na ordem versionada.
- Seed aplicado após o schema.
- Suítes pgTAP: 16 de 16 aprovadas.
- Asserções pgTAP: 451 aprovadas, zero falha.
- A cauda local pós-baseline de 29 migrations foi reproduzida integralmente; o inventário remoto posterior confirmou duas já aplicadas fora de ordem e 27 efetivamente pendentes.
- As migrations específicas da Diniz encerraram sem erro quando a empresa privada não existia.
- O Supabase local já existente permaneceu ativo nas portas originais; o ensaio utilizou portas e identificador próprios.

## Verificação da atualização PostgreSQL 15.19/17.11

A checagem preventiva motivada pelo changelog de 25/09/2026 encontrou:

- extensão `ltree`: ausente;
- extensão `btree_gist`: presente na versão `1.7`;
- índices GiST envolvendo `real`, `double precision` ou `float`: zero;
- extensão `pgcrypto`: presente na versão `1.3`;
- uso de `pgp_sym_encrypt`, `pgp_pub_encrypt`, `cipher-algo`, Blowfish ou CAST5 nas migrations: zero;
- operadores personalizados com estimador de seletividade fora de `pg_catalog`: zero.

Portanto, o repositório não apresenta os quatro padrões que exigem ação descritos no aviso atual. Como o banco local ainda executa PostgreSQL 17.6, a versão e os objetos devem ser reconfirmados diretamente em produção antes da janela; esta evidência não substitui essa verificação remota.

## Limites

Este ensaio valida reprodutibilidade, dependências, RLS e contratos funcionais do banco. Ele não autoriza `db push`, não comprova o estado remoto, não substitui backup fresco, Advisors, dry-run remoto ou aprovação técnica e comercial.

## Próxima ação

Executar `db push --dry-run` autenticado contra produção após backup válido, registrando a lista exata das 27 migrations pendentes sem aplicá-las.
