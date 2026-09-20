# Ogritech

Plataforma de gestão para negócios de atendimento.

## Estrutura de marca

- **Ogritech** é a plataforma.
- **Ogritech Agenda**, **Ogritech Páginas**, **Ogritech Orçamentos** e **Ogritech Cardápio** são as quatro soluções oficiais da plataforma.
- **Japa na Barba** é uma empresa fictícia usada na demonstração inicial.
- A plataforma está em pré-operação; todos os negócios atualmente cadastrados são demonstrativos.
- Cada barbearia é isolada por `barbershop_id` e pelas políticas RLS do Supabase.

## Estado atual

- autenticação real com Supabase Auth;
- perfis `owner`, `admin`, `employee` e `client`;
- recuperação de senha;
- banco PostgreSQL com RLS;
- painel administrativo e área do cliente;
- clientes e agenda persistidos no Supabase, com isolamento por empresa via RLS;
- `localStorage` reservado aos ambientes demonstrativos e à importação única de dados antigos.

## Segurança

O frontend contém somente a chave pública do Supabase. Nunca inclua no repositório:

- secret key;
- `service_role`;
- senha do banco;
- credenciais pessoais.

## Privacidade e LGPD

- política de privacidade e termos versionados;
- canal autenticado para solicitações dos titulares;
- registro de ciência do aviso de privacidade;
- trilha de auditoria para alterações em clientes e agendamentos;
- parâmetros de retenção por empresa;
- acesso mínimo por função, aplicado por RLS;
- canal público: `privacidade@ogritech.com.br` (o endereço deve estar provisionado antes da publicação).

Esses controles apoiam a adequação, mas não substituem revisão jurídica, contratos com controladores e operadores, inventário de tratamentos e processos internos de resposta a incidentes.

## Próximas etapas

1. Aplicar e validar as migrations primeiro em staging.
2. Publicar a Edge Function com `ALLOWED_ORIGINS=https://ogritech.com.br`.
3. Executar o checklist de produção em `docs/OPERACAO_PRODUCAO.md`.

O acompanhamento de evidências e a aprovação final ficam em
`docs/CHECKLIST_LANCAMENTO.md`.

O estado consolidado da entrada em operação, incluindo itens concluídos,
acompanhamento automático e dependências humanas, fica em
`docs/PLANO_ENTRADA_OPERACAO_STATUS.md`.

## Central master

O usuário registrado em `platform_admins` possui uma central exclusiva em `admin.html`. Nela é possível:

- criar, editar, suspender e excluir negócios;
- convidar proprietários, gestores, funcionários e clientes finais;
- ativar, desativar e remover acessos;
- entrar no contexto de qualquer negócio pelo botão **Operar**;
- administrar clientes, agenda, serviços, equipe, financeiro e configurações usando o painel operacional existente.
- controlar cobranças próprias da Ogritech, incluindo implantação, mensalidades, serviços adicionais, descontos, créditos, pagamentos e devoluções;

O módulo de cobranças é exclusivo para a relação comercial **Ogritech → empresa contratante**. Ele não participa dos pagamentos realizados pelos consumidores das empresas clientes. A operação inicial é manual e auditável; os campos de provedor e identificadores externos preparam uma integração futura sem armazenar dados de cartão no projeto.

Para ativar a central em um projeto Supabase, aplique as migrations e publique a Edge Function `platform-users`. A função usa `SUPABASE_SERVICE_ROLE_KEY` somente no ambiente seguro do Supabase; essa chave nunca deve ser colocada no frontend.

## Desenvolvimento e validação

Requisitos: Node.js 22+ e Supabase CLI 2.116.0 com Docker (mesma versão usada no CI).

```sh
npm run validate
supabase start
supabase db reset
supabase test db
```

### Seleção do ambiente Supabase

- `http://localhost:8080/` usa o Supabase local por padrão.
- `http://localhost:8080/?env=staging` usa explicitamente o projeto staging **Edermax's Project**.
- `?env=production` seleciona produção de forma explícita.
- A seleção permanece somente na aba atual (`sessionStorage`). Fechar a aba remove a seleção.
- O staging exibe o selo fixo **STAGING — DADOS DE TESTE** para evitar operações no ambiente errado.

Somente chaves publicáveis (`sb_publishable_...`) ficam no navegador. O projeto staging deve manter as URLs de redirecionamento do Auth compatíveis com o endereço usado nos testes.

Para promover o primeiro administrador, crie o usuário no Auth e execute uma cópia local, não versionada, de `scripts/bootstrap-platform-admin.sql` com o e-mail correto.

O arquivo `_headers` configura CSP, HSTS e outros cabeçalhos em hosts compatíveis. GitHub Pages não processa esse arquivo; para produção, configure os mesmos cabeçalhos no CDN/proxy ou migre a entrega para um host compatível.
