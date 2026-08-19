import { createHash } from "node:crypto";
import { NEBIUS_MODELS_URL } from "@/lib/config";
import { DEFAULT_MODEL_ID, normalizeModelId } from "@/lib/models";

type NebiusModelsResponse = {
  data?: Array<{ id?: unknown }>;
};

const catalogCache = new Map<string, { models: string[]; expiresAt: number }>();

export async function listNebiusModels(apiKey: string): Promise<string[]> {
  const cacheKey = createHash("sha256").update(apiKey).digest("hex");
  const cached = catalogCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.models;

  const response = await fetch(NEBIUS_MODELS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Token Factory model catalog failed (${response.status}).`);
  }

  const payload = (await response.json()) as NebiusModelsResponse;
  const models = Array.from(
    new Set(
      (payload.data ?? [])
        .map((entry) => normalizeModelId(entry.id))
        .filter((id): id is string => id !== null)
        .filter((id) => !/embedding/i.test(id)),
    ),
  ).sort((a, b) => a.localeCompare(b));

  if (models.length === 0) throw new Error("Token Factory returned no chat models.");

  const orderedModels = models.includes(DEFAULT_MODEL_ID)
    ? [DEFAULT_MODEL_ID, ...models.filter((id) => id !== DEFAULT_MODEL_ID)]
    : models;
  catalogCache.set(cacheKey, {
    models: orderedModels,
    expiresAt: Date.now() + 5 * 60_000,
  });
  return orderedModels;
}
