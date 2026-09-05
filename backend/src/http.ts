import type { ErrorRequestHandler, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    public details?: unknown,
  ) {
    super(code);
  }
}
export const asyncRoute =
  (handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next): void => {
    void handler(req, res).catch(next);
  };
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next): void => {
  if (error instanceof AppError) {
    res.status(error.status).json({ code: error.code, details: error.details });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({ code: "VALIDATION_ERROR", details: error.issues });
    return;
  }
  res.status(500).json({ code: "INTERNAL_ERROR" });
};
