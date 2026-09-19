# Evidência — Fase 7F

Data: 16/09/2026  
Ambiente: staging `fuesdztsvrkkgnbqhcxi`  
Resultado: aprovado e limpo.

## Preflight

- staging saudável e corretamente vinculado;
- 60 migrations locais e 60 remotas, sem drift;
- nenhuma migration aplicada;
- tabelas do Cardápio com RLS ativo;
- `anon` sem leitura direta de `menu_orders`;
- IA externa fechada: híbrido desligado, kill switch ligado e limites de chamadas e custo em zero.

## Execução

Foi criada temporariamente uma empresa inteiramente sintética, com contatos no domínio reservado `.invalid`, quatro categorias e quatro produtos representando pizzaria, lanchonete, restaurante e confeitaria.

O frontend local foi conectado explicitamente ao staging e executado no Edge em desktop e celular. As oito jornadas passaram, incluindo cardápio, assistente determinístico, carrinho, aceite de privacidade, pedido e acompanhamento. O banco confirmou:

- 8 pedidos e 8 chaves de requisição únicas;
- 8 estados `received`, exibidos como `Recebido`;
- 8 e-mails sintéticos `.invalid`;
- zero divergência entre preço cadastrado e preço gravado;
- zero erro JavaScript na rodada aprovada;
- nenhuma chamada de IA paga, mensagem externa ou acesso à produção.

## Correções encontradas

1. O selo visual de staging interceptava o botão flutuante do assistente; recebeu `pointer-events:none`.
2. A página de acompanhamento mostrava o código bruto `received`; os estados e modalidades passaram a ser traduzidos para português.
3. A página de acompanhamento não declarava favicon, gerando 404 no console; a referência foi adicionada.

As três correções foram retestadas nas oito jornadas.

## Limpeza e estado final

A entrada foi despublicada e foram removidos pedidos, idempotência, eventos, configurações do assistente, preços, itens, categorias, cardápio, assinaturas, cliente e empresa sintética. A consulta final confirmou zero resíduo em todas as entidades marcadas.

O staging terminou novamente com 60 migrations, IA híbrida desligada, kill switch ligado e limites zerados. Produção não foi consultada pela aplicação nem alterada. Este resultado não autoriza publicação pública.
