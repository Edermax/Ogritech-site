# Ogritech Billing — ativação

## Oferta implementada

- plano único `Agenda`, mensalidade-base de R$ 97,00;
- um teste de 14 dias por CNPJ;
- mensal R$ 97,00; trimestral R$ 282,27; semestral R$ 552,90; anual R$ 1.047,60;
- cartão recorrente ou Pix; boleto, Pix Automático e Point não são aceitos;
- termos padronizados, aceite auditável e cancelamento self-service.

## Sequência operacional implementada

1. O checkout valida CNPJ, telefone, periodicidade e os aceites.
2. O backend confirma que Mercado Pago e a versão dos termos estão configurados antes de aceitar o cadastro.
3. O ambiente e o usuário proprietário são criados e o teste de 14 dias é liberado.
4. No cartão, o cliente conclui a autorização recorrente no Mercado Pago; o plano do provedor aplica o trial.
5. No Pix, nenhuma cobrança é antecipada: `billing-lifecycle` gera o Pix 48 horas antes do fim do acesso e o envia por e-mail.
6. O webhook aprovado estende o acesso pelo período comprado e reativa automaticamente uma conta suspensa.
7. Sem pagamento, `billing-lifecycle` suspende o estabelecimento quando o período termina.
8. O cancelamento interrompe novas cobranças e preserva o acesso até `access_until`; ao final, a rotina conclui o cancelamento.
9. `billing-email-dispatch` envia início do teste, Pix, comprovante, cancelamento e suspensão, com retentativa e idempotência.

## Dependências de produção

1. Criar quatro planos no Mercado Pago, todos com 14 dias grátis e frequências mensal, trimestral, semestral e anual.
2. Cadastrar os IDs como `MP_PLAN_*_ID` e as demais variáveis do `.env.example` nos Secrets do Supabase. Nunca versionar valores reais.
3. Configurar o webhook do Mercado Pago em `https://<project-ref>.supabase.co/functions/v1/mercado-pago-webhook` para pagamentos, assinaturas e pagamentos autorizados.
4. Execute primeiro o preflight, sem publicar: `npm run billing:preflight -- -ProjectRef <ref-staging> -SecretsFile <arquivo-local.env>`.
5. O staging atual possui aliases históricos de oito migrations. Na primeira execução, publique com `-Apply -RepairMigrationHistory`; o reparo altera somente o registro de versões, usando o mapeamento auditado em `config/migration-release-policy.json`. Nas execuções seguintes, use apenas `-Apply`.
6. O publicador recusa o `ProjectRef` de produção e qualquer projeto que não seja o staging autorizado. Ele configura secrets, aplica migrations e publica `ogritech-billing`, `mercado-pago-webhook`, `billing-lifecycle` e `billing-email-dispatch`.
7. Configure no Mercado Pago o webhook `https://<project-ref>.supabase.co/functions/v1/mercado-pago-webhook` para pagamentos, assinaturas e pagamentos autorizados.
8. Agende `billing-lifecycle` a cada 30 minutos e `billing-email-dispatch` a cada 5 minutos, ambos por POST e com o header `x-cron-secret`. Guarde o segredo no Vault; não o grave na migration.
9. Valide no sandbox, nesta ordem: preflight; teste novo; CNPJ duplicado; cartão aprovado; cartão recusado; Pix emitido perto do vencimento; Pix aprovado/expirado; webhook repetido; cancelamento; acesso até o fim; suspensão e reativação.
10. Somente depois da evidência no staging, retire as duas migrations de billing da lista de retenção e promova para produção.

O script exige um arquivo de secrets fora do repositório e recusa placeholders. Sem `-Apply`, ele é somente leitura, exceto pelos arquivos temporários normais dos testes.

O hash em `BILLING_TERMS_SHA256` deve ser recalculado sempre que `termos.html` mudar. Uma mudança nos termos exige nova versão; nunca sobrescrever a evidência aceita anteriormente.
