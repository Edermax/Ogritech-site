# Proteção de repetição de teste gratuito — 11/11/2026

## Escopo e estado

Pedido: aplicar os reforços contra repetição dos 14 dias gratuitos. O responsável informou que não possui provedor de SMS/WhatsApp e pediu deixar a integração preparada.

Implementados: CPF responsável no CNPJ; limite persistente de tentativas; histórico de documentos utilizados; revisão de sinais repetidos; tela administrativa com decisão auditada; fluxo opcional de confirmação via Twilio Verify, desativado. Nenhuma mudança de prazo ou conteúdo dos clientes existentes.

Homologação (`fuesdztsvrkkgnbqhcxi`): migrations `menu_trial_abuse_protection` (versão remota `20261111225657`) e `menu_trial_review_api_hardening` (`20261111230807`) aplicadas. `ogritech-billing` v30 ativo, com o adaptador incluído. Configuração pública confirmou `phone_verification:false`, `available:true`, chave de CAPTCHA vazia. Nenhum SMS real enviado.

Produção: migrations e função **ainda não promovidas**; frontend ainda não publicado. A política registra as duas migrations retidas, sem alterar o baseline de produção.

## Verificação

- `npm run validate`: 386 testes passaram; contratos estáticos e classificação de 93 migrations passaram.
- Primeiro conjunto transacional em homologação: 26 verificações de proteção + seis verificações CPF/CNPJ passaram, sem persistência de fixtures. Cobriu documento repetido, revisão, negação de acesso de não administrador, decisão auditada, aprovação vinculada aos dados, uso único, cancelamento/exclusão, rollback de reserva, limites e prova de telefone.
- A segunda migration removeu a elevação de privilégios da API pública, seguindo o padrão de wrappers invoker para funções privadas. O teste de banco incluiu mais duas verificações dessa separação; a suíte completa será confirmada no CI do PR antes da promoção.
- Navegador: formulário e administração reais, backend/provedor substituídos por fixtures; 390 e 1440 px. Revisão mantém o formulário, sucesso apresenta acesso, CPF responsável é obrigatório para CNPJ, prova de SMS invalida quando dados mudam, administrador salva decisão e conteúdo externo é escapado. Sem erro de JavaScript ou transbordamento horizontal.
- Smoke real da função em homologação: configuração 200, payload incompleto 422, cotação mensal 200 com R$ 49,90. Nenhum cadastro real, convite ou cobrança.
- Advisor após a segunda migration: as novas tabelas têm apenas INFO por RLS sem policies, intencional em tabelas privadas sem concessão direta aos usuários. Os dois avisos por SECURITY DEFINER exposto foram removidos ao mover a implementação para `private`; autorização administrativa permanece obrigatória em ambos os caminhos.

## Backup e autorização pendente

Backup diário já existente, concluído com sucesso em [43009849096](https://github.com/Edermax/Ogritech-site/actions/runs/43009849096), artefato privado criptografado `ogritech-production-20261111T111433Z`, não expirado. Apenas metadados foram consultados; o agente não baixou o backup.

A revisão automática recusou executar um novo backup por exportar dados de produção a um artefato externo sem autorização específica. Também recusou iniciar `restore-drill.yml` sobre o backup existente por baixar/processar esses dados em infraestrutura temporária do GitHub. Nenhum desses dois workflows foi disparado pelo agente. Não houve tentativa de contornar as recusas.

Para concluir a publicação, obter autorização específica para o teste de restauração do **backup existente** em GitHub Actions. Um novo backup não é necessário neste momento. Esse teste usa máquina efêmera e limpa os arquivos ao final, conforme workflow existente; não restaura nada no banco de produção.

Operação e ativação futura: [TESTE-GRATIS-PROTECAO.md](../TESTE-GRATIS-PROTECAO.md).
