const baseUrl = import.meta.env.VITE_API_URL ?? "/api";
export class ApiError extends Error {
  constructor(
    public code: string,
    public details?: unknown,
  ) {
    super(code);
  }
}
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ code: "INTERNAL_ERROR" }));
    throw new ApiError(body.code, body.details);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
export async function download(path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new ApiError(error.code, error.details);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const matched = disposition.match(/filename\*=UTF-8''([^;]+)/);
  const filename = matched ? decodeURIComponent(matched[1]) : "מסמכי עסקה.docx";
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
