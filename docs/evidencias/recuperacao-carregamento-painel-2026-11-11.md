# Recuperação do carregamento do painel — 11/11/2026

O painel aberto apresentou a identificação genérica e o aviso de falha de carregamento. Nos logs de produção, a consulta business_product_catalog retornou HTTP 401 com PGRST303, enquanto as consultas de identificação e perfil retornaram 200. O token registrado ainda estava dentro de sua validade. Não há evidência de falha do cadastro ou perda de dados. Recarregar a página recuperou o painel e os pedidos reais.

O código encerrava a abertura na primeira rejeição da consulta de acesso. Agora somente as duas leituras iniciais de acesso e identificação repetem PGRST303, com até três tentativas e intervalos de 600 e 1400 ms. Se a mensagem indicar token expirado, a sessão é renovada uma vez antes de repetir a leitura. Falhas de autorização não recebem novas tentativas automáticas; pedidos, pagamentos e outras gravações não são repetidos.

O conteúdo fica oculto durante a abertura. Se ela falhar, um aviso na própria página oferece Tentar novamente. Tentativas simultâneas são bloqueadas e uma recuperação bem-sucedida retira o aviso. Os controles antigos de agenda começam ocultos, inclusive quando o carregamento falha.

Verificação: 373 testes passaram, incluindo seis novos casos de recuperação, limite de tentativas, renovação de sessão, erro de permissão, nova tentativa manual e concorrência. As verificações estáticas e de política de migrations passaram. No Edge, com respostas simuladas na página real, os cenários de uma rejeição temporária e três rejeições seguidas recuperaram o painel automaticamente e pelo botão, respectivamente, tanto em 390 como em 1365 px, sem erros JavaScript. Esses testes não criaram pedidos nem modificaram dados de estabelecimentos.

Referência de diagnóstico: [códigos de erro do PostgREST](https://supabase.com/docs/guides/api/rest/postgrest-error-codes). PGRST303 indica rejeição na validação ou leitura das claims JWT; o código do erro, isoladamente, não determina qual claim foi rejeitada.
