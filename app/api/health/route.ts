export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      serverCredentials: {
        nebius: Boolean(process.env.NEBIUS_API_KEY),
        tavily: Boolean(process.env.TAVILY_API_KEY),
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
