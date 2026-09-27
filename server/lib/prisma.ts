import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3307),
  user: process.env.DB_USER ?? "campus_court",
  password: process.env.DB_PASSWORD ?? "campus_court_dev",
  database: process.env.DB_NAME ?? "au_campus_court",
  connectionLimit: 8,
});

export const prisma = new PrismaClient({ adapter });
