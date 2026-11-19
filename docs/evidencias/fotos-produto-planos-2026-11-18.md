# Fotos por produto e plano

Solicitação de 18/11/2026, retomada em 19/11: permitir até três fotos por produto no Catálogo Completo e uma no Essencial. Implementação na branch `feat/fotos-produto-planos-20261118`, baseada no main publicado pelo PR #155.

## Comportamento

- Essencial: uma foto principal por produto. Completo: principal e até duas fotos adicionais, inclusive no acesso efetivo de teste do Completo.
- Painel com quantidade disponível, explicação do plano, prévias, escolha da principal, substituição e remoção. JPEG, PNG e WebP passam pela verificação de conteúdo, tamanho e otimização já usada pelo produto; envio direto ao Storage, sem novas dependências.
- Vitrine com botões de pelo menos 44 px, indicação da foto atual, navegação por teclado e descrição acessível. Produtos com várias fotos recebem uma área maior para facilitar a visualização e a navegação em celular.
- Mudança para o Essencial preserva as fotos adicionais já salvas e as oculta na resposta pública. Elas reaparecem com acesso ao Completo. Novas fotos adicionais são bloqueadas no servidor; editar preço ou substituir a principal continua permitido.
- Falhas de envio limpam somente os arquivos novos enviados naquela tentativa e mantêm a prévia. Se o rascunho for salvo e sua publicação falhar, as fotos salvas são mantidas para repetir a publicação sem reenviá-las.

## Persistência e segurança

`image_url` continua sendo a principal; `metadata.gallery_images` armazena até dois caminhos relativos do bucket `menu-images`. A migration `catalog_product_photo_limits` aplica a regra no salvamento direto, no rascunho e em um trigger de `menu_items`, evitando contornar o limite por escrita direta. Caminhos precisam pertencer ao estabelecimento, ser distintos e corresponder a objetos válidos de até 5 MB. Os validadores são internos, com execução revogada para anon/authenticated.

Fotos principais e adicionais referenciadas por produtos ou rascunhos salvos passam pela proteção existente contra exclusão e substituição no Storage. Não são apagadas fotos antigas automaticamente. Nenhum produto, preço, saldo, pedido ou assinatura existente é reescrito pela migration. Apenas as descrições dos recursos dos dois planos recebem a informação do limite, sem alteração de valores.

Um produto novo que ainda exista apenas em rascunho e tenha três fotos precisa ser publicado enquanto houver acesso ao Completo, ou ter suas fotos adicionais removidas antes da publicação no Essencial. As imagens permanecem preservadas no rascunho; a validação não permite criar novos produtos com três fotos no Essencial.

## Validação

- 501 testes Node e verificações estáticas aprovados.
- Dez suítes relacionadas ao catálogo e pedidos, 421 asserções aprovadas em banco local exclusivo, sem rede e sem cópia de dados de clientes. Incluem 28 verificações de limites, planos, isolamento, arquivos, rascunhos, publicação, preservação e visibilidade.
- Homologação Supabase: migration `20261119011836`; as 28 asserções passaram em transação desfeita, sem estabelecimento fictício remanescente. O Storage hospedado bloqueia DELETE SQL direto; o teste respeita esse bloqueio e confere a preservação do objeto. A política restritiva de exclusão também foi inspecionada.
- Vinte jornadas de navegador aprovadas, sem erros JavaScript e sem requisições externas: painel claro/escuro em 320, 390, 768 e 1440 px; upload real de arquivos sintéticos, escolha da principal, Essencial, downgrade, falhas parciais e de publicação, galeria pública, trial e ausência de edição para funcionário. Revisão visual em celular corrigiu a quebra dos botões e ampliou a galeria pública.

O CI inicial 44504286590 do [PR #156](https://github.com/Edermax/Ogritech-site/pull/156) aprovou o replay das 114 migrations, 1.149 asserções SQL em 38 arquivos e os testes de concorrência, além das verificações estáticas. A suíte de navegação identificou uma expectativa anterior de fechar o editor após falha de publicação. Ela foi atualizada para exigir a preservação da edição; a publicação manual bem-sucedida ou confirmada pela atualização dos dados fecha o editor. As verificações não foram removidas nem tiveram seu tempo de espera ampliado.

O candidato funcional `6b53dddd05473c003beb796fae737cc0086b276d` passou nas três suítes do CI 44505921901. Produção recebeu a migration `20261119104818` em 19/11, com preservação dos 18 produtos, preços e estoque e paridade de nove funções/permissões com staging. Veja o [registro de promoção](fotos-produto-publicacao-2026-11-19.md). Evidências locais estão em `outputs/fotos-produto-planos-20261118/` na raiz de trabalho e em `outputs/product-photos/` no worktree; não contêm fotografias de clientes.
