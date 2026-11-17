# Fotos originais de artesanato e vestuário — 17/11/2026

Solicitação: trocar a aba Colecionáveis da demonstração da home por Vestuário e substituir as quatro ilustrações temporárias por imagens distintas de blusinha feminina, sapato de salto sem marca, bolsa artesanal e boneca artesanal.

As quatro fotos foram criadas pelo `image_gen.imagegen` integrado, em chamadas separadas, exclusivamente a partir de descrições, sem fotos de terceiros como referência. O sapato é apresentado como scarpin genérico de verniz preto, salto fino e sola vermelha, sem marca ou logotipo. Os nomes, descrições, unidades e textos alternativos da demonstração correspondem às novas imagens.

Arquivos finais, em `assets/landing-menu/`:

- `ogritech-blusinha-feminina.webp`: 800 × 800, 10.614 bytes.
- `ogritech-scarpin-sem-marca.webp`: 800 × 800, 14.652 bytes.
- `ogritech-bolsa-artesanal.webp`: 800 × 800, 52.274 bytes.
- `ogritech-boneca-artesanal.webp`: 800 × 800, 35.332 bytes.

Total: 112.872 bytes. A preparação WebP foi feita pelo pipeline existente `OgritechMenuBranding.prepareImage`, com limite de 800 px. Os PNGs originais estão preservados em `outputs/vitrine-fotos-20261117/originais/` na raiz do workspace. Os prompts exatos estão em `outputs/vitrine-fotos-20261117/prompts-e-origem.json` e no manifesto versionado `assets/landing-menu/fotos-vitrine-origem.json`, junto aos hashes dos originais e dos arquivos finais.

A aba Artesanato mostra Bolsa artesanal e Boneca artesanal; a aba Vestuário mostra Blusinha feminina e Scarpin de salto fino. O ajuste está limitado à demonstração da home: a taxonomia de atividades continua atendendo todos os segmentos aprovados. Os SVGs temporários foram retirados das referências e do pacote de frontend, substituídos pelos WebPs e seu novo registro de origem. O shell passou da versão 44 para 45.

Verificação local: checagem estática aprovada; 23 testes relacionados a landing, SEO, segmentos e pacote de publicação aprovados; seis verificações de interface em 390/1440 px, sem erros de JavaScript ou chamadas externas. As capturas de ambas as abas foram inspecionadas visualmente, incluindo o enquadramento dos quatro produtos no celular. Logs e capturas: `outputs/home-photo-review/`, `outputs/photo-tests.log`, `outputs/photo-browser.log` desta cópia de trabalho.

Publicação pelo fluxo existente de PR, CI e GitHub Pages, com alvo de reversão na versão pública anterior `36226ef40045294e0be7d18c96402d03300de2bd`. Esta alteração não requer migração de banco ou implantação de funções. A confirmação final de publicação será registrada no PR e nas evidências locais.
