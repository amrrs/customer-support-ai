export const DEFAULT_DOMAIN = "geico.com";

export function normalizeDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2_048) return null;

  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;

    const hostname = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
    if (!hostname.includes(".") || hostname.length > 253) return null;

    const labels = hostname.split(".");
    if (
      labels.some(
        (label) =>
          !label ||
          label.length > 63 ||
          !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/.test(label),
      )
    ) {
      return null;
    }

    return hostname;
  } catch {
    return null;
  }
}

export function isUrlWithinDomain(value: string, domain: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    return (
      url.protocol === "https:" &&
      (hostname === domain || hostname.endsWith(`.${domain}`))
    );
  } catch {
    return false;
  }
}
