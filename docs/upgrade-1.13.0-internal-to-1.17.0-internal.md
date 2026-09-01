# Upgrade 1.13.0-internal to 1.17.0-internal

This upgrade keeps the existing PostgreSQL, Redis, Weaviate, S3/MinIO, plugin-daemon, API storage, sandbox, and Nginx bind mounts. Do not change `SECRET_KEY`, database credentials, plugin keys, S3 credentials, or the existing `/data/volumes/ai/dify/**` paths during the upgrade.

## Release audit

| Release | Required action |
| --- | --- |
| 1.13.1 | Run 3 database migrations. `REDIS_MAX_CONNECTIONS` is now configurable. |
| 1.13.2 | No new database or Compose migration. Contains prompt/plugin and Weaviate fixes. |
| 1.13.3 | Update the persisted sandbox config to `python_path: /opt/python/bin/python3` and `nodejs_path: /usr/local/bin/node`. |
| 1.14.0 | Run 2 database migrations. PostgreSQL defaults to 200 connections. Compose adds API/worker/beat health checks. |
| 1.14.1 | Run the Explore-category migration. Upstream split environment files under `docker/envs/**`; the internal Compose keeps its explicit environment anchor instead. Preserve the existing `SECRET_KEY`. |
| 1.14.2 | No new database migration. Plugin daemon becomes 0.6.1; the final 1.17 stack uses 0.6.10-local. |
| 1.15.0 | Run 24 database migrations, including Agent, OAuth, credential visibility, plugin auto-upgrade categories, and human-input uploads. |
| 1.16.0 | Run 5 release-to-release migrations (the release notes count differs because they compare another base). Add `agent_backend` and `local_sandbox`, and set a production `DIFY_AGENT_SERVER_SECRET_KEY`. |
| 1.16.1 | Run 4 additive migrations. Add the dedicated Agent SSRF proxy and isolated networks. Set `DIFY_AGENT_API_TOKEN` and `DIFY_AGENT_LOCAL_SANDBOX_AUTH_TOKEN`. |
| 1.17.0 | Run 10 migrations. Rename `EDITION` to `DEPLOYMENT_EDITION`. The conversation cleanup index can take longer on a large `conversations` table. E2B is optional; the internal Compose uses the local Agent sandbox. |

The API image contains the full Alembic chain, so it must be upgraded directly from the existing database rather than applying separate images for every intermediate version.

## Before deployment

1. Keep the old stack running and create a PostgreSQL dump:

   ```bash
   mkdir -p /data/backups/dify/1.13.0-internal
   docker exec dify-db pg_dump -U postgres -Fc dify > /data/backups/dify/1.13.0-internal/dify.dump
   docker exec dify-db pg_dump -U postgres -Fc dify_plugin > /data/backups/dify/1.13.0-internal/dify_plugin.dump
   ```

2. Record the deployed images and container configuration:

   ```bash
   docker compose -f docker-compose.internal.yaml images > /data/backups/dify/1.13.0-internal/images.txt
   docker compose -f docker-compose.internal.yaml config > /data/backups/dify/1.13.0-internal/compose.resolved.yaml
   ```

3. Stop only this stack, then archive its persistent files while they are quiescent:

   ```bash
   docker compose -f docker-compose.internal.yaml down
   tar -C /data/volumes/ai -czf /data/backups/dify/1.13.0-internal/volumes.tgz dify
   ```

4. Update `/data/volumes/ai/dify/sandbox/conf/config.yaml` on the host:

   ```yaml
   python_path: /opt/python/bin/python3
   nodejs_path: /usr/local/bin/node
   ```

5. Keep all existing secrets and add three independent generated values:

   ```bash
   openssl rand -base64 42  # DIFY_AGENT_SERVER_SECRET_KEY
   openssl rand -base64 42  # DIFY_AGENT_API_TOKEN
   openssl rand -base64 42  # DIFY_AGENT_LOCAL_SANDBOX_AUTH_TOKEN
   ```

   Set `DIFY_VERSION=1.17.0-internal`, `DIFY_PLUGIN_DAEMON_VERSION=0.6.10-local`, and `DEPLOYMENT_EDITION=COMMUNITY`. Remove an old `EDITION` variable if present.

## Validate and upgrade

Run from the repository's `docker` directory so the Agent proxy templates resolve correctly:

```bash
docker compose -f docker-compose.internal.yaml config --quiet
docker compose -f docker-compose.internal.yaml pull
docker compose -f docker-compose.internal.yaml up -d
docker compose -f docker-compose.internal.yaml ps
docker compose -f docker-compose.internal.yaml logs --tail=200 dify-api dify-worker dify-plugin-daemon
```

`MIGRATION_ENABLED=true` makes the API apply the database migrations under a Redis migration lock. Wait for it to finish before testing the UI. Verify:

- existing accounts and workspaces open;
- existing model credentials can invoke a model;
- installed plugins appear and one plugin call succeeds;
- an existing knowledge base can retrieve a document;
- an existing workflow can run;
- a new workspace can be created and switched to;
- an empty, non-current owned workspace can be archived;
- Agent local sandbox health is green.

## Rollback

Do not run Alembic downgrade against production data. If verification fails, stop the upgraded stack, restore both PostgreSQL dumps and `/data/backups/dify/1.13.0-internal/volumes.tgz`, set `DIFY_VERSION=1.13.0-internal`, and start the previous Compose definition. Restoring both the database and persistent files keeps plugin packages, uploads, vectors, and model credentials consistent with the old application version.
