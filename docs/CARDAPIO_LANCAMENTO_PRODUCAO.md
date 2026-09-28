# Lançamento controlado do Ogritech Cardápio

Estado em 27/09/2026: **BLOQUEADO**. Este documento organiza a preparação; não autoriza alterações em produção.

A fonte executável é `config/menu-production-launch.json`. O comando `npm run gate:menu-production` mostra o estado atual sem falhar o desenvolvimento. No momento da liberação, `REQUIRE_MENU_PRODUCTION_APPROVAL=true npm run gate:menu-production` deve ser obrigatório e somente poderá passar com os dez gates aprovados e autorização explícita.

## Ordem obrigatória

1. **Decisões humanas:** revisão jurídica, dados societários, preço, implantação, teste, cobrança, emissão fiscal, responsáveis e canais.
2. **Pré-flight técnico:** validação completa, inventário do lote de migrations, funções, segredos, origens, commit e versão anterior recuperável.
3. **Continuidade:** backup novo, checksum, restauração isolada e testes específicos do Cardápio.
4. **Promoção de banco:** aplicar somente a cauda contígua integralmente revisada. Migrations específicas da Diniz ou de experimentos precisam ser comprovadamente inertes em produção ou exigir uma estratégia formal diferente; não entram por associação silenciosa.
5. **Aplicação:** publicar funções e frontend compatíveis com o banco já promovido; manter IA paga, mensagens automáticas e renovação desligadas.
6. **Smoke sintético:** criar uma única empresa fictícia, publicar catálogo, criar e acompanhar pedidos em desktop e celular, exportar, despublicar e cancelar.
7. **Limpeza:** comprovar zero empresa, assinatura, catálogo, pedido, evento ou sessão sintética residual.
8. **Observação:** validar disponibilidade, erros, latência e falha de criação de pedidos; testar abertura e resolução do alerta.
9. **Rollback:** ensaiar retorno do frontend, fechamento de novas entradas e correção aditiva. Restauração de backup é reservada a perda ou corrupção confirmada.
10. **Go/no-go:** registrar commit, migrations, funções, responsáveis, evidências e decisão conjunta técnica e de negócio.

### Restrição do histórico de migrations

O CLI não oferece seleção de arquivos individuais no `db push`: ele promove o histórico pendente em ordem. O inventário remoto de 27/09/2026 encontrou 36 migrations contíguas e duas migrations de callbacks registradas fora de ordem. Restam 27 migrations pendentes; o núcleo do Cardápio começa depois de 11 migrations pendentes de outros domínios. Há ainda migrations de IA desligada e ajustes específicos da Diniz após o núcleo.

Por isso, não se deve marcar migrations como aplicadas sem executar seu SQL nem copiar arquivos isolados manualmente. O contrato `config/menu-production-migration-batch.json` classifica todas as migrations ainda pendentes e o comando `npm run check:menu-production-migrations` impede arquivo sem classificação, duplicidade, quebra de ordem ou autorização implícita. As duas aplicações fora de ordem ficam registradas separadamente na política e não voltam ao lote. Em 27/09/2026, o `db push --dry-run --include-all` autenticado listou exatamente as 27 migrations aceitas e não alterou o banco. A promoção real permanece bloqueada pelos demais gates.

## Regras de interrupção

Interromper a janela diante de drift não explicado, backup inválido, alerta crítico, acesso entre empresas, divergência de preço, duplicidade, pedido sem confirmação, falha de limpeza, segredo ausente, função incompatível ou necessidade de migration destrutiva.

## Nota sobre o Supabase

Antes da janela, revisar os Advisors e a versão do Postgres. O changelog de 25/09/2026 informa uma atualização menor que pode exigir ação para índices `ltree`/`btree_gist`, dados legados de `pgcrypto` e operadores personalizados. A promoção deve confirmar se o projeto utiliza esses recursos. Também não se deve depender de exposição automática no Data API: grants e RLS permanecem explícitos.

## Evidência final mínima

- hash do commit e versão anterior;
- lista exata das migrations e funções promovidas;
- execução aprovada de validação, backup, restauração, smoke e rollback;
- relatório de Advisors sem achado crítico não aceito;
- empresa sintética e identificadores usados na limpeza;
- confirmação de zero resíduo;
- responsáveis técnico e de negócio, data e decisão `GO` ou `NO-GO`.
