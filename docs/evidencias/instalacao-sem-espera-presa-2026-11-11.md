# Correção do estado de instalação preso — 11/11/2026

O relato foi reproduzido em três testes de regressão no controlador anterior: o texto externo Preparando a instalação do app permanecia após o timeout de oito segundos, depois de fechar o diálogo e até quando o instalador ficava disponível. O timer alterava o botão, mas não atualizava a mensagem exibida. Além disso, a mera existência de onbeforeinstallprompt era interpretada como se um instalador fosse necessariamente chegar.

A preparação artificial foi removida. A instalação direta depende de um evento nativo real ou de uma API de instalação disponível. Sem eles, o botão permanece utilizável e o diálogo informa a indisponibilidade naquela janela, com as alternativas expandidas. Se um evento real chegar após o clique, a confirmação fica disponível e é encaminhada automaticamente somente enquanto a ativação do usuário continuar válida.

Todas as transições atualizam o estado visível. A confirmação nativa também tem um limite de trinta segundos: um método que não responde não mantém o botão bloqueado. Respostas tardias de tentativas expiradas são ignoradas; o evento real appinstalled continua sendo a confirmação autoritativa. Nenhum timeout é apresentado como instalação concluída.

Verificação: os três testes novos falharam no controlador anterior e passaram após a correção. A suíte completa passou com 367 testes. No Edge em contexto privado, onde não houve oferta nativa, o estado foi observado por mais de nove segundos: não ficou em Preparando, manteve os controles ativos, mostrou as alternativas e permitiu nova tentativa. Em um perfil normal do Edge 157, o evento e o método nativos reais foram acionados com ativação de usuário preservada e sem erro de instalabilidade. A confirmação final do sistema não foi aceita: nenhum app foi instalado no computador durante os testes.

Sem alterações de banco, permissões, dados ou cadastro dos estabelecimentos.
