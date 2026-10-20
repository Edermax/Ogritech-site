# Personalização do Cardápio — entrega e evidências

Escopo: cumprir as promessas de personalização da página inicial. Esta entrega complementa a redução para Cardápio do PR 19; não publica em produção.

| Promessa | Implementação e verificação |
| --- | --- |
| Logo e capa próprios | Editor no painel, prévia local, JPEG/PNG/WebP até 5 MB, validação de assinatura e dimensões, upload direto por usuário autenticado em `menu-images`, chave por estabelecimento e UUID. Upload real e leitura pública aprovados no staging. |
| Cores da marca | Principal no cabeçalho e destaque nas ações. Texto preto/branco escolhido por luminância. Corrigida a dependência do marcador `customized`, que impedia aplicar cores salvas. |
| Alterar e remover a identidade | Salvamento, rascunho para cardápio publicado, publicação explícita e descarte. As imagens referenciadas na versão pública ou em rascunho não podem ser sobrescritas/excluídas pelo cliente. |
| Prévia fiel à publicação | Alterações locais não publicam automaticamente; publicar exige salvar a prévia antes. Confirmação dentro do editor, sem diálogo nativo do navegador. |
| Produtos, categorias, fotos, descrições e preços | Editor de catálogo existente e publicação de rascunho mantidos. Salvar configurações gerais preserva os novos caminhos de logo/capa. |
| Variações e adicionais | Configurador existente ampliado para quantidades de um mesmo adicional. Carrinho passa a respeitar escolhas incluídas, seguindo a ordem de preço usada pelo servidor. |
| Quantidade mínima e antecedência | Regras existentes mantidas no cliente e no validador do pedido. Quantidades de pedidos são inteiras; pesos são opções de preço cadastradas, não pesagem arbitrária. |
| Identidade em celular | Inspeção em 390 × 844: logo/capa carregados, sem excesso horizontal. |

## Evidências

- 249 testes JavaScript aprovados, incluindo contraste, validação de arquivos, URLs, preços de adicionais, recuperação de erro e confirmação de publicação.
- 20 asserções pgTAP da identidade visual aprovadas no staging, em transação revertida: autorização, isolamento entre estabelecimentos, validação de imagens, rascunho, publicação, remoção e descarte.
- `docs/evidencias/menu-branding-staging-smoke.json`: upload real autenticado, isolamento do rascunho, publicação e arquivo público. Os dados fictícios são removidos depois da inspeção.
- Capturas `cardapio-identidade-publicada-2026-10-20.jpg` e `cardapio-identidade-mobile-2026-10-20.jpg` registram a fixture publicada. Imagens da Diniz foram usadas somente como arquivos de teste.
- O editor foi inspecionado com fixture local usando a interface real e backend simulado; isso é distinto do teste real de API/Storage. A confirmação nativa travou no navegador interno e foi substituída por controles na página, cobertos por testes de comportamento.

## Operação e liberação

Nova migration: `20261020151727_menu_visual_identity_assets.sql`, aplicada somente em `fuesdztsvrkkgnbqhcxi`. Inventário: staging 77 migrations; produção continua com 55, com 22 retidas pelo gate de liberação.

Teste reproduzível: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/menu-branding-staging-smoke.ps1`; ao terminar a inspeção, executar o mesmo comando com `-Cleanup`. O destino é fixo no staging. Chaves administrativas, senha aleatória e sessão ficam somente na memória do processo. A evidência contém apenas IDs/caminhos da fixture e resultados.

O armazenamento de versões antigas fica preservado; esta entrega não faz coleta automática de imagens órfãs. Não há alteração de cobrança, cancelamento de clientes, aceite jurídico ou deploy de produção. A publicação deve seguir os gates e a sequência de revisão já registrados em `CARDAPIO_FOCO_UNICO.md`.

## Complemento de validação no Edge

Retomada na aba externa existente: salvamento, confirmação na página, descarte, publicação e remoção passaram na fixture local com backend simulado. Evidência: `docs/evidencias/cardapio-editor-edge-2026-10-20.jpg`. O seletor automatizado de arquivos foi bloqueado porque a extensão não tem acesso a URLs de arquivo; nenhuma permissão foi ampliada. Upload real continua coberto pelo smoke do staging. A extensão Dark Reader deste perfil altera as cores calculadas, portanto a verificação visual de contraste usa as evidências anteriores e os testes de luminância.
