# Evidência — Fase 1C: ativação multiproduto local

Data: 08/09/2026  
Ambiente: exclusivamente local  
Migração: `20260908200932_multiproduct_activation.sql`

## Entrega

- painel master com visão “Produtos por negócio”;
- ativação e cancelamento isolados por solução;
- validação de produto, plano, cliente, identidade e papel no servidor;
- auditoria de cada mudança de assinatura;
- catálogo autenticado de produtos do negócio;
- bloqueio no painel operacional para produtos não contratados;
- planos internos de configuração para Páginas, Orçamentos e Cardápio, com preço comercial ainda indefinido;
- Ogritech Agenda mantido no fluxo legado vigente.

## Verificação

- replay limpo de 51 migrações: aprovado;
- suíte completa pgTAP após o replay: 264 asserções aprovadas;
- cenário transacional adicional: Agenda, Páginas e Cardápio simultâneos; cancelamento do Cardápio preservou Páginas e Agenda; 19 asserções aprovadas;
- suíte Node: 71 testes aprovados;
- lint de `public` e `private`: nenhum erro.

## Limites

Não houve publicação, acesso ou alteração de staging/produção, cobrança real, comunicação externa, WhatsApp ou chatbot. Os planos de configuração com valor zero não constituem oferta comercial e devem receber preço e regras aprovados antes de qualquer homologação externa.
