// Geoapify documents result_type, address components and rank.confidence here:
// https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/#response-object
// Delivery pricing requires a located building, never an administrative centroid.
export type DeliveryCoordinates = { lat: number; lon: number };
export type DeliveryGeocodeAddress = { street: string; housenumber: string; postcode: string; city: string; state: string; country: string };

const normalized = (value: unknown) => typeof value === "string"
  ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ")
  : "";

export function deliveryHouseNumber(address: unknown, street: unknown): { housenumber: string } | { error: "address_review_required" | "address_number_required" } {
  const supplied = normalized(address), canonicalStreet = normalized(street);
  if (!canonicalStreet || !supplied.startsWith(canonicalStreet)) return { error: "address_review_required" };
  const rest = supplied.slice(canonicalStreet.length);
  if (rest && !/^[\s,;-]/.test(rest)) return { error: "address_review_required" };
  const number = rest.replace(/^[\s,;-]+/, "").match(/^(?:n(?:umero|[oº°.]*)\s*[:.]?\s*)?(\d+[a-z]?)(?=$|[\s,;/-])/i)?.[1];
  return number ? { housenumber: number } : { error: "address_number_required" };
}

export function validatedDinizGeocode(value: unknown, expected?: Pick<DeliveryGeocodeAddress, "street" | "housenumber">): DeliveryCoordinates | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  const rank = result.rank && typeof result.rank === "object" && !Array.isArray(result.rank)
    ? result.rank as Record<string, unknown> : {};
  if (result.result_type !== "building" || !normalized(result.street)
    || typeof result.housenumber !== "string" || !/\d/.test(result.housenumber)
    || normalized(result.country_code) !== "br" || normalized(result.city) !== "ribeirao preto"
    || !["sp", "sao paulo"].includes(normalized(result.state_code || result.state))
    || typeof rank.confidence !== "number" || !Number.isFinite(rank.confidence)
    || rank.confidence < 0.8 || rank.confidence > 1) return null;
  if (expected && (normalized(result.street) !== normalized(expected.street)
    || normalized(result.housenumber) !== normalized(expected.housenumber))) return null;
  if (typeof result.lat !== "number" || !Number.isFinite(result.lat) || Math.abs(result.lat) > 90
    || typeof result.lon !== "number" || !Number.isFinite(result.lon) || Math.abs(result.lon) > 180) return null;
  return { lat: result.lat, lon: result.lon };
}
