/**
 * utils.ts — Shared error types and HTTP helpers used by all providers.
 */

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new ProviderError(`Missing environment variable: ${name}`);
  return value;
}

export function envIsTrue(name: string): boolean {
  return ["1", "true", "yes", "on"].includes(
    (process.env[name] ?? "").trim().toLowerCase()
  );
}

export function envIsFalse(name: string): boolean {
  return ["0", "false", "no", "off"].includes(
    (process.env[name] ?? "").trim().toLowerCase()
  );
}

/** GET/POST JSON via native fetch (Node 18+). Throws ProviderError on non-2xx. */
export async function httpJson(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: unknown } = {}
): Promise<unknown> {
  const resp = await fetch(url, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new ProviderError(`Provider request failed (${resp.status}): ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

/** POST multipart/form-data via native fetch. Throws ProviderError on non-2xx. */
export async function httpMultipart(
  url: string,
  token: string,
  form: FormData
): Promise<unknown> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new ProviderError(`Affinda request failed (${resp.status}): ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

/**
 * Walk a nested object trying each dot-path in order; return the first
 * non-null/undefined string value found.
 */
export function nestedGet(data: unknown, ...paths: string[][]): string | null {
  for (const path of paths) {
    let cur: unknown = data;
    for (const key of path) {
      if (cur === null || cur === undefined || typeof cur !== "object") {
        cur = undefined;
        break;
      }
      cur = (cur as Record<string, unknown>)[key];
    }
    if (cur !== null && cur !== undefined && String(cur).trim() !== "") {
      return String(cur);
    }
  }
  return null;
}
