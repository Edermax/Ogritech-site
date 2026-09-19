# Evidência — Fase 6F

Data: 10/09/2026. Escopo: preparação local do contrato de staging.

## Resultado

- controles globais privados com desativação, kill switch e orçamento zerado por padrão;
- adesão separada por estabelecimento e aceite versionado do aviso;
- Edge Function preparada, mas explicitamente desativada e sem chamada ao provedor;
- validação estrita, CORS limitado, limite de payload e recusa preventiva de dados pessoais;
- telemetria desenhada sem mensagens ou identificadores de sessão em claro;
- fallback determinístico preservado;
- estado da preparação explicado no painel.

## Limites mantidos

Nenhuma migration remota foi aplicada, nenhum segredo foi enviado ao staging, nenhuma função foi publicada e nenhuma chamada paga foi realizada. A chave local existente não foi exibida nem copiada para código público.

## Validação

- `npm run validate`: 109 de 109 testes Node aprovados; 57 migrations classificadas, sendo 36 aplicadas e 21 retidas para produção.
- `git diff --check`: aprovado; somente avisos já existentes de normalização LF/CRLF.
- replay limpo: 57 migrations e seed aplicados com sucesso em banco local recriado;
- pgTAP: 442 asserções em 15 arquivos aprovadas, incluindo as 16 da Fase 6F;
- lint: schemas `public` e `private` sem erros.

A implementação e a validação técnica local estão concluídas.

## Incidente local resolvido

O Docker não iniciava porque `C:\Users\User\AppData\Local\Docker\wsl` era um ponto de montagem quebrado para `D:\DockerData\wsl`, em uma unidade ausente. O link foi preservado como `wsl.broken-d-drive-20260910`; o Docker recriou sua distribuição em `C:` e iniciou na versão 29.7.2. Nenhum volume foi apagado.
