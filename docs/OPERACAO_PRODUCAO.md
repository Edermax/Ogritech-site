# Operação de produção

## Sequência de publicação

1. Criar um projeto Supabase de staging sem dados.
2. Executar `supabase db reset` e `supabase test db` localmente.
3. Vincular o CLI ao staging e aplicar migrations.
   Como `202608180001_create_core_schema.sql` foi adicionada para tornar instalações limpas reproduzíveis, um projeto que já possua migrations posteriores pode exigir `supabase db push --include-all`; use essa opção somente em staging primeiro.
4. Configurar `ALLOWED_ORIGINS` com os domínios exatos, separados por vírgula.
5. Publicar `platform-users` e validar convite, bloqueio, reativação e arquivamento.
   Convites de usuários da aplicação devem ser enviados exclusivamente pelo console Ogritech, que chama `platform-users`. O botão de convite do painel Supabase cria somente o usuário Auth e não conhece função nem empresa; seu uso pode deixar o usuário sem registro em `public.profiles`. O console bloqueia o carregamento quando detecta essa divergência.
6. Validar owner, admin, employee, client e platform admin em empresas distintas.
7. Fazer backup do banco de produção e registrar o ponto de restauração.
8. Aplicar migrations em produção e fazer smoke test sem dados reais.

## Segurança

- Nunca versionar `service_role`, senha do banco ou token pessoal.
- Promover masters apenas pelo script administrativo, depois de validar identidade e MFA.
- Configurar CSP, HSTS, `nosniff`, política de referência, permissões e bloqueio de frames no host/CDN.
- Revisar mensalmente `platform_admins` e `platform_admin_events`.
- Rotacionar chaves após suspeita de exposição e revogar sessões afetadas.

## Backup e restauração

- Backup diário com retenção compatível com o plano contratado.
- Teste trimestral de restauração em projeto isolado.
- Registrar RPO, RTO, responsável, início, fim e resultado de cada teste.
- Não considerar backup válido sem teste de restauração.

## Monitoramento

- Alertar para erros 5xx/429 da Edge Function, falhas de convite e conflitos anormais de agenda.
- Acompanhar latência p95 da API, erros de autenticação e volume de eventos administrativos.
- Manter logs sem conteúdo de observações, tokens, senhas ou dados pessoais desnecessários.
- O workflow `Monitor production` consulta a API unificada de logs a cada 15
  minutos usando um token restrito a `analytics_logs_read`. Limites iniciais:
  qualquer 5xx, cinco respostas 429, cinco falhas de Auth ou p95 acima de 1,5 s
  com pelo menos 20 amostras na janela de 20 minutos.
- Um único issue com a label `production-monitor` permanece aberto enquanto o
  incidente estiver ativo e é encerrado automaticamente após normalização.
- Secrets obrigatórios no ambiente `production`: `SUPABASE_ACCESS_TOKEN`;
  variável obrigatória: `SUPABASE_PROJECT_REF`.

## LGPD e retenção

- Arquivamento não equivale a eliminação imediata: respeitar retenção, obrigação legal e legal hold.
- Revisar solicitações abertas diariamente e seus prazos.
- Executar eliminação definitiva somente por procedimento aprovado, auditado e com alvo exato.
- Provisionar e testar `privacidade@ogritech.com.br` antes do lançamento.

## Rollback

- Preferir migrations aditivas e compatíveis com a versão anterior do frontend.
- Em falha, restaurar a versão anterior do frontend e pausar novas gravações se houver incompatibilidade.
- Não reverter migration destrutivamente; criar migration corretiva e restaurar backup quando necessário.
- Para o Cardápio, seguir `docs/CARDAPIO_ROLLBACK_PRODUCAO.md` e validar o contrato com `npm run rehearse:menu-production-rollback` antes da janela.
