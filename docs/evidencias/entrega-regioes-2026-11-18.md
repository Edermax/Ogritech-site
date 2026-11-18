# Preço de entrega por região — revisão do painel

Solicitação: tornar a configuração de cobrança por região mais intuitiva, atendendo os estabelecimentos existentes e os próximos cadastros.

## Comportamento

- Lista de regiões com busca por nome, bairro ou cidade, resumo de taxas e edição recolhível.
- Escolha explícita entre cobrar uma taxa e oferecer entrega grátis. Novas regiões exigem definir a taxa, sem assumir gratuidade.
- Pedido mínimo em produtos separado da taxa, com indicação do mínimo efetivo entre a configuração geral e a regional.
- Simulação do total por região, sem criar pedido. Buscar ou simular não marca a configuração como alterada.
- Preservação dos códigos, nomes, taxas e mínimos existentes. O limite de 50 regiões acompanha o contrato atual do banco.
- Configurações publicadas usam a RPC atômica existente e permanecem na tela de configuração após salvar. Cadastros em preparação continuam pelo fluxo atual.
- As permissões de gestor e os recursos de cada oferta permanecem aplicados.

## Compatibilidade e distribuição

A mudança usa o painel compartilhado e os campos existentes de `menu_delivery_zones`. Nenhuma migration ou ajuste em lote de preços é necessário. A publicação da interface atende os negócios existentes e futuros, preservando valores e histórico. Scripts e CSS recebem versões novas e o shell passa a v49.

Consulta agregada de produção, somente de leitura: quatro catálogos, dois com entrega e 53 regiões ativas. Não foram coletados dados pessoais ou alteradas configurações. O registro local guarda hashes das configurações para conferência após a publicação.

## Validação local

- `npm run validate`: checagem estática, classificação das 112 migrations e 490 testes Node aprovados.
- `node scripts/menu-delivery-regions-browser.mjs`: 14 jornadas aprovadas, incluindo oito combinações de largura (320, 390, 768 e 1440 px) e tema (claro e escuro).
- Conferidos: persistência de taxas decimais e códigos existentes, busca sem efeito de gravação, mínimo geral/regional, cálculo do total, entrega grátis, novo cadastro, nomes duplicados, valores negativos, falha ao salvar, cinquenta regiões, remoção, retirada, Essencial, teste no Completo e funcionário sem edição.
- Zero erros JavaScript, zero requisições externas nos testes locais e zero gravações de produção.

Os testes usam respostas sintéticas e verificam as chamadas às RPCs já existentes. As regras de autorização e cobrança do servidor não foram alteradas. A conferência pública e o CI devem ser registrados na publicação.
