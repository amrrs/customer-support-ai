export const DEFAULT_MODEL_ID = "nvidia/Nemotron-3_5-Lightning";

export function normalizeModelId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const modelId = value.trim();
  if (!modelId || modelId.length > 200) return null;
  return /^[a-z\d._:/-]+$/i.test(modelId) ? modelId : null;
}
