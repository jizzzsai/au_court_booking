import type { Request } from "express";
import type { Role } from "@prisma/client";

export type SessionUser = {
  id: number;
  email: string;
  role: Role;
};

export type AuthenticatedRequest = Request & {
  user?: SessionUser;
};
