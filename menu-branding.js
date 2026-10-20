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
  globalThis.OgritechMenuBranding = { validColor, contrastColor, assetUrl, applyColors, validateImage };
})();
