# Rollback de produção — Ogritech Cardápio

Este runbook prepara a reversão do Cardápio sem autorizar publicação ou alteração remota. A fonte executável é `config/menu-production-rollback.json`; o ensaio local somente lê o histórico Git.

## Antes da janela

1. Confirmar qual commit está efetivamente publicado e registrar seu hash de 40 caracteres como alvo de rollback.
2. Comprovar que o alvo contém o site, Cardápio, acompanhamento do pedido e painel.
3. Registrar o identificador do backup fresco e da restauração isolada aprovada.
4. Confirmar quem pode declarar `NO-GO`, fechar entradas, republicar e autorizar restauração.
5. Executar `npm run rehearse:menu-production-rollback` no commit da janela.

O hash atualmente preparado é uma referência recuperável do repositório, mas ainda não está confirmado como a versão efetivamente servida em produção. Essa confirmação é um gate, não uma suposição.

## Sequência do rollback

1. Declarar `NO-GO`, abrir ou atualizar o incidente e registrar horário, versão e motivo.
2. Fechar imediatamente novas criações de pedidos do Cardápio sem retirar o acompanhamento de pedidos existentes.
3. Republicar o hash anterior imutável pelo mecanismo oficial da hospedagem.
4. Validar HTTPS, cabeçalhos, página pública e acompanhamento de um pedido sintético existente.
5. Se o problema for de schema, aplicar somente correção aditiva compatível com as duas versões do frontend.
6. Restaurar backup apenas diante de perda ou corrupção confirmada, com escopo conhecido e restauração isolada já validada.
7. Observar pelo menos uma janela completa do monitor e registrar a decisão antes de reabrir pedidos.

## Proibições

- Não executar migration `down`, apagar coluna ou marcar migration como aplicada sem executar o SQL.
- Não usar `git reset`, sobrescrever o diretório de trabalho ou implantar referência móvel como `main`.
- Não remover o acompanhamento dos pedidos já aceitos.
- Não restaurar backup para corrigir apenas erro de frontend ou configuração.
- Não reabrir entradas com alerta ativo, isolamento incerto ou divergência de preços.

## Aceite do ensaio em produção

O gate pode ser aprovado somente quando o hash anterior for confirmado como a versão publicada antes da janela, a entrada puder ser fechada independentemente do frontend, a republicação tiver sido exercitada, o acompanhamento existente continuar funcional e o monitor abrir e resolver um incidente controlado. O ensaio deve registrar tempos de detecção, decisão, fechamento, recuperação e estabilização.
