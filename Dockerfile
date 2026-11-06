FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json tsconfig.server.json ./
COPY drizzle ./drizzle
COPY src ./src

RUN npx vite build

FROM node:22-bookworm-slim

WORKDIR /app

COPY --from=build /app /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787

EXPOSE 8787

CMD ["npm", "run", "serve"]
