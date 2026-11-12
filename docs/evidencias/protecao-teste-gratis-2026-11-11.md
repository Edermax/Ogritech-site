# Proteção de repetição de teste gratuito — 11/11/2026

## Escopo e estado

Pedido: aplicar os reforços contra repetição dos 14 dias gratuitos. O responsável informou que não possui provedor de SMS/WhatsApp e pediu deixar a integração preparada.

Implementados: CPF responsável no CNPJ; limite persistente de tentativas; histórico de documentos utilizados; revisão de sinais repetidos; tela administrativa com decisão auditada; fluxo opcional de confirmação via Twilio Verify, desativado. Nenhuma mudança de prazo ou conteúdo dos clientes existentes.

Homologação (`fuesdztsvrkkgnbqhcxi`): migrations `menu_trial_abuse_protection` (versão remota `20261111225657`) e `menu_trial_review_api_hardening` (`20261111230807`) aplicadas. `ogritech-billing` v30 ativo, com o adaptador incluído. Configuração pública confirmou `phone_verification:false`, `available:true`, chave de CAPTCHA vazia. Nenhum SMS real enviado.

Produção (`mvzcoaiiwytycdqcvydf`): ambas as migrations aplicadas, versões remotas `20261112024937` e `20261112024955`, e `ogritech-billing` v19 ativo. Política atualizada para 93 migrations aplicadas, sem pendências. A interface faz parte do PR #104 e é publicada pelo merge em `main` via GitHub Pages.

## Verificação

- `npm run validate`: 386 testes passaram; contratos estáticos e classificação de 93 migrations passaram.
- Primeiro conjunto transacional em homologação: 26 verificações de proteção + seis verificações CPF/CNPJ passaram, sem persistência de fixtures. Cobriu documento repetido, revisão, negação de acesso de não administrador, decisão auditada, aprovação vinculada aos dados, uso único, cancelamento/exclusão, rollback de reserva, limites e prova de telefone.
- A segunda migration removeu a elevação de privilégios da API pública, seguindo o padrão de wrappers invoker para funções privadas. O teste de banco incluiu mais duas verificações dessa separação; a suíte completa passou no [CI do PR #104](https://github.com/Edermax/Ogritech-site/actions/runs/43118525087), incluindo replay limpo de todas as migrations e os testes transacionais.
- Navegador: formulário e administração reais, backend/provedor substituídos por fixtures; 390 e 1440 px. Revisão mantém o formulário, sucesso apresenta acesso, CPF responsável é obrigatório para CNPJ, prova de SMS invalida quando dados mudam, administrador salva decisão e conteúdo externo é escapado. Sem erro de JavaScript ou transbordamento horizontal.
- Smoke real da função em homologação: configuração 200, payload incompleto 422, cotação mensal 200 com R$ 49,90. Nenhum cadastro real, convite ou cobrança.
- Advisor após a segunda migration: as novas tabelas têm apenas INFO por RLS sem policies, intencional em tabelas privadas sem concessão direta aos usuários. Os dois avisos por SECURITY DEFINER exposto foram removidos ao mover a implementação para `private`; autorização administrativa permanece obrigatória em ambos os caminhos.

## Backup e restauração isolada

Backup diário já existente, concluído com sucesso em [43009849096](https://github.com/Edermax/Ogritech-site/actions/runs/43009849096), artefato privado criptografado `ogritech-production-20261111T111433Z`, não expirado. Apenas metadados foram consultados; o agente não baixou o backup.

A revisão automática recusou executar um novo backup por exportar dados de produção a um artefato externo sem autorização específica. Também recusou iniciar `restore-drill.yml` sobre o backup existente por baixar/processar esses dados em infraestrutura temporária do GitHub. Após a autorização explícita do responsável para o teste isolado, o workflow de restauração foi disparado sobre o backup existente. Um novo backup não foi gerado.

O [teste isolado 43138593427](https://github.com/Edermax/Ogritech-site/actions/runs/43138593427) passou. As etapas de verificação de schema/RLS/testes, remoção dos arquivos descriptografados e remoção do banco temporário concluíram com sucesso. Nada foi restaurado no banco de produção.

As primeiras tentativas de promoção por `apply_migration` retornaram confirmação expirada, sem alteração em produção. Após a confirmação explícita do responsável para publicar banco, função e interface, as duas migrations e a função foram publicadas com sucesso.

## Conferência de produção

- Digest dos registros anteriores de `billing_signups`, excluída a coluna nova, idêntico antes/depois: `9ee3fc3b7de783a49d915f2f388f44bb`. Um registro anterior preservado e um histórico de teste utilizado criado.
- Quatro novas tabelas privadas com RLS; anônimo sem acesso à criação/revisão e usuário comum sem acesso ao backend de elegibilidade. Wrappers públicos da revisão sem elevação de privilégios.
- API real: configuração 200 (`phone_verification:false`, `available:true`), cotação mensal 200 (R$ 49,90), payload incompleto 422, limite de corpo 413, SMS desativado 503, revisão/elegibilidade anônimas 401 e método inválido 405. Sem cadastro real, convite, cobrança ou SMS em produção.
- Advisor de segurança: somente INFO de RLS sem policies para as quatro tabelas privadas, intencional por não concederem acesso direto aos usuários. Sem novo aviso sobre elevação de privilégios na API pública.
- Restauração isolada autorizada: 274 verificações aprovadas; arquivos descriptografados e banco temporário removidos.
- Após a publicação do frontend: conferir respostas HTTP dos novos assets, campos de CPF responsável, área de revisão administrativa e layout em celular/desktop. Os fluxos já foram exercitados no navegador com fixtures, sem efeitos reais nos clientes.

Operação e ativação futura: [TESTE-GRATIS-PROTECAO.md](../TESTE-GRATIS-PROTECAO.md).
