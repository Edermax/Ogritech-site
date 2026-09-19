# Evidência — Fase 6G

Data: 10/09/2026. Ambiente: staging `fuesdztsvrkkgnbqhcxi`.

## Publicação autorizada

- oito migrations dependentes aplicadas como lote, levando o staging a 57 migrations sincronizadas;
- `OPENAI_API_KEY`, `OGRITECH_MENU_AI_ENV` e `ALLOWED_ORIGINS` cadastrados no cofre remoto; valores não foram expostos;
- Edge Function `menu-ai-assistant` publicada na versão 1 com `verify_jwt=false`, para acesso de visitantes mediante chave publicável;
- IA global permaneceu desativada, kill switch ativo, limites globais zerados e nenhuma empresa aderiu.

## Verificações

- pgTAP remoto da Fase 6F: 16 de 16 asserções aprovadas com rollback;
- lint remoto dos schemas `public` e `private`: sem erros;
- origem não autorizada: HTTP 403 `forbidden_origin`;
- método não autorizado: HTTP 405 `method_not_allowed`;
- requisição sintética válida: HTTP 503 `hybrid_disabled`, fallback `deterministic_phase_6a`;
- função e três nomes de segredo confirmados por metadados remotos.

## Limites preservados

Nenhuma chamada alcançou a OpenAI e não houve consumo pago. Produção, frontend público híbrido, WhatsApp, empresa real e retirada do kill switch permanecem fora do escopo.

## Reversão

Em incidente, manter ou religar o kill switch, desativar a função e remover adesões. Os segredos podem ser revogados separadamente sem alterar a operação determinística.
