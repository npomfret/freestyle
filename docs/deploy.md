# Freestyle Deployment

This project can be deployed on `fsd.snowmonkey.co.uk` without changing the shared nginx setup from this repo. The stack is:

- `freestyle-db`: Postgres 17 with `pgvector`, bound to `127.0.0.1:${POSTGRES_PORT}`
- `freestyle-app`: Node/Express app serving both the API and the built frontend on `3001`
- Shared nginx: external to this repo, proxies the public hostname to `freestyle-app:3001` on `snowmonkey-proxy-network`

## 1. Prepare the server

```bash
ssh root@fsd.snowmonkey.co.uk
mkdir -p /opt/freestyle
cd /opt/freestyle
```

Copy the repo into `/opt/freestyle`, then create the production env file:

```bash
cp .env.production.example .env.production
```

Set at least:

- `POSTGRES_PASSWORD`
- `CORS_ORIGIN`
- The LLM vars you actually want enabled on the server

## 2. Build and start the database

```bash
cd /opt/freestyle
npm run deploy:build
npm run deploy:db
docker compose -f docker-compose.production.yml --env-file .env.production ps
```

Wait for the DB healthcheck to go healthy before restoring data.

## 3. Bootstrap data from the local database

Create a dump on your local machine:

```bash
pg_dump -Fc postgresql://freestyle:freestyle@127.0.0.1:5433/freestyle > freestyle.dump
scp freestyle.dump root@fsd.snowmonkey.co.uk:/opt/freestyle/freestyle.dump
```

Restore it on the server:

```bash
ssh root@fsd.snowmonkey.co.uk
cd /opt/freestyle
docker compose -f docker-compose.production.yml --env-file .env.production exec -T db sh -lc 'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_restore -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges' < freestyle.dump
```

This makes the dump the source of truth for the initial server state.

## 4. Start the app

```bash
cd /opt/freestyle
npm run deploy:up
docker compose -f docker-compose.production.yml --env-file .env.production ps
docker compose -f docker-compose.production.yml --env-file .env.production logs --tail=100 app
curl http://127.0.0.1:3001/health
```

## 5. Nginx handoff

Do not change nginx from this repo. The shared nginx config needs:

- A vhost for the public Freestyle hostname
- Reverse proxy target `http://freestyle-app:3001`
- Access to the external Docker network `snowmonkey-proxy-network`
- `CORS_ORIGIN` in `.env.production` set to the exact public origin nginx serves

## 6. Ongoing local writes to the remote Postgres

Keep Postgres private on the server and use an SSH tunnel from your local machine:

```bash
ssh -N -L 5543:127.0.0.1:5543 root@fsd.snowmonkey.co.uk
```

Then point local scripts at:

```bash
postgresql://freestyle:<POSTGRES_PASSWORD>@127.0.0.1:5543/freestyle
```

That gives local write access to the remote DB without exposing Postgres publicly.

## 7. Schema changes after deployment

Do not run the current migration flow automatically on every deploy. For this repo, SQL is not tracked by a migration table, so automatic reruns are easy to get wrong.

When a deliberate schema update is needed, run it manually:

```bash
cd /opt/freestyle
docker compose -f docker-compose.production.yml --env-file .env.production run --rm app npx tsx src/migrate.ts
```

## 8. Useful operations

Restart:

```bash
docker compose -f docker-compose.production.yml --env-file .env.production restart app
```

Tail logs:

```bash
docker compose -f docker-compose.production.yml --env-file .env.production logs -f app
docker compose -f docker-compose.production.yml --env-file .env.production logs -f db
```

Rebuild after a code change:

```bash
docker compose -f docker-compose.production.yml --env-file .env.production build app
docker compose -f docker-compose.production.yml --env-file .env.production up -d app
```
