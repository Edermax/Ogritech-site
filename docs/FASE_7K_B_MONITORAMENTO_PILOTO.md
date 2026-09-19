# Fase 7K-B — instrumentação e acompanhamento do piloto

Iniciada em 19/09/2026 após a consolidação da Fase 7K-A.

Instrumentação publicada no banco de staging em 19/09/2026. A interface do painel entra em vigor pelo deploy da branch `main`.

## Objetivo

Disponibilizar no painel do estabelecimento indicadores operacionais do piloto sem retornar nomes, telefones, e-mails, endereços ou itens individuais.

## Indicadores

- pedidos e consumidores distintos;
- uso dos limites de 100 pedidos e 25 consumidores;
- estados dos pedidos e modalidade de atendimento;
- possíveis duplicidades no mesmo minuto, consumidor e valor;
- divergência entre o subtotal gravado e a soma dos itens;
- pedidos recebidos há mais de 24 horas;
- pagamentos pendentes e ausência de consentimento.

## Segurança

A função usa `security invoker`, `search_path` vazio e consulta tabelas protegidas por RLS. A execução é revogada de `PUBLIC` e `anon` e concedida somente a usuários autenticados. Uma verificação adicional exige que o usuário pertença à equipe do estabelecimento consultado.

O relatório retorna apenas agregados. Produção, IA paga, mensagens automáticas e renovação automática continuam bloqueadas.
