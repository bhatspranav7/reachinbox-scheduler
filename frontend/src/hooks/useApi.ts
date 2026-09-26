"use client";

import { useCallback } from "react";
import { signOut, useSession } from "next-auth/react";
import useSWR, { type SWRConfiguration } from "swr";
import { ApiError, apiFetch } from "@/lib/api";

/** Returns a fetcher bound to the current user's backend token. */
export function useApiClient() {
  const { data: session } = useSession();
  const token = session?.backendToken;

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit) => {
      try {
        return await apiFetch<T>(path, token, init);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) void signOut({ callbackUrl: "/" });
        throw err;
      }
    },
    [token],
  );
  return { token, request };
}

/** SWR wrapper: key is the API path; `null` pauses fetching. */
export function useApi<T>(path: string | null, config?: SWRConfiguration<T>) {
  const { token, request } = useApiClient();
  return useSWR<T>(token && path ? [path, token] : null, ([p]: [string]) => request<T>(p), {
    revalidateOnFocus: true,
    ...config,
  });
}
