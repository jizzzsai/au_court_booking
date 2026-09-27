# AU Campus Court

Local full-stack implementation of the AU Campus Court proposal. The project keeps the website, Express API, Prisma schema, and MySQL development database together while leaving the earlier `crud-api` coursework project unchanged.

## Implemented

- Responsive student court-search and booking interface
- Live court availability from MySQL
- Prisma models for users, facilities, categories, courts, and bookings
- Local JWT authentication with bcrypt password hashing
- Student booking history and cancellation
- Double-booking prevention inside a database transaction
- Staff reservation review and court maintenance controls
- Administrator user-role management
- Google Maps navigation links for facilities
- Secured peer availability endpoint using `x-api-key`
- Automated smoke test for Student, Staff, Administrator, and peer flows

Microsoft university sign-in and Azure Key Vault are intentionally left for the cloud integration stage. Local JWT accounts make the application testable before those external services are configured.

## Local addresses

- Website: `http://localhost:3000`
- API: `http://localhost:4000/api`
- API health: `http://localhost:4000/api/health`
- MySQL: `127.0.0.1:3307`

## Demo accounts

All seeded accounts use password `Student123!`.

| Role | Email |
| --- | --- |
| Student | `student@au.edu` |
| Staff | `staff@au.edu` |
| Administrator | `admin@au.edu` |

These credentials are only for local development.

## First-time setup

### Run the complete local stack with Docker

Start Docker Desktop, then run this from the project folder:

```bash
docker compose up --build -d
```

This starts the website, API, and MySQL. Open `http://localhost:3000` for the
website or `http://localhost:4000/api/health` to check the API. On first start,
the API applies Prisma migrations and adds the demo data. MySQL data remains in
the `campus-court-mysql` Docker volume between restarts.

```bash
docker compose ps          # Check all three services
docker compose logs -f     # Follow startup logs
docker compose down        # Stop the stack and keep database data
```

The Docker setup is for local development. It uses the local credentials from
`.env` and is not a production deployment. If `.env` is missing, copy
`.env.example` to `.env` and set `JWT_SECRET` and `PEER_API_KEY` before starting.
Do not run the separate `npm run dev:all` process at the same time: it uses the
same ports.

### Run on a Linux AMD64 VM without cloning the repository

The GitHub Actions workflow publishes one `linux/amd64` image to
`ghcr.io/jizzzsai/au_court_booking`. It contains the application source and
dependencies. On the VM, place only two files in the same directory:

- `compose.yml`: a copy of this repository's `compose.vm.yml`
- `.env`: a copy of `vm.env.example` with the VM's public URLs and unique secrets

Generate each secret independently with `openssl rand -hex 32`. Use a hexadecimal
database password because Compose also puts it in a MySQL connection URL. Set
`PUBLIC_SITE_URL` to `http://VM_IP:3000` and `PUBLIC_API_URL` to
`http://VM_IP:4000/api` (or your actual HTTPS URLs if a reverse proxy is set up).
Open ports 3000 and 4000 in the VM firewall for direct HTTP access.

After the GHCR package is made public, run this in that VM directory:

```bash
docker compose up -d
docker compose ps
```

The first run pulls the application and MySQL images, creates the database,
applies migrations, and seeds courts plus student, staff, and admin accounts.
The three seeded accounts use the emails below and the private `SEED_PASSWORD`
from `.env`. Changing `SEED_PASSWORD` after first startup does not change the
passwords of existing accounts. The database lives in a named Docker volume.
To inspect startup errors, use `docker compose logs -f`. To stop the stack
without deleting data, use `docker compose down`.

This VM setup is suitable for a working demonstration. It uses HTTP on ports
3000 and 4000; add a reverse proxy and HTTPS before treating it as a public
production service.

### Run Node.js on your Mac with only MySQL in Docker

1. Start Docker Desktop.
2. From this folder, start MySQL:

   ```bash
   docker compose up -d database
   ```

3. Install packages:

   ```bash
   npm install
   ```

4. Create or update the local database:

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. Start the website and API in separate terminals:

   ```bash
   npm run dev:web
   npm run dev:api
   ```

   Alternatively, start both together:

   ```bash
   npm run dev:all
   ```

## Verification

With the API and database running:

```bash
npm run build:api
npm run lint
npm run test:api
npm run build
```

## Important files

- `app/page.tsx` student, staff, and administrator interface
- `app/globals.css` responsive visual design
- `server/index.ts` REST API and business rules
- `server/middleware/auth.ts` JWT and role authorization
- `prisma/schema.prisma` database schema
- `prisma/seed.ts` demo data
- `docker-compose.yml` local website, API, and MySQL services
- `Dockerfile` Node.js image shared by the website and API
- `compose.vm.yml` image-only Linux VM deployment
- `vm.env.example` VM environment template
- `.github/workflows/publish-image.yml` AMD64 GHCR publishing workflow
- `scripts/smoke-test.mjs` automated API verification
- `PROJECT_PLAN.md` remaining implementation stages

## Remaining proposal stages

1. Replace local login with Microsoft university identity integration.
2. Move deployment credentials and API keys to Azure Key Vault.
3. Confirm the peer project's consumed API contract.
4. Add broader integration and security tests.
5. Deploy the application behind Nginx and HTTPS on the Linux VPS.
