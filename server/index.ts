import "dotenv/config";
import bcrypt from "bcryptjs";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { BookingStatus, CourtStatus, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./lib/prisma.js";
import { authenticate, authorize, createToken, verifyPeerApiKey } from "./middleware/auth.js";
import type { AuthenticatedRequest } from "./types.js";

const app = express();
const port = Number(process.env.API_PORT ?? 4000);

app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000" }));
app.use(express.json({ limit: "100kb" }));

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const asyncRoute = (
  handler: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<unknown>,
) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(handler(req as AuthenticatedRequest, res, next)).catch(next);
};

const registerSchema = z.object({
  studentId: z.string().trim().min(4).max(30),
  fullName: z.string().trim().min(2).max(120),
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(72),
});

const loginSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});

const bookingSchema = z.object({
  courtId: z.coerce.number().int().positive(),
  startAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid start time"),
  endAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid end time"),
  purpose: z.string().trim().max(255).optional(),
});

const courtSchema = z.object({
  facilityId: z.coerce.number().int().positive(),
  categoryId: z.coerce.number().int().positive(),
  name: z.string().trim().min(2).max(120),
  capacity: z.coerce.number().int().min(1).max(100),
  opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  status: z.nativeEnum(CourtStatus).default(CourtStatus.AVAILABLE),
});

function dayRange(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, "Date must use YYYY-MM-DD");
  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(`${date}T23:59:59.999+07:00`);
  if (Number.isNaN(start.getTime())) throw new ApiError(400, "Invalid date");
  return { start, end };
}

function makeSlots(opensAt: string, closesAt: string, bookings: { startAt: Date; endAt: Date }[], date: string) {
  const slots: string[] = [];
  let cursor = new Date(`${date}T${opensAt}:00+07:00`);
  const close = new Date(`${date}T${closesAt}:00+07:00`);

  while (cursor.getTime() + 60 * 60 * 1000 <= close.getTime()) {
    const slotEnd = new Date(cursor.getTime() + 60 * 60 * 1000);
    const conflicts = bookings.some((booking) => booking.startAt < slotEnd && booking.endAt > cursor);
    if (!conflicts) {
      slots.push(cursor.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }));
    }
    cursor = slotEnd;
  }
  return slots;
}

app.get("/api/health", asyncRoute(async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ success: true, status: "healthy", service: "au-campus-court-api" });
}));

app.post("/api/auth/register", asyncRoute(async (req, res) => {
  const input = registerSchema.parse(req.body);
  const { password, ...profile } = input;
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { studentId: input.studentId }] },
  });
  if (existing) throw new ApiError(409, "Email or student ID is already registered");

  const user = await prisma.user.create({
    data: { ...profile, passwordHash: await bcrypt.hash(password, 12) },
    select: { id: true, email: true, fullName: true, studentId: true, role: true },
  });
  const token = createToken({ id: user.id, email: user.email, role: user.role });
  res.status(201).json({ success: true, data: { user, token } });
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const valid = user?.passwordHash ? await bcrypt.compare(input.password, user.passwordHash) : false;
  if (!user || !user.active || !valid) throw new ApiError(401, "Invalid email or password");

  const token = createToken({ id: user.id, email: user.email, role: user.role });
  res.json({
    success: true,
    data: { token, user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role } },
  });
}));

app.get("/api/auth/me", authenticate, asyncRoute(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, studentId: true, fullName: true, email: true, role: true, active: true },
  });
  if (!user?.active) throw new ApiError(401, "Account is unavailable");
  res.json({ success: true, data: user });
}));

app.get("/api/categories", asyncRoute(async (_req, res) => {
  const categories = await prisma.courtCategory.findMany({ orderBy: { name: "asc" } });
  res.json({ success: true, data: categories });
}));

app.get("/api/facilities", asyncRoute(async (_req, res) => {
  const facilities = await prisma.facility.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  res.json({ success: true, data: facilities });
}));

app.get("/api/courts", asyncRoute(async (req, res) => {
  const date = typeof req.query.date === "string" ? req.query.date : new Date().toISOString().slice(0, 10);
  const categoryId = typeof req.query.categoryId === "string" ? Number(req.query.categoryId) : undefined;
  const { start, end } = dayRange(date);

  const courts = await prisma.sportsCourt.findMany({
    where: {
      status: { not: CourtStatus.CLOSED },
      ...(categoryId && Number.isInteger(categoryId) ? { categoryId } : {}),
    },
    include: {
      facility: true,
      category: true,
      bookings: {
        where: { status: { in: [BookingStatus.CONFIRMED, BookingStatus.PENDING] }, startAt: { lte: end }, endAt: { gte: start } },
        select: { startAt: true, endAt: true },
      },
    },
    orderBy: { name: "asc" },
  });

  res.json({
    success: true,
    data: courts.map(({ bookings, ...court }) => ({
      ...court,
      availableSlots: court.status === CourtStatus.AVAILABLE ? makeSlots(court.opensAt, court.closesAt, bookings, date) : [],
    })),
  });
}));

