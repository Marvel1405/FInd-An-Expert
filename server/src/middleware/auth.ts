import type { NextFunction, Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
import { supabaseAuthClient } from "../supabaseAdmin.js";

export interface AuthenticatedRequest extends Request {
  user?: User;
  accessToken?: string;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const { data, error } = await supabaseAuthClient.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ error: "Invalid or expired session token" });
    return;
  }

  req.user = data.user;
  req.accessToken = token;
  next();
}
