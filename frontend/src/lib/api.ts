export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Typed fetch wrapper that attaches the backend session token. */
export async function apiFetch<T>(path: string, token: string | undefined, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "1",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string; details?: Record<string, string[]> };
      if (body.error) message = body.error;
      const first = body.details && Object.entries(body.details)[0];
      if (first) message += `: ${first[0]} – ${first[1][0]}`;
    } catch {
      /* non-JSON */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}
