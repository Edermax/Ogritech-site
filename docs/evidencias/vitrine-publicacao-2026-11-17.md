# Publicação da vitrine — 17/11/2026

Estado inicial deste registro: publicação técnica autorizada pelo usuário com a instrução “publique”, após revisão da prévia local. A autorização anterior de implementação local foi ampliada para publicar esta versão. Não há mudança de preços, contratos, integração com pagamentos ou documentos legais.

## Candidato e reversão

Branch `feat/vitrine-segmentos-local-20261117`. Escopo e validação local: [relatório da implementação](vitrine-segmentos-local-2026-11-17.md). Origem da versão pública anterior: `9b2cb1eed2cf1c5ff733e3265b2e10b1fce3f240`, GitHub Pages `built`, domínio `ogritech.com.br`. O alvo de rollback foi atualizado para esse commit imutável, mantendo banco aditivo e sem executar down migrations.

O registro `technicalPublicationAuthorization` descreve a autorização desta manutenção. Os gates históricos de revisão jurídica, operação e suporte não foram falsamente marcados como concluídos por testes de código.

## Homologação

Os projetos de staging e produção foram conferidos como `ACTIVE_HEALTHY`, com 110 migrações antes desta versão. A estrutura das quatro tabelas envolvidas e a âncora da função pública foram verificadas antes da aplicação.

A migração local `20261117201510_catalog_business_segments.sql` foi aplicada somente no staging nesta etapa, com nome `catalog_business_segments` e versão remota `20261117210050`. As 53 verificações de segmentos passaram com identidades sintéticas exclusivas e rollback. O ensaio confirma as 19 classificações, autorização, isolamento por empresa, preservação do catálogo/assinatura/teste e sincronização administrativa. A conferência pós-teste encontrou zero empresas e usuários de QA remanescentes.

O teste de assinatura foi ajustado para selecionar apenas o contrato da empresa sintética, permitindo executá-lo em ambientes que já contêm outros negócios. A instrumentação remota acumula as respostas pgTAP em tabela temporária, exige exatamente 53 resultados sem falha e termina com rollback. Nenhuma proteção de teste gratuito foi desativada.

O teste de navegador das ofertas passou em 22 cenários sem erro JavaScript ou chamada externa. Seu carregador passou a incluir o runtime compartilhado de perfis e a usar o identificador estável `pizzeria`.

## Backup e aplicação

Backup criptografado iniciado no workflow existente: [44175189412](https://github.com/Edermax/Ogritech-site/actions/runs/44175189412), baseado no commit público anterior. A restauração [44176339040](https://github.com/Edermax/Ogritech-site/actions/runs/44176339040) concluiu com sucesso em banco efêmero, baseada no mesmo commit público. A aplicação de banco foi liberada após o CI [44176576298](https://github.com/Edermax/Ogritech-site/actions/runs/44176576298), com static, database e panel-theme aprovados para o candidato `c436c0491c449ec05c747dafc885b96219ce1375`.

A migração adiciona funções/trigger e estende os metadados públicos. Não percorre nem reclassifica os negócios existentes. A nova função pública não permite acesso anônimo; a implementação verifica gestão e acesso ao produto antes de alterar a atividade.

## Conferência após publicação

Conferir a versão do Pages, a home e seus recursos, cadastro/preseleção dos segmentos, conteúdo público existente, shell/cache e integridade dos documentos legais. Não criar cadastros, pedidos ou cobranças reais durante a verificação pública.

## Banco de produção concluído

Migração `catalog_business_segments` aplicada em produção na versão remota `20261117211344`; inventário total de 111 migrações. As classificações de alimentação, personalizados e colecionáveis foram verificadas, assim como o bloqueio de execução anônima e a rota autenticada. O rótulo com acentuação de colecionáveis foi conferido no servidor.

Hashes de negócios/segmentos, produtos, catálogos/links/modelos e assinaturas foram comparados imediatamente antes/depois da aplicação: todos permaneceram idênticos. Os quatro preços comerciais continuam corretos e o catálogo público existente mantém o perfil de alimentação.

Os advisors de segurança permaneceram com os mesmos avisos anteriores (tabela com RLS sem política e proteção de senha vazada), sem novo aviso decorrente desta migração. A verificação de performance anterior não tinha erros. Não foram implantadas funções Edge nem alteradas credenciais, cobranças ou configurações do provedor.

Frontend: aguardando conclusão dos checks do registro final e integração do [PR #148](https://github.com/Edermax/Ogritech-site/pull/148). Os commits de implementação e de registro diferem apenas em evidências e inventário da migração já aplicada.
