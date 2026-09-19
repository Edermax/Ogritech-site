# Fase 7H — regras operacionais recebidas da confeitaria

Estado histórico da coleta: regras recebidas e posteriormente revisadas para o piloto privado iniciado na Fase 7J. Este documento não representa sozinho o estado atual da publicação.

## Entrega

A taxa informada considera ida e volta, consumo conservador de 8 km por litro e fator de R$ 5,00 para combustível e desgaste. A fórmula recebida equivale a:

`taxa = distância de ida × 2 ÷ 8 × 5`

Assim, um endereço a 16 km resulta em 32 km de percurso e taxa de R$ 20,00. Antes de implementar, ainda precisam ser definidos o endereço de origem usado na rota, o raio máximo atendido e a regra de arredondamento.

## Cartão

Os preços de tabela valem para dinheiro e Pix. Foram informadas taxas de 1,37% no débito, 4,20% no crédito à vista, 6,09% em duas parcelas e 7,01% em três parcelas.

Ainda é necessário confirmar se o estabelecimento simplesmente soma a porcentagem ao preço ou calcula o valor bruto necessário para receber exatamente o preço de tabela líquido. O sistema não deve inferir essa diferença.

## Sinal da encomenda

A encomenda exige pagamento antecipado de 30%, por Pix ou link de cartão. O agendamento só é confirmado depois da verificação do sinal. Para o piloto, a verificação deve permanecer manual pelos operadores autorizados; nenhuma integração de pagamento foi autorizada.

## Implicação técnica

O modelo atual oferece taxas fixas por região. Uma taxa dinâmica por distância precisa de uma etapa própria de cálculo e confirmação; não deve ser simulada como taxa fixa sem revisão. O pedido também precisará distinguir `aguardando sinal` de `confirmado`, preservando confirmação humana e idempotência.
