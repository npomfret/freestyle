# Operations Rules

Applies to deploy, Docker, SSH, environment files, and production-adjacent work.

- Production target is `fsd.snowmonkey.co.uk`; deployment is via `npm run deploy` and Docker Compose files in this repo.
- `.env` and `.env.production` may contain secrets. Read only what is necessary and never print secret values in summaries.
- Do not run deploys, production Docker Compose commands, or SSH commands without explicit user approval for the current task.
- For local DB-backed development, assume the SSH tunnel from `npm run db:tunnel` is required unless the task explicitly says to use local Docker Postgres.
