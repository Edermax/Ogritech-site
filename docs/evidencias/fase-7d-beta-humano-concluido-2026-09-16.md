# Evidência — Fase 7D

Data: 16/09/2026.

## Resultado

O beta humano local do Ogritech Cardápio foi concluído com três participantes voluntários identificados somente pelos códigos `OPERADOR-01`, `CLIENTE-01` e `CLIENTE-02`. Os quatro segmentos exigidos foram percorridos: pizzaria, lanchonete/hamburgueria, restaurante/marmitaria e confeitaria/bolos e doces.

Foram concluídas 4 de 4 jornadas. Todas exibiram pedido com status final `Recebido`. As quatro avaliações de facilidade foram 10, resultando em média 10/10, sem dúvidas relatadas ao fim das jornadas.

## Achados corrigidos

O primeiro percurso revelou três problemas do ambiente local que foram corrigidos e retestados durante a sessão:

1. campos obrigatórios bloqueavam o envio sem feedback visual suficiente;
2. `crypto.randomUUID` não estava disponível no contexto HTTP acessado pelo IP da rede local;
3. o acompanhamento ainda não possuía fixture local para recuperar o pedido fictício.

Após as correções, criação e acompanhamento passaram de ponta a ponta pelo mesmo endereço usado nos celulares.

## Segurança e privacidade

- nenhum nome ou número real foi registrado nos artefatos;
- nenhuma mensagem, ligação, SMS ou WhatsApp foi enviado;
- nenhum banco remoto ou IA paga foi chamado;
- zero acesso entre empresas, pedido duplicado ou divergência de preço;
- zero incidente crítico;
- os pedidos existiram somente na sessão de cada navegador.

## Decisão

A Fase 7D recebe aceite para o beta humano **local**. Isso não autoriza produção, publicação pública ou empresa real. Dados estruturados: `outputs/menu-beta-human-2026-09-16.json` e `config/menu-beta-phase-7d-result.json`.

Validação final: 18 scripts, 10 páginas, 60 migrations classificadas e 123 testes Node aprovados. Os servidores temporários das portas 8097, 8098 e 8099 foram encerrados após a consolidação.
