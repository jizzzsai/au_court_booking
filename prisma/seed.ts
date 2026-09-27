import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient, Role } from "@prisma/client";

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3307),
  user: process.env.DB_USER ?? "campus_court",
  password: process.env.DB_PASSWORD ?? "campus_court_dev",
  database: process.env.DB_NAME ?? "au_campus_court",
  connectionLimit: 4,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash("Student123!", 12);

  await Promise.all([
    prisma.user.upsert({
      where: { email: "student@au.edu" },
      update: {},
      create: { studentId: "6511150", fullName: "Sai Aik Seng Hein Seng", email: "student@au.edu", passwordHash, role: Role.STUDENT },
    }),
    prisma.user.upsert({
      where: { email: "staff@au.edu" },
      update: {},
      create: { fullName: "Sports Office Staff", email: "staff@au.edu", passwordHash, role: Role.STAFF },
    }),
    prisma.user.upsert({
      where: { email: "admin@au.edu" },
      update: {},
      create: { fullName: "System Administrator", email: "admin@au.edu", passwordHash, role: Role.ADMIN },
    }),
  ]);

  const [basketball, badminton, futsal, tennis] = await Promise.all(
    ["Basketball", "Badminton", "Futsal", "Tennis"].map((name) =>
      prisma.courtCategory.upsert({ where: { name }, update: {}, create: { name } }),
    ),
  );

  const [conferenceCenter, sportsComplex, zoneC] = await Promise.all([
    prisma.facility.upsert({
      where: { name: "John XXIII Conference Center" },
      update: {},
      create: {
        name: "John XXIII Conference Center",
        location: "Suvarnabhumi Campus",
        mapLink: "https://www.google.com/maps/search/?api=1&query=Assumption+University+Suvarnabhumi+Campus",
      },
    }),
    prisma.facility.upsert({
      where: { name: "Sports Complex" },
      update: {},
      create: {
        name: "Sports Complex",
        location: "Suvarnabhumi Campus Level 2",
        mapLink: "https://www.google.com/maps/search/?api=1&query=Assumption+University+Sports+Complex",
      },
    }),
    prisma.facility.upsert({
      where: { name: "Outdoor Sports Zone C" },
      update: {},
      create: {
        name: "Outdoor Sports Zone C",
        location: "Suvarnabhumi Campus Zone C",
        mapLink: "https://www.google.com/maps/search/?api=1&query=Assumption+University+Suvarnabhumi+Campus+Zone+C",
      },
    }),
  ]);

  const courts = [
    { facilityId: conferenceCenter.id, categoryId: basketball.id, name: "Indoor Basketball Court", capacity: 20 },
    { facilityId: sportsComplex.id, categoryId: badminton.id, name: "Badminton Court A", capacity: 4 },
    { facilityId: sportsComplex.id, categoryId: badminton.id, name: "Badminton Court B", capacity: 4 },
    { facilityId: zoneC.id, categoryId: futsal.id, name: "Outdoor Futsal Court", capacity: 14 },
    { facilityId: zoneC.id, categoryId: tennis.id, name: "Tennis Court 1", capacity: 4 },
  ];

  for (const court of courts) {
    await prisma.sportsCourt.upsert({
      where: { facilityId_name: { facilityId: court.facilityId, name: court.name } },
      update: {},
      create: { ...court, opensAt: "08:00", closesAt: "21:00" },
    });
  }

  console.log("Seeded demo users, facilities, categories, and courts.");
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
