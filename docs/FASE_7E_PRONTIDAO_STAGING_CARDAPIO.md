# Fase 7E — prontidão do Cardápio para staging

Data: 16/09/2026  
Estado: pronta para autorização explícita da homologação sintética; nenhuma execução remota autorizada.

## Resultado

A fundação técnica foi consolidada sem aplicar migrations, publicar frontend, criar empresa demonstrativa ou chamar IA. O inventário registra 60 migrations locais e 60 esperadas no staging; as oito migrations do Cardápio já constam nessa fotografia. Por isso, a futura janela começa por comparação de drift e não por reaplicação automática.

O beta humano local anterior permanece como pré-condição satisfeita: quatro segmentos, três participantes, quatro jornadas, média 10/10 e nenhum incidente crítico.

## Gates obrigatórios da futura Fase 7F

1. Obter autorização específica para uma janela de staging.
2. Fotografar o estado remoto e comparar migrations, funções, grants, políticas e schema antes de alterar qualquer coisa.
3. Confirmar grants explícitos da Data API e testar RLS em operações permitidas e negadas para `anon`, `authenticated` e contexto de serviço.
4. Criar somente uma empresa e identidades sintéticas com domínio `.invalid`, sem contato externo.
5. Manter o assistente determinístico; kill switch da IA ligado, limites de chamadas e custo em zero.
6. Executar os quatro segmentos em desktop e celular, comprovando preço, idempotência, acompanhamento e isolamento.
7. Fechar a entrada pública de teste e limpar sessões, pedidos, catálogo e empresa sintética.
8. Confirmar zero resíduo e preservar apenas evidência técnica sem dados pessoais.

## Critérios de interrupção

A janela deve ser interrompida antes de prosseguir se houver drift não explicado, acesso entre empresas, divergência de preço, duplicidade, falha de RLS/grant, chamada externa, dado real, erro crítico ou impossibilidade de garantir a limpeza.

## Limites permanentes

Produção, negócio ou consumidor real, WhatsApp, SMS, e-mail, IA paga e permanência de demonstração não fazem parte desta autorização. A Fase 7E é apenas documentação, contrato e verificação local.

## Rollback preparado

A ordem é: fechar entrada pública, desativar a empresa demonstrativa, revogar sessões, remover pedidos e catálogo sintéticos, remover a empresa, verificar zero resíduo e guardar apenas a evidência anônima. Migration destrutiva não integra o rollback; qualquer correção de schema exigirá plano aditivo e autorização própria.
