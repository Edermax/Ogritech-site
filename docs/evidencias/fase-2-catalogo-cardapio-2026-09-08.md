# Evidência — Ogritech Cardápio: núcleo do catálogo

Data: 08/09/2026  
Ambiente: exclusivamente local  
Migração: `20260908202555_menu_catalog_core.sql`

## Entrega

- quatro templates versionados: pizzaria, lanchonete/hamburgueria, restaurante/marmitaria e confeitaria;
- aplicação transacional de template, restrita a gestor com assinatura ativa do Cardápio;
- categorias iniciais editáveis e tema com cores controladas;
- produtos simples, montáveis, fracionados, por peso, por quantidade, sob encomenda e combos;
- grupos de escolhas, opções, adicionais, remoções e limites de seleção;
- disponibilidade por menu, categoria ou item;
- progresso persistente do onboarding;
- RLS e grants explícitos em todas as tabelas novas;
- catálogo administrativo legado também protegido pela assinatura do Cardápio;
- interface para escolher template e tipo de produto.

O template nunca publica o cardápio e não pode sobrescrever categorias já criadas.

## Verificação

- replay limpo das 52 migrações: aprovado;
- suíte Node: 72 testes aprovados;
- teste transacional do catálogo: 23 asserções aprovadas;
- suíte completa pgTAP: 287 asserções aprovadas;
- lint dos schemas `public` e `private`: nenhum erro.

## Limites

Carrinho, cálculo de opções, entrega, pedido completo, publicação, importação, pagamento online, WhatsApp e IA não fazem parte desta fase. Nenhum ambiente remoto foi alterado.
