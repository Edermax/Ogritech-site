(() => {
  const validColor = value => /^#[0-9a-f]{6}$/i.test(value || "");
  function contrastColor(color) {
    if (!validColor(color)) return "#ffffff";
    const channels = color.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? "#000000" : "#ffffff";
  }
  function assetUrl(path, baseUrl) {
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(path || "")) return "";
    try {
      const base = new URL(baseUrl);
      if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))) return "";
      return `${base.origin}/storage/v1/object/public/menu-images/${path}`;
    } catch { return ""; }
  }
  function applyColors(element, identity = {}) {
    const primary = validColor(identity.primary_color) ? identity.primary_color : "#111827";
    const accent = validColor(identity.accent_color) ? identity.accent_color : "#08b9d3";
    element.style.setProperty("--menu-primary", primary);
    element.style.setProperty("--menu-on-primary", contrastColor(primary));
    element.style.setProperty("--accent", accent);
    element.style.setProperty("--menu-on-accent", contrastColor(accent));
  }
  async function validateImage(file) {
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024)
      throw new Error("Use uma imagem JPEG, PNG ou WebP de até 5 MB.");
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const png = [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value);
    const webp = String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP";
    if (!({"image/jpeg":jpeg,"image/png":png,"image/webp":webp})[file.type]) throw new Error("O conteúdo do arquivo não corresponde ao formato da imagem.");
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) throw new Error("Não foi possível abrir esta imagem. Escolha outro arquivo.");
    const valid = bitmap.width > 0 && bitmap.height > 0 && bitmap.width <= 10000 && bitmap.height <= 10000 && bitmap.width * bitmap.height <= 40000000;
    bitmap.close();
    if (!valid) throw new Error("Use uma imagem de até 10.000 pixels por lado e 40 megapixels.");
    return true;
  }
  function productIllustration(slug, category, item) {
    if (slug !== "diniz-doces" && slug !== "diniz-doces-previa-7d1") return null;
    const label = `${category?.name || ""} ${item?.name || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const illustrations = [
      { match: /bolo de corte.*ninho com nutella/, src: "bolo-chocolate-granulado.jpg", alt: "Bolo de chocolate decorado produzido pela Diniz Doces" },
      { match: /bolo de corte/, src: "bolo-de-corte.jpg", alt: "Fatias de bolo de corte produzidas pela Diniz Doces" },
      { match: /bolo personalizado retangular/, src: "bolo-retangular-caramelo.jpg", alt: "Bolo retangular decorado da Diniz Doces" },
      { match: /bolo personalizado redondo/, src: "bolo-redondo.png", alt: "Bolo redondo decorado da Diniz Doces" },
      { match: /doces tradicionais/, src: "doces-sortidos.jpg", alt: "Seleção de doces da Diniz Doces" },
      { match: /doces especiais/, src: "brigadeiros.png", alt: "Brigadeiros da Diniz Doces" },
      { match: /pao de mel/, src: "pao-de-mel.jpg", alt: "Pão de mel personalizado produzido pela Diniz Doces" },
      { match: /pirulito/, src: "pirulito.jpg", alt: "Pirulito personalizado produzido pela Diniz Doces" },
    ];
    const selected = illustrations.find(({ match }) => match.test(label));
    if (selected) return { ...selected, src: `/assets/diniz-doces/${selected.src}` };
    return null;
  }
  async function prepareImage(file, maxSide = 1600) {
    await validateImage(file);
    const bitmap=await createImageBitmap(file), scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
    try {
      const canvas=document.createElement("canvas"); canvas.width=Math.max(1,Math.round(bitmap.width*scale)); canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const context=canvas.getContext("2d"); if(!context)throw new Error("Não foi possível preparar a imagem.");
      context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",0.82));
      if(!blob || blob.size>5*1024*1024)throw new Error("Não foi possível otimizar a imagem. Escolha outro arquivo.");
      if(scale===1 && blob.size>=file.size)return file;
      return new File([blob],file.name.replace(/\.[^.]+$/,"")+(blob.type==="image/webp"?".webp":".png"),{type:blob.type});
    } finally {bitmap.close();}
  }
  globalThis.OgritechMenuBranding = { validColor, contrastColor, assetUrl, applyColors, validateImage, prepareImage, productIllustration };
})();
