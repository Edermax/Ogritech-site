# Monitoramento funcional do Cardápio

O workflow `Monitor production` consulta a cada 15 minutos quatro sinais independentes: telemetria do Supabase, página pública do Cardápio, catálogo pela RPC anônima `public_menu` e disponibilidade de contratação por `trial_readiness`. Nenhuma sonda cria pedidos, assinaturas ou pagamentos.

## Configuração do ambiente production no GitHub

- Secret `SUPABASE_ACCESS_TOKEN`: exclusivamente para a API de logs do Supabase.
- Variable `SUPABASE_PROJECT_REF`: projeto de produção.
- Variable `MENU_HEALTH_URL`: URL HTTPS do cardápio publicado, com `?empresa=slug`.
- Variable `MENU_HEALTH_PUBLISHABLE_KEY`: chave **pública** `sb_publishable_...` do mesmo projeto. Chaves administrativas e legadas são recusadas pela sonda do catálogo.

O HTML precisa conter o catálogo e carregar `cardapio.js`. A RPC precisa devolver o mesmo slug, título e categorias. Um HTTP 200 isolado não comprova disponibilidade. Falha de rede, contrato incompleto, catálogo indisponível ou ausência de métricas impedem recuperação automática. Os relatórios contêm apenas indicadores e códigos controlados; respostas completas, dados de clientes e credenciais não são publicados.

## Alertas e recuperação

O incidente real usa título `[Monitor] Alerta operacional de produção` e label `production-monitor`. A primeira falha abre o incidente; mudança de condição atualiza o relato; repetições idênticas não criam comentários. Uma execução saudável de todas as sondas fecha os incidentes correspondentes. Permanece necessário investigar a causa e acompanhar a correção: fechar manualmente o alerta não corrige o serviço.

## Ensaio isolado

Execute manualmente `Monitor production`, escolhendo o branch candidato e `mode=drill`. O job de ensaio não acessa o environment de produção nem os secrets do Supabase. Respostas HTTP injetadas representam página saudável, backend indisponível, falha repetida e recuperação. A integração real com GitHub abre e fecha apenas a issue `[Monitor drill] Ensaio isolado do Cardápio`, label `monitor-drill`. Incidentes reais permanecem intactos. Não escolha `mode=production` para simular falhas.

## Antes de ativar a versão candidata

Promova o código do monitor, configure a chave pública e aponte a URL para um cardápio efetivamente publicado. Confirme uma execução real saudável e a recuperação do incidente real, se houver. O ensaio isolado comprova o mecanismo de alertas; não substitui essa validação de produção. Não publique um cardápio de cliente apenas para tornar o indicador verde.
