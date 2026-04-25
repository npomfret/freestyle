FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY web/package.json web/package-lock.json ./web/

RUN npm ci
RUN npm --prefix web ci

ARG GIT_SHA=unknown
RUN echo "building web for $GIT_SHA"

COPY web ./web

RUN npm run build:web

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY src ./src
COPY db ./db
COPY --from=build /app/web/dist ./web/dist

EXPOSE 3001

CMD ["npx", "tsx", "src/server.ts"]
