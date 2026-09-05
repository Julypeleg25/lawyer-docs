import { z } from "zod";

const configuredBaseUrl: unknown = import.meta.env.VITE_API_URL;
const baseUrl = typeof configuredBaseUrl === "string" ? configuredBaseUrl : "/api";
const apiErrorSchema = z.object({ code: z.string(), details: z.unknown().optional() });
export class ApiError extends Error {
  constructor(
    public code: string,
    public details?: unknown,
  ) {
    super(code);
  }
}
async function parseApiError(response: Response): Promise<ApiError> {
  const payload: unknown = await response.json().catch(() => ({ code: "INTERNAL_ERROR" }));
  const parsed = apiErrorSchema.safeParse(payload);
  return parsed.success
    ? new ApiError(parsed.data.code, parsed.data.details)
    : new ApiError("INTERNAL_ERROR");
}

export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!response.ok) {
    throw await parseApiError(response);
  }
  const payload: unknown = await response.json();
  return schema.parse(payload);
}
export async function download(path: string, body: unknown): Promise<void> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await parseApiError(response);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const matched = /filename\*=UTF-8''([^;]+)/.exec(disposition);
  const encodedFilename = matched?.[1];
  const filename = encodedFilename ? decodeURIComponent(encodedFilename) : "מסמכי עסקה.docx";
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
