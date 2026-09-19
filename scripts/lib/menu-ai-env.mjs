import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

const EnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(20).startsWith("sk-"),
  OGRITECH_MENU_AI_MODEL: z.string().regex(/^[a-z0-9.-]{3,80}$/).default("gpt-5.6-luna")
});

function parseEnvFile(source) {
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match) values[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

export async function loadMenuAiEnv(workspace = process.cwd()) {
  let local = {};
  try { local = parseEnvFile(await readFile(resolve(workspace, ".env.local"), "utf8")); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const parsed = EnvSchema.safeParse({ ...local, ...process.env });
  if (!parsed.success) throw new Error("Configuração do piloto de IA ausente ou inválida. Confira OPENAI_API_KEY em .env.local.");
  return Object.freeze(parsed.data);
}
