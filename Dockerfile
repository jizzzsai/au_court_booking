FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN DATABASE_URL=mysql://placeholder:placeholder@localhost:3306/placeholder \
    SHADOW_DATABASE_URL=mysql://placeholder:placeholder@localhost:3306/placeholder_shadow \
    npx prisma generate

EXPOSE 3000 4000
