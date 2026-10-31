# Entrada em operação do Cardápio — 23/10/2026

## Situação confirmada em produção

- Página inicial, criação do cardápio, login, painel, contato, termos e privacidade: HTTP 200.
- API de disponibilidade do teste gratuito: HTTP 200, ready=true para menu.
- Banco: 79 migrations registradas.
- Cardápios publicados em produção: zero. Existe um cardápio não publicado.
- A simulação fictícia foi concluída em homologação. Ela não representa cliente, receita ou pagamento real.
- As verificações acima são de leitura. Não comprovam uma nova contratação completa em produção nem aprovam automaticamente o lançamento comercial.

## Próxima entrega que gera resultado

Colocar um estabelecimento real em operação. A meta inicial é um cardápio publicado e um primeiro pedido atendido, seguido do retorno do proprietário sobre dificuldades. Não iniciar novos módulos, IA, integrações ou reformulação visual antes desse uso.

1. Identificar um estabelecimento participante e obter sua concordância. Não enviar mensagens ou cadastrar terceiros sem autorização.
2. O próprio responsável inicia em https://ogritech.com.br/criar-cardapio/, informa seus dados e define sua senha.
3. Cadastra os produtos que deseja oferecer, preços, imagens próprias, formas de atendimento e pagamento.
4. Revisa o cardápio e publica pelo painel. Qualquer auxílio da Ogritech deve respeitar a política comercial já aprovada.
5. Confere o link no celular e recebe o primeiro pedido. Nenhum pedido fictício deve ser encaminhado para produção ou confundido com venda.
6. Confirma e conclui o atendimento no painel, registrando dificuldades reais de uso.
7. Apontar o monitor existente para esse cardápio somente após sua publicação autorizada; confirmar execução saudável. Não publicar exemplo apenas para tornar o monitor verde.

## Pendências que não devem ser marcadas como concluídas por inferência

- Revisão fiscal/jurídica e operação dos canais de suporte, conforme registros existentes.
- Validação de uma contratação real e cobrança recorrente em produção; testes fictícios não substituem essa evidência.
- Monitoramento de um cardápio real publicado.

## Regra de prioridade

Corrigir primeiro falhas que impeçam entrar, configurar, publicar, receber ou acompanhar pedidos. Melhorias cosméticas e funcionalidades adicionais ficam depois do primeiro uso real.

## Evidência atual

Verificação remota de 23/10/2026, 21:04 UTC, registrada localmente em outputs/launch-production-current.json. O contrato config/menu-production-launch.json contém descrições históricas de 21/10; não usar esses números antigos como inventário atual nem apagar seus aceites e pendências sem evidência correspondente.
