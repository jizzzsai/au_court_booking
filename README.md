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

These credentials are for this course demonstration only. The VM configuration
keeps the same seeded accounts and password; do not reuse them for a real service.

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

The GitHub Actions workflow publishes a `linux/amd64` image to
`ghcr.io/jizzzsai/au_court_booking`. A Git tag such as `v1` produces the matching
image tag, so the VM can pin a release rather than a commit hash. The image
contains the application source and dependencies. On the VM, place only two
files in the same directory:

- `compose.yml`: a copy of this repository's `compose.vm.yml`
- `.env`: a copy of `vm.env.example` with the VM's public URLs and unique secrets

Generate each secret independently with `openssl rand -hex 32`. Use a hexadecimal
database password because Compose also puts it in a MySQL connection URL. Set
`PUBLIC_ORIGIN` to the existing site's scheme and host, such as
`https://example.edu`, and `PUBLIC_SITE_URL` to the same URL plus
`/au-campus-court`. Set `IMAGE_TAG=v1` (or a later published version).
`WEB_HOST_PORT` defaults to 3100; first check that this loopback port is free.
The API and database are private Docker services; only the website is published
on `127.0.0.1:3100`.

Once the chosen GHCR image tag is available, run this in that VM directory:

```bash
docker compose up -d
docker compose ps
```

The first run pulls the application and MySQL images, builds the website for
`/au-campus-court` inside the container, creates the database, applies
migrations, and seeds courts plus student, staff, and admin accounts.
The three seeded accounts use the emails below and the demo password
`Student123!`, just like the local setup. The database lives in a named Docker volume.
To inspect startup errors, use `docker compose logs -f`. To stop the stack
without deleting data, use `docker compose down`.

To reach the site at `https://YOUR_FQDN/au-campus-court`, add one route to the
VM's **existing** reverse proxy: forward `/au-campus-court` and everything
under `/au-campus-court/` to `http://127.0.0.1:3100`, preserving the full path.
Do not replace the existing root-site configuration. The exact proxy rule
depends on what already runs on the VM; `docker compose up -d` alone cannot
claim a subpath on an existing FQDN. No new public API port or database port is
needed: browser API requests use `/au-campus-court/api` through the web
container. `deploy/nginx-au-campus-court.conf` is the IP-based Nginx route;
`deploy/nginx-au-campus-court-https.conf` is the domain route with HTTPS and
HTTP-to-HTTPS redirection. Both leave Ubuntu's default site enabled. Allow
inbound TCP 80 for Let's Encrypt validation and redirects, and TCP 443 for
HTTPS, in the VM's Azure network security group. Do not expose ports 3100,
4000, or 3306 publicly.

The Azure demonstration uses
`https://bad-sashs.japaneast.cloudapp.azure.com/au-campus-court/`. Its VM
deployment is in `~/au-campus-court`, with only `compose.yml` and private
`.env` needed for the Docker stack. Certbot manages the domain certificate;
`deploy/certbot-reload-nginx.sh` is installed as a renewal deploy hook so
Nginx reloads successful renewals. Check the stack with `sudo docker compose ps`
from that directory and test renewal with
`sudo /snap/bin/certbot renew --dry-run --run-deploy-hooks --no-random-sleep-on-renew`.

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
- `deploy/nginx-au-campus-court.conf` IP-based reverse-proxy route
- `deploy/nginx-au-campus-court-https.conf` HTTPS domain route
- `deploy/certbot-reload-nginx.sh` certificate-renewal reload hook
- `.github/workflows/publish-image.yml` AMD64 GHCR publishing workflow
- `scripts/smoke-test.mjs` automated API verification
- `PROJECT_PLAN.md` remaining implementation stages

## Remaining proposal stages

1. Replace local login with Microsoft university identity integration.
2. Move deployment credentials and API keys to Azure Key Vault.
3. Confirm the peer project's consumed API contract.
4. Add broader integration and security tests.
5. Deploy the application behind Nginx and HTTPS on the Linux VPS.
