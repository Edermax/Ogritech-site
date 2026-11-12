# Proteção do teste gratuito do Cardápio

O teste pertence ao responsável e ao estabelecimento. Alterar e-mail, login, navegador ou dispositivo não reinicia o histórico registrado no servidor.

## Regras

- O mesmo CPF/CNPJ não recebe outro teste. O histórico permanece quando um teste utilizado é cancelado ou seu cadastro é removido.
- Cadastro com CNPJ informa também o CPF do responsável. CPF usado anteriormente, inclusive em outro CNPJ, gera revisão.
- Telefone, e-mail ou nome normalizado de estabelecimento repetidos geram uma solicitação de revisão. A igualdade de nome é um sinal, não uma prova de fraude.
- Antes da aprovação não se criam negócio, convite, assinatura ou cobrança. A resposta HTTP 202 mantém o formulário e mostra o protocolo.
- O administrador abre **Revisão de testes**, confere o caso e registra aprovação ou recusa com motivo. A aprovação autoriza uma única conclusão com exatamente os mesmos dados por 48 horas. O prazo de 14 dias começa na conclusão do cadastro.
- Reservas que falham antes da concessão do teste são liberadas quando o cadastro é efetivamente revertido. Uma concessão já utilizada nunca é liberada por cancelamento.
- O servidor limita cadastros por documento, e-mail e telefone a cinco tentativas/hora; por endereço de rede, a 30/hora; teto global de 300/hora. A negativa retorna 429 e `Retry-After`. Falhas no controle impedem a criação, com 503.
- Locks transacionais e a chave única do histórico impedem duas criações concorrentes com os mesmos sinais sem aprovação. As tabelas privadas não concedem acesso a `anon` ou `authenticated`. Só administradores da plataforma consultam/decidem revisões; a decisão é auditada.

Os documentos são validados pelos dígitos verificadores. Isso **não comprova titularidade**. Os sinais não asseguram detecção de alguém que apresente todas as identidades diferentes. A confirmação de telefone é uma camada adicional, preparada abaixo, inicialmente desativada.

## Integração opcional por SMS — preparada, desativada

Adaptador implementado para [Twilio Verify](https://www.twilio.com/docs/verify/api/verification). É preciso contratar/configurar o provedor e conferir seus custos e a disponibilidade de SMS no Brasil. Nenhuma conta foi contratada, credencial criada ou mensagem real enviada nesta implementação.

Configure primeiro em homologação, nos **Edge Function Secrets**, nunca no navegador ou no repositório:

| Secret | Uso |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | Conta do provedor (`AC…`) |
| `TWILIO_AUTH_TOKEN` | Credencial privada da conta |
| `TWILIO_VERIFY_SERVICE_SID` | Serviço Verify (`VA…`), códigos de seis dígitos |
| `TURNSTILE_SECRET_KEY` | Validação privada do CAPTCHA |
| `TURNSTILE_SITE_KEY` | Chave pública do widget, autorizada para o domínio |
| `TRIAL_PHONE_VERIFICATION_ENABLED` | Definir `true` **por último**, após conferir todo o fluxo |

Sem ativação explícita, o cadastro mantém as regras de documento, sinais e limites; os controles de SMS ficam ocultos. Se a opção for ativada com configuração incompleta, a criação falha de modo seguro. Para desativar a camada de telefone, remova a opção ou use `false`; os demais bloqueios continuam.

O CAPTCHA pode ser ativado independentemente do SMS com suas duas chaves. O frontend busca a configuração pública no servidor, carrega o widget e envia o token; o servidor valida ação `menu_trial` e hostname. A CSP permite apenas o domínio oficial do widget para seus scripts e frames.

Fluxo preparado:

1. `trial_configuration` informa disponibilidade e chave pública do CAPTCHA, sem credenciais.
2. `request_phone_code` exige consentimento explícito para SMS, dados válidos, CAPTCHA e limites persistentes. São no máximo três envios por telefone/hora e 60 globais/hora.
3. O servidor registra somente o identificador privado do provedor, a identidade resumida e uma validade de dez minutos. Não armazena o código.
4. `verify_phone_code` valida a mesma identidade e permite até cinco tentativas por desafio. O [Verification Check](https://www.twilio.com/docs/verify/api/verification-check) do provedor precisa retornar `approved`.
5. O cliente recebe uma prova aleatória. Só o hash é persistido; o cadastro consome a prova uma única vez na mesma transação da criação. Trocar os dados, expirar o desafio ou repetir a prova impede o uso. O frontend também invalida sua cópia quando os dados mudam.

O adaptador envia somente por SMS para celular brasileiro informado pelo usuário. Ele não cria usuários de Auth nem envia mensagens de marketing. Requisições ao provedor têm timeout de oito segundos e não seguem redirecionamentos. Códigos, provas e credenciais não entram nos logs.

## Verificação e publicação

- `npm run validate`: contratos estáticos e testes de aplicação.
- `supabase test db`: testes transacionais, incluindo `menu-trial-abuse.test.sql` e `billing-cpf-signup.test.sql`.
- `npm run test:trial-protection-browser`: formulário e administrador reais em 390 e 1440 px, com backend/provedor simulados; nenhum convite ou SMS real. Requer Playwright com Chromium instalado, ou `PLAYWRIGHT_EXECUTABLE_PATH`.
- Aplicar as duas migrations (`menu_trial_abuse_protection` e `menu_trial_review_api_hardening`) antes de publicar `ogritech-billing` com **ambos** os arquivos TypeScript. Depois publicar o frontend.
- Fazer smoke tests sem dados de cliente: configuração pública, cotação e rejeição de payload incompleto; conferir RLS/ACLs. Não realizar cadastros reais como teste automático em produção.
- Rollback da aplicação: manter histórico e tabelas de proteção. Não apagar claims utilizados nem reabrir testes antigos; se houver falha, suspender novos cadastros enquanto corrige. A função anterior não envia o CPF responsável de CNPJ, portanto não é um rollback funcional completo desta regra.
