let csrfToken = "";
export function setCsrfToken(value: string) {
  csrfToken = value;
}
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
function errorText(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const errors = (data as { errors?: { field?: string; message?: string }[] })
    .errors;
  if (Array.isArray(errors) && errors.length)
    return errors
      .map(
        (error) =>
          `${String(error.field || "").replace(/^body\./, "")}: ${error.message || ""}`,
      )
      .join(" · ");
  const detail =
    (data as { detail?: unknown; message?: unknown }).detail ??
    (data as { message?: unknown }).message;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map(
        (x: { loc?: string[]; msg?: string }) =>
          `${(x.loc || []).filter((s) => s !== "body").join(".")}: ${x.msg || ""}`,
      )
      .join(" · ");
  if (detail && typeof detail === "object")
    return String(
      (detail as { message?: string; code?: string }).message ||
        (detail as { code?: string }).code ||
        fallback,
    );
  return fallback;
}
export async function api<T = Record<string, unknown>>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  )
    headers.set("Content-Type", "application/json");
  if (
    csrfToken &&
    options.method &&
    !["GET", "HEAD", "OPTIONS"].includes(options.method.toUpperCase())
  )
    headers.set("X-CSRF-Token", csrfToken);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError("无法连接服务端 / Cannot connect to the server", 0);
  }
  const contentType = response.headers.get("content-type") || "";
  const data: unknown = contentType.includes("application/json")
    ? await response.json()
    : null;
  if (!response.ok)
    throw new ApiError(
      errorText(data, `请求失败 / Request failed (${response.status})`),
      response.status,
    );
  if (response.status !== 204 && data === null)
    throw new ApiError(
      "服务端未返回有效 JSON，请检查 API 路由 / Invalid API response; check the backend route",
      response.status,
    );
  if (
    data &&
    typeof data === "object" &&
    "csrf_token" in data &&
    typeof data.csrf_token === "string"
  )
    setCsrfToken(data.csrf_token);
  return data as T;
}
export const post = <T = Record<string, unknown>>(
  path: string,
  body: unknown = {},
  options: RequestInit = {},
) => api<T>(path, { ...options, method: "POST", body: JSON.stringify(body) });
export const patch = <T = Record<string, unknown>>(
  path: string,
  body: unknown,
) => api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
