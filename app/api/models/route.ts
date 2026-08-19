import { listNebiusModels } from "@/lib/nebius-models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeHeader(request: Request, name: string): string | undefined {
  const value = request.headers.get(name)?.trim();
  if (!value || value.length > 1_000) return undefined;
  return value;
}

export async function GET(request: Request) {
  const apiKey =
    safeHeader(request, "x-nebius-api-key") ?? process.env.NEBIUS_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "Add a Nebius API key to load the model catalog." },
      { status: 401 },
    );
  }

  try {
    const models = await listNebiusModels(apiKey);
    return Response.json(
      { models },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load models." },
      { status: 502 },
    );
  }
}
