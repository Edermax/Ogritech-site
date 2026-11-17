# Ogritech Catálogo — publicação autorizada em 17/11/2026

O responsável instruiu “publique”, após receber a prévia e o resumo da implementação. A autorização abrange a promoção coordenada do Catálogo, preservando contratos anteriores. As pendências históricas de organização fiscal, jurídico e suporte não foram registradas como aprovadas por testes técnicos. Esta atualização publica a evolução de um site já existente.

## Preparação e continuidade

- Candidato inicial: `4901c1009b6460052352809c0585f9ecc7995cfa`, baseado em `a9a667566e050bbd8474923838e534fc7808f839`.
- [PR de publicação #146](https://github.com/Edermax/Ogritech-site/pull/146).
- [CI inicial aprovado](https://github.com/Edermax/Ogritech-site/actions/runs/44119603632): código, banco e navegador.
- [Backup criptografado aprovado](https://github.com/Edermax/Ogritech-site/actions/runs/44119445456), artefato `ogritech-production-20261117T155555Z`, 155.178 bytes, retenção de sete dias. Sem dados gerenciados de Auth/Storage.
- [Restauração isolada aprovada](https://github.com/Edermax/Ogritech-site/actions/runs/44123342492). A primeira tentativa usou testes do candidato sobre o backup anterior e falhou por ausência esperada de `catalog_version`; a restauração foi repetida com os testes de `main`, compatíveis com o schema de origem.
- Produção e staging saudáveis, ambos com 107 migrations antes desta entrega. Inventário revisado: apenas as três migrations do Catálogo estão pendentes em produção, em ordem explícita, sem reparos do histórico antigo.

## Homologação remota

Staging recebeu as migrations do catálogo, de reautorização de ciclo e da correção do parâmetro qualificado da função renomeada. Foram aprovadas 48 asserções transacionais e confirmado zero estabelecimento de teste remanescente.

Na conta do vendedor de teste do Mercado Pago foram criadas e relidas quatro assinaturas **pending**, sem cartão, sem webhook de produção e sem pagamento:

| Cenário | Valor | Frequência | Cancelamento confirmado |
| --- | ---: | ---: | --- |
| Essencial mensal | R$ 9,90 | 1 mês | Sim |
| Essencial anual | R$ 99,00 | 12 meses | Sim |
| Completo mensal | R$ 29,90 | 1 mês | Sim |
| Completo anual | R$ 299,00 | 12 meses | Sim |

A API respondeu HTTP 200 ao pedido de transformar uma recorrência mensal em anual, alterou o valor para R$ 299 e manteve frequência de um mês. A tentativa foi revertida e a assinatura de teste foi cancelada. Essa prova exigiu corrigir o fluxo antes da produção: encerrar e confirmar a recorrência anterior, preservar o prazo comprado e pedir nova autorização para um checkout com a frequência correta. Operações ambíguas continuam reservadas e são recuperadas pelo lifecycle; eventos da recorrência encerrada não cancelam a substituta. Estornos seguem o identificador do pagamento efetivo.

A função temporária `catalog-release-qa` foi encerrada com HTTP 410 após o ensaio. Sua chave e seu endpoint foram removidos após o ensaio. Não houve captura de cartão, Pix real, e-mail/SMS ou alteração de assinatura de cliente para testar.

## Validação do candidato corrigido

Replay limpo das 110 migrations; 34 arquivos SQL e 947 asserções aprovados. As regressões cobrem idempotência após cancelamento, reautorização, prazo pago, notificação atrasada, permissões e confirmação de um novo checkout anual. O navegador aprovou 25 jornadas, incluindo a nova autorização de pagamento. Testes de runtime verificam que a alteração de ciclo nunca envia o valor anual à recorrência mensal existente.

Produção confirmou 110 migrations, com aliases `20261117185655`, `20261117185824` e `20261117185829` para esta entrega. As três funções foram relidas e seus fontes conferidos com o candidato. Versão `4.0-2026-11-17` e hash dos termos foram sincronizados. Preflight de produção passou as quatro cotações, as duas verificações de cadastro e a rejeição de webhook sem assinatura. Preços legados foram preservados; zero recorrências de clientes foram substituídas para testar. Advisors não apontaram novo risco crítico: a tabela privada nova mantém RLS sem acesso direto e o aviso anterior sobre proteção de senhas continua separado desta entrega. O frontend é publicado pelo merge do PR #146 e build do Pages. Os artefatos detalhados e os snapshots anteriores das três funções ficam em `outputs/catalog-review/`, sem credenciais no repositório. A reversão preserva dados e contratos novos; interrompe adesões e reconcilia reservas, sem apagar pedidos/pagamentos ou restaurar um dump antigo sobre a base ativa.
