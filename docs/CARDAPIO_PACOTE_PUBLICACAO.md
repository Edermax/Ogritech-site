# Pacote verificável de publicação do Cardápio

O comando `npm run prepare:menu-release --silent` produz JSON com o plano de publicação, sem executar deploy, acessar serviços remotos ou ler secrets. O CI do PR gera o mesmo pacote como artefato `menu-release-package-<commit>`, disponível por sete dias.

O pacote lê objetos **já commitados** no Git. Alterações locais ainda não commitadas não entram. Para revisar uma versão específica, execute `node scripts/menu-release-package.mjs --ref <hash completo de 40 caracteres>`. Não existe opção `--apply`.

## Conteúdo

- Commit imutável do candidato, projeto de produção e pendências reais dos gates.
- Fila completa das migrations retidas, em ordem, com SHA-256 de cada arquivo.
- Alias remoto conhecido de `billing_rejected_email_event`; nenhum reparo automático de histórico.
- Lista explícita de sete funções de produção, arquivos de cada função, dependências compartilhadas e hashes.
- Arquivos essenciais do frontend e commit que fixa os demais assets.
- Commit anterior de rollback e sequência das fases de publicação.

As funções `menu-sandbox-qa`, `menu-sandbox-webhook` e `menu-ai-assistant` são recusadas na lista de produção. A última depende explicitamente de configuração `staging`; o assistente determinístico do Cardápio continua no produto. Nunca publicar todas as funções com um comando genérico.

A configuração de autenticação de cada função deve estar explícita no `supabase/config.toml`. A consulta ao staging confirmou `cep-lookup` com `verify_jwt=false` e import map ativo; o candidato agora registra esse comportamento, mantendo a validação da chave pública pelo próprio handler (`withSupabase({ auth: "publishable" })`). A mudança evita que uma publicação nova aplique por omissão uma exigência de JWT incompatível com a chave pública. Nenhuma função remota foi modificada nesta etapa.

## Sequência operacional

1. Resolver as decisões cadastrais, jurídicas, fiscais, de implantação e de suporte.
2. Confirmar o commit candidato e os checks do PR. Conferir que os hashes do pacote são os mesmos da revisão.
3. Confirmar backup fresco, restauração isolada e fechamento de novas entradas com acompanhamento preservado. O runbook de rollback ainda exige ensaio remoto; o pacote não o substitui.
4. Revisar a fila exata de migrations e a compatibilidade dos aliases. Aplicar somente na janela autorizada, sem `migration repair` para contornar divergências.
5. Publicar as funções explicitamente revisadas e validar a configuração de cobrança em produção. Os sucessos de sandbox não substituem credenciais e planos reais; não copiar tokens de teste para produção.
6. Publicar o frontend do mesmo candidato e coordenar o encerramento das ofertas e acessos legados já aprovado pelo responsável. A revisão de compromissos externos legados permanece pendente.
7. Apontar `MENU_HEALTH_URL` para um cardápio efetivamente publicado, validar catálogo, contratação e telemetria e observar uma janela completa do monitor.

O pacote pode ser gerado com lançamento bloqueado: nesse caso `releaseAuthorized` permanece falso e `pendingDecisions` explica o que falta. A geração do artefato ou um CI verde não autoriza publicação.

## Configuração do monitor preparada em 20/10/2026

A variável `MENU_HEALTH_PUBLISHABLE_KEY` foi gravada no environment `production` do GitHub com a mesma chave pública já utilizada pelo site. Não foi alterado qualquer token administrativo, secret de pagamento, banco, função ou frontend. A URL atual ainda aponta para um slug indisponível; sua substituição depende do primeiro cardápio publicado. O candidato do monitor permanece no PR #24.
