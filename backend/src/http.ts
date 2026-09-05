import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
export class AppError extends Error { constructor(public status: number, public code: string, public details?: unknown) { super(code); } }
export const asyncRoute = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next); };
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof AppError) return res.status(error.status).json({ code: error.code, details: error.details });
  if (error instanceof ZodError) return res.status(400).json({ code: "VALIDATION_ERROR", details: error.issues });
  return res.status(500).json({ code: "INTERNAL_ERROR" });
}
