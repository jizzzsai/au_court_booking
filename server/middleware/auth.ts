import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import type { AuthenticatedRequest, SessionUser } from "../types.js";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return secret;
}

export function createToken(user: SessionUser) {
  return jwt.sign(user, getJwtSecret(), { expiresIn: "1h" });
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  try {
    req.user = jwt.verify(token, getJwtSecret()) as SessionUser;
    return next();
  } catch {
    return res.status(401).json({ success: false, error: "Invalid or expired token" });
  }
}

export function authorize(...roles: Role[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: "Insufficient permission" });
    }
    return next();
  };
}

export function verifyPeerApiKey(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const configuredKey = process.env.PEER_API_KEY;
  const suppliedKey = req.header("x-api-key");

  if (!configuredKey || !suppliedKey || suppliedKey !== configuredKey) {
    return res.status(401).json({ success: false, error: "Invalid peer API key" });
  }
  return next();
}
