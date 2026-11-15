/* Static BR Code for a manual outgoing Pix. Generating the code never moves money. */
(() => {
  const ascii = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 $%*+\-./:]/g, " ").replace(/\s+/g, " ").trim();
  const field = (id, value) => {
    if (typeof value !== "string" || new TextEncoder().encode(value).length > 99) throw new Error("Campo Pix inválido.");
    return id + String(new TextEncoder().encode(value).length).padStart(2, "0") + value;
  };
  function crc16(value) {
    let crc = 0xffff;
    for (const byte of new TextEncoder().encode(value)) {
      crc ^= byte << 8;
      for (let bit = 0; bit < 8; bit++) crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  }
  function build({ key, receiver_name, receiver_city, amount_cents, reference }) {
    if (typeof key !== "string" || !key || key.length > 77 || /[\s\x00-\x1f]/.test(key)) throw new Error("Confira a chave Pix do cliente.");
    if (!Number.isSafeInteger(amount_cents) || amount_cents <= 0 || amount_cents > 100000000) throw new Error("Valor de devolução inválido.");
    const name = ascii(receiver_name).slice(0, 25), city = ascii(receiver_city).slice(0, 15);
    if (!name || !city || !/^[a-zA-Z0-9]{1,25}$/.test(reference || "")) throw new Error("Confira o favorecido, a cidade e a referência da devolução.");
    const payload = field("00", "01") + field("26", field("00", "br.gov.bcb.pix") + field("01", key))
      + field("52", "0000") + field("53", "986") + field("54", (amount_cents / 100).toFixed(2))
      + field("58", "BR") + field("59", name) + field("60", city) + field("62", field("05", reference)) + "6304";
    return payload + crc16(payload);
  }
  globalThis.OgritechPixCode = Object.freeze({ build, crc16 });
})();
