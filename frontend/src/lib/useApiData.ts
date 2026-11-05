import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";

export function useApiData<T>(path: string | null, nonce = 0, polling = true) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date>();
  const request = useRef<{ path: string; controller: AbortController } | null>(
    null,
  );
  const refresh = useCallback(async () => {
    if (!path || request.current?.path === path) return;
    request.current?.controller.abort();
    const controller = new AbortController();
    request.current = { path, controller };
    try {
      const result = await api<T>(path, { signal: controller.signal });
      if (
        request.current?.controller === controller &&
        !controller.signal.aborted
      ) {
        setData(result);
        setError(null);
        setUpdatedAt(new Date());
      }
    } catch (e) {
      if (
        request.current?.controller === controller &&
        !controller.signal.aborted
      ) {
        setError(e instanceof Error ? e.message : "Request failed");
        if (e instanceof ApiError && e.status === 401)
          window.dispatchEvent(new Event("flowpilot-auth-expired"));
      }
    } finally {
      if (request.current?.controller === controller) {
        if (!controller.signal.aborted) setLoading(false);
        request.current = null;
      }
    }
  }, [path]);
  useEffect(() => {
    setLoading(Boolean(path));
    setData(undefined);
    setError(null);
    setUpdatedAt(undefined);
    void refresh();
    return () => {
      request.current?.controller.abort();
      request.current = null;
    };
  }, [path, refresh]);
  useEffect(() => {
    void refresh();
  }, [nonce, refresh]);
  useEffect(() => {
    if (!path || !polling) return;
    const handle = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 2500);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(handle);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [path, polling, refresh]);
  return { data, error, loading, updatedAt, refresh };
}
