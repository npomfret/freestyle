# Operations Rules

Applies to deploy, Docker, SSH, environment files, and production-adjacent work.

- Production target is `fsd.snowmonkey.co.uk`; deployment is via `npm run deploy` and Docker Compose files in this repo.
- `.env` and `.env.production` may contain secrets. Read only what is necessary and never print secret values in summaries.
- Run deploys, production Docker Compose commands and SSH commands when the task calls for them; state it in your report.
- For local DB-backed development, assume the SSH tunnel from `npm run db:tunnel` is required unless the task explicitly says to use local Docker Postgres.
