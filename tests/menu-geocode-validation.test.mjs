import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { z } from "zod";

const source = await readFile(new URL("../supabase/functions/cep-lookup/geocode-validation.ts", import.meta.url), "utf8");
const helpers = runInNewContext(stripTypeScriptTypes(source.replace(/export /g, "")) + ";({validatedDinizGeocode,deliveryHouseNumber})");
const validate = helpers.validatedDinizGeocode;
// Synthetic building fixture: these coordinates are not the merchant's origin.
const building = () => ({
  result_type: "building", street: "Rua de teste", housenumber: "123A",
  country_code: "br", state_code: "SP", city: "Ribeirão Preto",
  lat: -21.2, lon: -47.8, rank: { confidence: 0.95 }
});

test("delivery geocode accepts a confident building with street, number and correct city/state/country", () => {
  const result = validate(building());
  assert.equal(result.lat, -21.2);
  assert.equal(result.lon, -47.8);
  assert.ok(validate({ ...building(), city: " RIBEIRAO  PRETO ", country_code: "BR", state_code: undefined, state: "São Paulo", rank: { confidence: 0.8 } }));
});

test("administrative centroids and street-only results cannot determine a delivery fee", () => {
  for (const result_type of ["city", "county", "state", "country", "postcode", "street", "suburb", "district", "amenity", "unknown"]) {
    assert.equal(validate({ ...building(), result_type }), null, result_type);
  }
  assert.equal(validate({ result_type: "city", country_code: "br", state_code: "SP", city: "Ribeirão Preto", lat: -21.1776315, lon: -47.8100983, rank: { confidence: 0.5 } }), null);
});

test("a building in another city, state or country is rejected", () => {
  for (const patch of [{ city: "São Paulo" }, { city: "Ribeirão Preto do Sul" }, { state_code: "MG" }, { country_code: "pt" }, { city: undefined }, { state_code: undefined }, { country_code: undefined }]) {
    assert.equal(validate({ ...building(), ...patch }), null, JSON.stringify(patch));
  }
});

test("a confident neighboring building or different street cannot replace the requested address", () => {
  const expected = { street: "Rua de teste", housenumber: "123A" };
  assert.ok(validate(building(), expected));
  assert.equal(validate({ ...building(), housenumber: "125" }, expected), null);
  assert.equal(validate({ ...building(), street: "Rua diferente" }, expected), null);
});

test("legacy delivery text extracts the house number only after the exact ViaCEP street", () => {
  for (const [address, street, expected] of [
    ["Rua Treze de Maio, 319, Centro, Ribeirão Preto - SP", "Rua Treze de Maio", "319"],
    ["Rua 13 de Maio, 10A, Centro, Ribeirão Preto - SP", "Rua 13 de Maio", "10a"],
    ["Rua São João, nº 12, apartamento 9", "Rua Sao Joao", "12"],
    ["Avenida 9 de Julho, 1000, CEP 14094-205", "Avenida 9 de Julho", "1000"]
  ]) assert.equal(helpers.deliveryHouseNumber(address, street).housenumber, expected);
  for (const [address, street, expected] of [
    ["Rua diferente, 319, Centro", "Rua Treze de Maio", "address_review_required"],
    ["Rua Treze de Maio, [informe o número], CEP 14094205", "Rua Treze de Maio", "address_number_required"],
    ["Rua Treze de Maio, s/n, CEP 14094205", "Rua Treze de Maio", "address_number_required"],
    ["Rua Treze de Maio Filho, 319", "Rua Treze de Maio", "address_number_required"],
    ["Rua de teste, 319", "", "address_review_required"]
  ]) assert.equal(helpers.deliveryHouseNumber(address, street).error, expected);
});

test("missing street/number and low or invalid confidence cannot determine a delivery fee", () => {
  for (const patch of [{ street: "" }, { street: undefined }, { housenumber: undefined }, { housenumber: "s/n" }, { housenumber: "" }, { housenumber: 123 }, { rank: {} }, { rank: { confidence: 0.799 } }, { rank: { confidence: "1" } }, { rank: { confidence: NaN } }, { rank: { confidence: 1.1 } }]) {
    assert.equal(validate({ ...building(), ...patch }), null, JSON.stringify(patch));
  }
});

test("non-finite/out-of-range coordinates and malformed results are rejected", () => {
  for (const patch of [{ lat: NaN }, { lon: Infinity }, { lat: 91 }, { lon: -181 }, { lat: "-21.2" }]) assert.equal(validate({ ...building(), ...patch }), null);
  for (const result of [null, undefined, [], "building", 1]) assert.equal(validate(result), null);
});