app.post("/api/courts", authenticate, authorize(Role.STAFF, Role.ADMIN), asyncRoute(async (req, res) => {
  const input = courtSchema.parse(req.body);
  if (input.opensAt >= input.closesAt) throw new ApiError(400, "Closing time must be after opening time");
  const court = await prisma.sportsCourt.create({ data: input, include: { facility: true, category: true } });
  res.status(201).json({ success: true, data: court });
}));

app.patch("/api/courts/:id/status", authenticate, authorize(Role.STAFF, Role.ADMIN), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const { status } = z.object({ status: z.nativeEnum(CourtStatus) }).parse(req.body);
  const court = await prisma.sportsCourt.update({ where: { id }, data: { status } });
  res.json({ success: true, data: court });
}));

app.get("/api/bookings/me", authenticate, asyncRoute(async (req, res) => {
  const bookings = await prisma.booking.findMany({
    where: { userId: req.user!.id },
    include: { court: { include: { facility: true, category: true } } },
    orderBy: { startAt: "desc" },
  });
  res.json({ success: true, data: bookings });
}));

app.get("/api/bookings", authenticate, authorize(Role.STAFF, Role.ADMIN), asyncRoute(async (_req, res) => {
  const bookings = await prisma.booking.findMany({
    include: {
      user: { select: { id: true, fullName: true, email: true, role: true } },
      court: { include: { facility: true, category: true } },
    },
    orderBy: { startAt: "desc" },
    take: 100,
  });
  res.json({ success: true, data: bookings });
}));

app.post("/api/bookings", authenticate, asyncRoute(async (req, res) => {
  const input = bookingSchema.parse(req.body);
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  if (endAt <= startAt) throw new ApiError(400, "End time must be after start time");
  if (endAt.getTime() - startAt.getTime() > 2 * 60 * 60 * 1000) throw new ApiError(400, "A booking cannot exceed two hours");

  const booking = await prisma.$transaction(async (tx) => {
    const court = await tx.sportsCourt.findUnique({ where: { id: input.courtId } });
    if (!court || court.status !== CourtStatus.AVAILABLE) throw new ApiError(409, "Court is not available for booking");

    const conflict = await tx.booking.findFirst({
      where: {
        courtId: input.courtId,
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.PENDING] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
    });
    if (conflict) throw new ApiError(409, "This time overlaps an existing booking");

    return tx.booking.create({
      data: { courtId: input.courtId, userId: req.user!.id, startAt, endAt, purpose: input.purpose },
      include: { court: { include: { facility: true, category: true } } },
    });
  });

  res.status(201).json({ success: true, data: booking });
}));

app.delete("/api/bookings/:id", authenticate, asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) throw new ApiError(404, "Booking not found");
  const elevated = req.user!.role === Role.STAFF || req.user!.role === Role.ADMIN;
  if (booking.userId !== req.user!.id && !elevated) throw new ApiError(403, "You cannot cancel this booking");
  if (booking.status === BookingStatus.CANCELLED) throw new ApiError(409, "Booking is already cancelled");

  const updated = await prisma.booking.update({ where: { id }, data: { status: BookingStatus.CANCELLED } });
  res.json({ success: true, data: updated });
}));

app.get("/api/admin/users", authenticate, authorize(Role.ADMIN), asyncRoute(async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, studentId: true, fullName: true, email: true, role: true, active: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ success: true, data: users });
}));

app.patch("/api/admin/users/:id/role", authenticate, authorize(Role.ADMIN), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) throw new ApiError(400, "You cannot change your own administrator role");
  const { role } = z.object({ role: z.nativeEnum(Role) }).parse(req.body);
  const user = await prisma.user.update({ where: { id }, data: { role }, select: { id: true, email: true, role: true } });
  res.json({ success: true, data: user });
}));

app.get("/api/peer/availability", verifyPeerApiKey, asyncRoute(async (req, res) => {
  const date = typeof req.query.date === "string" ? req.query.date : new Date().toISOString().slice(0, 10);
  const { start, end } = dayRange(date);
  const courts = await prisma.sportsCourt.findMany({
    where: { status: CourtStatus.AVAILABLE },
    include: {
      facility: { select: { name: true } },
      bookings: {
        where: { status: { in: [BookingStatus.CONFIRMED, BookingStatus.PENDING] }, startAt: { lte: end }, endAt: { gte: start } },
        select: { startAt: true, endAt: true },
      },
    },
  });
  res.json({
    success: true,
    data: courts.map((court) => ({
      courtId: court.id,
      courtName: court.name,
      facility: court.facility.name,
      date,
      availableSlots: makeSlots(court.opensAt, court.closesAt, court.bookings, date),
    })),
  });
}));

app.use((_req, res) => res.status(404).json({ success: false, error: "Route not found" }));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  void _next;
  if (error instanceof z.ZodError) {
    return res.status(400).json({ success: false, error: "Validation failed", details: error.issues });
  }
  if (error instanceof ApiError) {
    return res.status(error.status).json({ success: false, error: error.message });
  }
  console.error(error);
  return res.status(500).json({ success: false, error: "Internal server error" });
});

const server = app.listen(port, () => {
  console.log(`AU Campus Court API running at http://localhost:${port}`);
});

async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
