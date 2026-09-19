# Beta controlado do Ogritech Cardápio

Estado: **PREPARADO LOCALMENTE; NÃO EXECUTADO**.

## Objetivo

Validar se pequenos negócios de alimentação conseguem configurar seu canal próprio e se consumidores conseguem encontrar, personalizar e pedir produtos sem ajuda. O beta cobre pizzaria, lanchonete/hamburgueria, restaurante/marmitaria e confeitaria/bolos/doces.

O pacote usa somente empresas, produtos, pedidos e contatos fictícios. Não é lançamento comercial, não requer empresa parceira e não autoriza produção, divulgação, mensagens, WhatsApp ou IA paga.

## Papéis reservados

- `OPERADOR-01`: executa contratação, configuração, publicação local, exportação e cancelamento;
- `CLIENTE-01`: realiza a compra fictícia pelo celular;
- `CLIENTE-02`: testa o assistente determinístico e a confirmação humana;
- `OBSERVADOR-01`: registra tempos, dúvidas, erros e notas sem orientar durante a tarefa.

Os nomes das pessoas e a janela de execução serão definidos somente antes do teste humano. Não são bloqueio para esta preparação.

## Cenários

As quatro massas estão descritas em `config/menu-beta-phase-7a.json`. Cada cenário deve exercitar as particularidades do segmento, além do núcleo comum de catálogo, personalização, entrega/retirada, carrinho, pedido, acompanhamento e autonomia comercial.

Executar um segmento por vez. Antes de começar, confirmar no navegador que o ambiente é local, o nome contém “demonstração” e o contato termina em `.invalid`.

## Roteiro humano

1. O operador contrata ficticiamente o Cardápio, escolhe o template e configura identidade, produtos, opções, horários, pagamentos e região de entrega.
2. O operador cria o pedido de teste, revisa pendências e publica somente no ambiente local.
3. O primeiro consumidor abre o link sem cadastro, encontra um produto, configura opções, confere o total, envia um pedido fictício e acompanha o estado.
4. O segundo consumidor usa o assistente determinístico para buscar um produto e revisar o carrinho; nenhuma ação pode ocorrer sem confirmação.
5. O operador exporta os dados, despublica o cardápio, cancela somente a solução Cardápio e confirma que as demais soluções não mudaram.
6. O observador registra conclusão por tarefa, nota de facilidade de 0 a 10, erros de JavaScript, incidentes e comentários anonimizados.

## Aceite e interrupção

O beta será aprovado somente com 4 de 4 segmentos concluídos, pelo menos 90% das tarefas concluídas, média de facilidade igual ou superior a 8, zero erro de JavaScript, zero incidente crítico, zero acesso entre empresas, zero pedido duplicado e zero divergência de preço.

Interromper imediatamente diante de acesso a outra empresa, preço controlável pelo navegador, pedido duplicado ou sem confirmação, chamada externa de IA, mensagem externa ou falha de cancelamento sem recuperação. Manter o ambiente fechado e registrar apenas a evidência mínima necessária.

## Limpeza obrigatória

Após cada cenário: despublicar o cardápio, cancelar pedidos fictícios, exportar somente a evidência anonimizada necessária, remover assinaturas e empresas fictícias e limpar o estado local do navegador. A conferência final deve encontrar zero slugs `beta-*` e zero pedidos ativos das massas.

Podem permanecer apenas notas agregadas, resultados das tarefas, capturas sem dados pessoais e identificadores de incidentes. Falha de limpeza reprova o beta.

## Condição para executar

A Fase 7A prepara o pacote, mas não convoca participantes nem executa o beta. A execução humana é uma fase separada e exige autorização, indicação privada dos participantes e janela. Publicação em staging ou produção também exige autorização própria.