test("CEP route validates origin and destination geocoding without a centroid fallback", async () => {
  const route = await readFile(new URL("../supabase/functions/cep-lookup/index.ts", import.meta.url), "utf8");
  assert.match(route, /validatedDinizGeocode\(parsed\.data\.results\[0\], address\)/);
  assert.match(route, /if \(!coordinates\) throw new Error\("geocode_imprecise"\)/);
  assert.match(route, /dinizOriginPromise \|\|= geocode\(DINIZ_ORIGIN_ADDRESS\)/);
  assert.doesNotMatch(route, /return \{ lat: parsed\.data\.results\[0\]\.lat/);
  assert.doesNotMatch(route, /searchParams\.set\("text"/);
  assert.match(route, /street: "Rua Judy Villar Benedine", housenumber: "319", postcode: "14094205"/);
  assert.match(route, /deliveryHouseNumber\(parsed\.data\.address, address\.data\.logradouro\)/);
});

async function routeFixture({ centroidAt = "" } = {}) {
  const route = await readFile(new URL("../supabase/functions/cep-lookup/index.ts", import.meta.url), "utf8");
  const requests = [];
  const code = stripTypeScriptTypes(route.replace(/^import .*;\r?\n/gm, "").replace("export default", "globalThis.cepModule ="));
  const context = {
    z, ...helpers, URL, Response, DOMException, AbortController, setTimeout, clearTimeout,
    Deno: { env: { toObject: () => ({ ALLOWED_ORIGINS: "https://ogritech.example", GEOAPIFY_API_KEY: "fixture-key-not-a-real-credential" }) } },
    withSupabase: (_options, handler) => handler,
    fetch: async value => {
      const url = new URL(value); requests.push(url);
      let data;
      if (url.hostname === "viacep.com.br") data = { logradouro: "Rua 13 de Maio", localidade: "Ribeirão Preto", uf: "SP" };
      else if (url.pathname === "/v1/geocode/search") {
        const origin = url.searchParams.get("street") === "Rua Judy Villar Benedine";
        const imprecise = centroidAt === (origin ? "origin" : "destination");
        data = { results: [{ ...building(), street: url.searchParams.get("street"), housenumber: url.searchParams.get("housenumber"), result_type: imprecise ? "city" : "building", lat: origin ? -21.1 : -21.2, rank: { confidence: imprecise ? 0.5 : 1 } }] };
      } else if (url.pathname === "/v1/routing") data = { features: [{ properties: { distance: 2500, time: 600 } }] };
      else throw new Error("unexpected provider");
      return Response.json(data);
    }
  };
  runInNewContext(code, context);
  return {
    requests,
    async lookup(body) {
      const response = await context.cepModule.fetch(new Request("https://fixture.invalid/cep-lookup", {
        method: "POST", headers: { "Content-Type": "application/json", Origin: "https://ogritech.example" }, body: JSON.stringify(body)
      }));
      return { status: response.status, body: await response.json() };
    }
  };
}

test("a valid delivery routes only after both structured building matches", async () => {
  const fixture = await routeFixture();
  const result = await fixture.lookup({ cep: "14094205", target_slug: "diniz-doces", address: "Rua 13 de Maio, 319, Ribeirão Preto - SP" });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.delivery_quote.fee, 3.75);
  const geocodes = fixture.requests.filter(url => url.pathname === "/v1/geocode/search");
  assert.equal(geocodes.length, 2);
  assert.equal(geocodes[0].searchParams.get("housenumber"), "319");
  assert.equal(geocodes[1].searchParams.get("postcode"), "14094205");
  assert.ok(geocodes.every(url => !url.searchParams.has("text")));
  assert.equal(fixture.requests.filter(url => url.pathname === "/v1/routing").length, 1);
});

test("an origin or destination centroid never reaches routing or produces a delivery fee", async () => {
  for (const centroidAt of ["origin", "destination"]) {
    const fixture = await routeFixture({ centroidAt });
    const result = await fixture.lookup({ cep: "14094205", target_slug: "diniz-doces", address: "Rua 13 de Maio, 319, Ribeirão Preto - SP" });
    assert.equal(result.status, 502, centroidAt);
    assert.equal(result.body.data?.delivery_quote, undefined);
    assert.equal(fixture.requests.filter(url => url.pathname === "/v1/routing").length, 0);
  }
});

test("ordinary CEP lookup remains independent of geocoding and delivery address mistakes are rejected early", async () => {
  const fixture = await routeFixture();
  assert.equal((await fixture.lookup({ cep: "14094205", target_slug: "diniz-doces" })).status, 200);
  const result = await fixture.lookup({ cep: "14094205", target_slug: "diniz-doces", address: "Rua diferente, 319, Ribeirão Preto - SP" });
  assert.equal(result.status, 422);
  assert.equal(result.body.error.code, "address_review_required");
  assert.equal(fixture.requests.filter(url => url.hostname === "api.geoapify.com").length, 0);
});
