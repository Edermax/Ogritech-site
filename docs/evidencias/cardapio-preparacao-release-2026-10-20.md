# Preparação da liberação do Cardápio — 20/10/2026

Etapa concluída: conciliar CI, replay limpo, fila de produção e assinaturas legadas. Nenhuma migration, função ou frontend foi publicada nesta etapa. Não houve reparo do histórico remoto.

## Evidências verificadas

- PRs 18, 19 e 20: verificações static/database aprovadas; continuam em rascunho e não foram mesclados.
- [CI da versão completa](https://github.com/Edermax/Ogritech-site/actions/runs/39490732314), commit `2bbf80d364fb88e20affb3c6e16d88297bb3a443`: `supabase start`, `db reset` e `test db` aprovados, 77 migrations, 19 arquivos de teste e 502 asserções. A suíte JavaScript aprovou 249 testes.
- API GitHub Pages: commit `1771d9c5d737682329e775b22d8e4ba171f7075e`, estado built, publicação de 19/10/2026.
- Ensaio local de rollback: PASS, seis arquivos obrigatórios presentes no commit de retorno; nenhuma ação remota.
- Produção: 55 migrations já registradas. Dry-run confirmou as 22 migrations pendentes da política, incluindo os seis requisitos diretos de Cardápio.

## Compatibilidade do dry-run

O primeiro comando, com o diretório original, foi recusado por `LegacyDbPushMissingLocalError`: produção registra `billing_rejected_email_event` como `20261003162614`, enquanto o arquivo local usa `20261003025228`.

Na cópia temporária `private/menu-release-dry-run`, somente o nome desse arquivo foi alinhado ao alias remoto já documentado. SHA-256 do arquivo original e da cópia conferidos como idênticos. Com `--dry-run --include-all --skip-vault`, a simulação passou e listou exatamente as 22 migrations retidas. O histórico e os arquivos originais não foram alterados. A execução futura deve usar a mesma compatibilidade explicitamente revisada; não executar `migration repair` para contornar o erro.

O dry-run verifica a fila, não executa nem prova a aplicação sobre os dados atuais de produção. O replay limpo do CI não substitui ensaio sobre uma restauração atual de produção.

## Encerramento das ofertas antigas

Consultas agregadas, sem dados pessoais: sete assinaturas internas de Agenda em estado active, zero referências de assinatura do provedor associadas a elas; nenhum registro de `private.billing_signups` para produtos diferentes de menu. Não apareceram assinaturas internas de Páginas ou Orçamentos nessa consulta.

Isso não prova ausência de compromissos comerciais, cobranças manuais ou assinaturas externas sem vínculo. Não foram canceladas assinaturas nem retiradas permissões. O SQL de encerramento continua preparado e deve ser coordenado com a publicação para preservar os dados históricos e o acesso do Cardápio.

## O que ainda impede a liberação completa

1. Completar os dados societários e registrar a revisão das minutas; então alinhar versão/hash dos termos no servidor.
2. Confirmar política fiscal e responsáveis de suporte/incidentes nos documentos operacionais existentes.
3. Fechar checkout hospedado, webhook espontâneo e Pix, ou decidir expressamente o escopo comercial disponível no lançamento. A autorização de testes financeiros anterior expirou; nenhum novo pagamento foi tentado nesta etapa.
4. Revisar a disposição de todas as 22 migrations, inclusive as intercaladas de Agenda, IA e Diniz; realizar ensaio sobre restauração atual antes da promoção.
5. Coordenar backup atualizado, migrations, funções, frontend, encerramento das rotas antigas e smoke/monitoramento. Só depois declarar publicação concluída.

Os gates permanecem bloqueados de forma intencional e os aceites anteriores das jornadas do lojista e de pedidos foram preservados.
