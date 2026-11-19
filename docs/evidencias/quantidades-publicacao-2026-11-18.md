# Quantidades e sabores — publicação autorizada

O usuário respondeu **Autorizo** à aplicação da migration no banco de produção da Ogritech e à publicação das telas do PR #155. A autorização resolve o bloqueio anterior de promoção do checkout; não autoriza exportação de um backup completo para outro destino. Nenhum dump de dados de clientes foi gerado.

## Banco de produção

- Migration `catalog_quantity_distribution`, versão remota `20261119000747`, aplicada pelo Supabase MCP. A primeira chamada retornou uma confirmação expirada; a chamada renovada confirmou sucesso.
- Produção e staging agora têm 113 migrations. A comparação dos hashes normalizados dos corpos de oito funções e suas permissões foi idêntica à homologação.
- Os dois validadores novos continuam privados, sem permissão de execução para clientes. As RPCs públicas e as verificações de gestor/estabelecimento existentes permanecem aplicadas.
- O exemplo de quatro sabores com 25 unidades fechou 100 unidades no validador de produção, sem criar pedido ou alterar produto.
- Hashes dos 18 produtos, preços e estoque permaneceram iguais antes/depois. Nenhum produto recebeu as regras automaticamente. Os advisors não acrescentaram alerta de segurança nesta promoção; os avisos anteriores não foram alterados.

## Testes e distribuição

O candidato funcional `7892b922999122bb258056dd7209753ff425d7da` passou no [CI 44419075064](https://github.com/Edermax/Ogritech-site/actions/runs/44419075064): 497 testes Node, 37 arquivos SQL com 1.121 asserções, concorrência e 22 jornadas da interface. A homologação remota aprovou 47 verificações transacionais sem resíduos.

Esta etapa atualiza somente a classificação das migrations, o inventário observado e a evidência da publicação. O código funcional permanece o mesmo candidato aprovado. O frontend será publicado pelo PR #155 após o CI da revisão final. A conferência pública deve comparar os arquivos exatos do commit e repetir as 22 jornadas com respostas sintéticas, sem gravações em estabelecimentos reais.

O relatório final e os hashes públicos ficam em `outputs/quantidades-sabores-20261118/` na raiz do projeto, com o commit efetivamente publicado, CI, Pages e resultados da interface. Os fontes inspecionados e os hashes das funções anteriores permanecem disponíveis para revisão de reversão, preservando novas regras e snapshots após a adesão à funcionalidade.
