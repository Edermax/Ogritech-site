# Evidência — Fase 1B: fundação multiproduto

Data: 08/09/2026  
Ambiente: exclusivamente local  
Repositório: `work/Ogritech-site`  
Migração: `20260908194456_multiproduct_foundation.sql`

## Resultado

A fundação multiproduto foi implementada preservando `public.barbershops` como tabela física do tenant e mantendo o campo legado `public.saas_clients.plan` somente para compatibilidade do Ogritech Agenda.

Foram adicionados:

- catálogo canônico com Ogritech Agenda, Ogritech Páginas, Ogritech Orçamentos e Ogritech Cardápio;
- vínculo obrigatório entre plano, assinatura e produto;
- uma assinatura não cancelada por cliente de cobrança e produto;
- módulos opcionais e módulos contratados com integridade entre produtos;
- direitos de plano avaliados no servidor, com ausência interpretada como acesso negado;
- RLS e grants explícitos nas novas tabelas;
- helper privado de acesso multiproduto, dependente de identidade e assinatura válida;
- sincronização legada limitada ao produto Agenda.

## Verificação

- replay integral de 50 migrações em banco Supabase local novo: aprovado;
- pgTAP: 8 arquivos e 245 asserções aprovados;
- `supabase db lint` nos schemas `public` e `private`: nenhum erro encontrado;
- suíte Node: 69 testes aprovados;
- política de migrações: 50 classificadas, com a nova migração retida para produção;
- `git diff --check`: sem erro de conteúdo.

## Limites preservados

Nenhum ambiente remoto foi consultado ou alterado. Não houve publicação, contratação externa, integração com WhatsApp, ativação de provedor de pagamento, envio de mensagens ou implementação de chatbot por IA.

O catálogo frontend já utiliza os quatro nomes oficiais. A ativação administrativa de cada produto e a aplicação dos direitos nas telas específicas pertencem às próximas fases e devem consumir a fundação criada aqui.
