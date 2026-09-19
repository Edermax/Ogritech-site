# Jornada da interface — 04/09/2026

Estado: ensaio sintético aprovado; fase 03 permanece em andamento.

## Ambiente e escopo

Frontend local em 127.0.0.1:8091, conectado explicitamente ao staging fuesdztsvrkkgnbqhcxi, empresa demonstrativa ogritech-agenda-bot. Cópia de trabalho não commitada sobre o baseline 1c55381357ff5133935c7363417377ea21d5aecf. Nenhuma publicação em produção.

## Correções

- A confirmação agora exibe referência e link privado para consultar/cancelar. A URL mantém os parâmetros de acesso no fragmento após concluir a reserva, permitindo recarregar a consulta. Tokens não são gravados nos storages pelo código da aplicação.
- Falhas de cancelamento na confirmação e na lista autenticada exibem mensagem de recuperação e reativam o botão.
- A consulta carrega o nome da empresa no cabeçalho, removendo o texto permanente de carregamento.
- O script da agenda usa versão na URL, após o ensaio detectar carregamento da versão antiga em cache.

## Verificação

1. Seleção de serviço/profissional/data/horário restaurada após recarga antes da reserva.
2. Reserva sintética criada pela interface: Barba Premium, Carlos, 08/09/2026 às 09:30; contato fictício com domínio example.invalid e consentimentos opcionais desmarcados.
3. Referência preenchida, link privado presente e fragmento preservado. Consulta aberta após recarga.
4. Cancelamento confirmado no diálogo real do navegador e persistido no banco. Nova recarga mostra Cancelado e não oferece novo cancelamento.
5. Viewport 390 × 844 sem overflow horizontal na confirmação; captura da consulta cancelada inspecionada visualmente.
6. npm run validate: 49 testes aprovados, zero falhas. Após o ajuste final do cabeçalho, os três testes da jornada foram repetidos e passaram.

O primeiro ensaio executou JavaScript antigo em cache e perdeu o acesso privado. Sua reserva foi cancelada administrativamente, usando contexto de operação e filtro exato do registro sintético. O segundo ensaio foi cancelado pela interface. Consulta final confirmou duas reservas canceladas e nenhuma ativa para o contato exclusivo do ensaio. Registros mantidos para auditoria.

## Artefatos e limites

- tests/booking-management-ui.test.mjs: regressão de URL privada/recarga e mensagens de falha nos dois cancelamentos.
- outputs/fase03-ui-success-mobile.png e outputs/fase03-ui-cancelled-mobile.png: capturas locais, sem token exposto.
- A auditoria de migrations valida a classificação local; seu texto staging=45 não comprova aplicação remota. Última contagem remota: 44 no staging e baseline 36 na produção.
- SMS e a jornada autenticada completa não foram homologados no navegador neste ensaio. Os testes de falha autenticada usam ambiente simulado.
- Ensaio automatizado não substitui beta com 3 pessoas nem 14 datas únicas aprovadas. Última consulta do diário nesta execução: 3/14, referentes a 01, 02 e 03/09. Sem empresa-piloto confirmada.

Próxima etapa: continuar a homologação técnica das jornadas pendentes e acompanhar o diário existente; realizar o beta humano quando os requisitos de entrada forem atendidos.
