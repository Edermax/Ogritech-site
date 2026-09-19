# Fase 6E — otimização do assistente híbrido

Data: 10/09/2026  
Ambiente: local  
Resultado: critérios técnicos aprovados; staging e produção não autorizados

## Implementação

- roteamento local para saudações, busca explícita, horários, pagamentos, carrinho e prompt injection;
- uso da IA somente quando a preferência é ambígua;
- prompt reduzido, resposta limitada a 160 caracteres e 120 tokens;
- raciocínio do modelo desativado e verbosidade baixa;
- manutenção de `store: false`, schema estrito, zero repetição automática e confirmação humana;
- telemetria somente com hashes, rota, latência, tokens, intenção e resultado.

## Avaliação híbrida real

- 20 cenários sintéticos executados;
- 19 resolvidos localmente pela Fase 6A;
- 1 encaminhado ao OpenAI `gpt-5.6-luna`;
- 20 de 20 resultados corretos;
- erro: 0%;
- p95 agregado: 1 ms;
- latência da chamada ambígua após otimização: 2.668 ms;
- chamada ambígua antes da otimização: 11.876 ms;
- consumo da chamada final: 189 tokens de entrada e 44 de saída;
- custo arredondado do ensaio final: inferior a R$ 0,01;
- conteúdo bruto persistido: não.

## Decisão

O desenho híbrido cumpre os critérios técnicos medidos e reduz drasticamente custo e exposição de dados, pois 95% da amostra não sai do sistema local. Isso não autoriza staging nem produção. O campo técnico de aprovação do relatório significa apenas que a amostra cumpriu os limites previamente definidos; não substitui homologação operacional, revisão de LGPD ou autorização de ambiente.

O cardápio público continua executando somente a Fase 6A determinística. A chave permanece em `.env.local`, ignorada pelo Git, e a recarga automática da conta está desligada.

## Próxima recomendação

Fase 6F — preparar homologação de staging sem promovê-la: contrato de segredo do ambiente, feature flag separada, kill switch, aviso de transparência ao consumidor, amostra ampliada e roteiro de reversão. Qualquer configuração ou chamada em staging exigirá autorização específica posterior.
