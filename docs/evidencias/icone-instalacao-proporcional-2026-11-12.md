# Ícone de instalação proporcional

O símbolo passa a ocupar aproximadamente 76% da altura no ícone comum e no iPhone. No Android, a versão maskable usa aproximadamente 66%, sem a margem adicional aplicada aos ícones comuns. Todo o símbolo permanece dentro do círculo de segurança de raio 40% especificado em https://w3c.github.io/manifest/#icon-masks.

O desenho e as cores vêm diretamente de `ogritech-brand-symbol.png`. Para reproduzir os cinco arquivos, execute `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-app-icons.ps1` na raiz do projeto.

Arquivos finais:

- `ogritech-app-v2-192.png` e `ogritech-app-v2-512.png`;
- `ogritech-app-v2-maskable-192.png` e `ogritech-app-v2-maskable-512.png`;
- `ogritech-apple-touch-v2.png`.

O manifesto usa os novos nomes para evitar o cache das imagens anteriores. O service worker passa ao cache v19 e inclui os novos ícones. Os links Apple das páginas de entrada e do painel usam a versão de 180 pixels. A identidade e o endereço inicial do app foram preservados.

Validação: verificações estáticas do projeto aprovadas; 14 testes existentes de instalação aprovados; dimensões reais conferidas com o manifesto; imagens opacas; símbolo centralizado com tolerância de um pixel; raio máximo do símbolo maskable de 38,8%; referências e precache conferidos; `git diff --check` aprovado. Sem teste em aparelho físico. A publicação foi solicitada pelo responsável após a validação local.

Foi explorada uma prévia com a ferramenta integrada ImageGen. O arquivo final usa redimensionamento determinístico da marca original para preservar fielmente sua geometria. Prompt da prévia:

> Edit target: existing Ogritech app logo icon. This is strictly an identity-preserving reframing / padding adjustment, not a logo redesign. Preserve EXACT existing cyan logo silhouette, four curved rounded aperture-like pieces, original cyan color and all white internal negative spaces. Output one square icon on opaque pure white #FFFFFF full-bleed background, no rounded exterior card, no border, no shadow, no text, no additional shapes. Crop the excess external white margins from the input and scale the original complete mark uniformly so its longest dimension (height) occupies exactly 74% of the square canvas height. Center the full mark precisely both horizontally and vertically. Keep the full mark intact and sharp. Retain its original aspect ratio and proportions.
