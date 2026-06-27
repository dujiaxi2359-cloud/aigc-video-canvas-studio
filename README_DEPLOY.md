# MoonTv Versioned Deployment

This workflow prepares an auditable deployment without storing credentials or generated media in Git.

## Version Sources

- `GET /api/version` reports the running server path, branch, commit, build time, environment, and port.
- `/version.json` is emitted by the Vite production build.
- The browser console prints the frontend commit, branch, and build time.
- `.build-version.json` is generated during deployment and ignored by Git.

## Prerequisites

1. Keep the deployment worktree clean.
2. Configure production secrets in `.env` or `server/.env`; never commit either file.
3. Confirm the PM2 process and Nginx root already point at this repository.
4. Back up the database and uploads before first deployment to a new host.

## Staging Deployment

```bash
APP_DIR=/www/wwwroot/aigcnong-unified-staging \
PM2_PROCESS=aigcnong-video-api-staging \
API_BASE_URL=http://127.0.0.1:4003 \
WEB_BASE_URL=https://staging.example.com \
bash scripts/deploy-cloud.sh <commit-or-branch>
```

The script fetches Git metadata, checks out the requested branch or commit, installs dependencies, runs typechecks, builds server and client, writes version metadata, restarts only the named PM2 process, validates Nginx, and checks both version endpoints.

It does not overwrite `.env`, delete databases, delete uploads, modify COS objects, reload Nginx, or deploy files outside `APP_DIR`.

## Version Check

```bash
API_BASE_URL=http://127.0.0.1:4002 \
WEB_BASE_URL=https://imagephotos.asia \
bash scripts/check-version.sh
```

The commit returned by `/api/version` and `/version.json` must match the intended deployment commit.

## Rollback

Run the same deploy command with the previously verified commit:

```bash
bash scripts/deploy-cloud.sh <previous-commit>
```

Do not use `reset --hard`, force-push, or direct edits in the cloud worktree.
