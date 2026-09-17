# Operations

How to run, secure, back up and upgrade a self-hosted install. Audience: the person running it,
which is also the person using it.

## 1. What the deployment actually is

One Node process, running on **Windows**, started with `pnpm start`. It serves the JSON API under
`/api` and the built web client at `/`. Its state is one SQLite file. There is no external service,
no message broker, no separate web server required.

The app also runs unchanged on Linux and in a container, and CI builds and tests all three, but
Windows is the target that matters here.

```
  browser / phone
        │  HTTPS
        ▼
  ┌──────────────────────────┐
  │ node apps/api/dist/main  │  :4000
  │  ├─ /api/*   JSON API    │
  │  └─ /*       web client  │ ── reads ──▶ content/dist/bundle.json  (rebuilt from the repo)
  └──────────┬───────────────┘
             │ reads/writes
             ▼
        data/itmc.db          ◀── the only irreplaceable file
```

## 2. First install

```bash
git clone <your remote> itmc && cd itmc
pnpm install
cp .env.example .env

# Generate a real token and put it in .env as AUTH_TOKEN
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

pnpm build                     # packages, content bundle, API, web client
pnpm db:migrate                # creates data/itmc.db and seeds the token
pnpm start                     # serves API + UI on :4000
```

Open `http://localhost:4000`, paste the token when asked. It is stored in the browser and you will
not be asked again on that device.

## 3. Running it as a service

### Windows — the primary deployment target

This app is run on Windows with `pnpm start`. Everything below assumes that.

A scheduled task that starts at logon is the simplest way to keep it running:

```powershell
# Runs at logon, restarts up to 3 times on failure
$action  = New-ScheduledTaskAction -Execute "node.exe" `
           -Argument "apps\api\dist\main.js" -WorkingDirectory "C:\itmc"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "ITMgrCurriculum" -Action $action -Trigger $trigger -Settings $settings
```

That only runs while you are logged in. For something that starts at boot and survives logoff, wrap
it as a real service with [NSSM](https://nssm.cc/):

```powershell
nssm install ITMgrCurriculum "C:\Program Files\nodejs\node.exe" "apps\api\dist\main.js"
nssm set ITMgrCurriculum AppDirectory "C:\itmc"
nssm set ITMgrCurriculum AppStdout "C:\itmc\logs\itmc.log"
nssm set ITMgrCurriculum AppStderr "C:\itmc\logs\itmc.log"
nssm start ITMgrCurriculum
```

**On stopping it.** Windows does not deliver POSIX signals, so the graceful shutdown handler in
`apps/api/src/main.ts` does not run when the process is killed on Windows. It is only exercised in
the container. This is safe rather than merely tolerable: SQLite in WAL mode is crash-safe by
design, so an abrupt stop cannot corrupt the database. The worst case is that the last write in
flight is rolled back. Take a backup before upgrades anyway.

**Upgrading.** Stop the task or service, `git pull`, `pnpm install`, `pnpm build`, `pnpm db:migrate`,
start it again. Section 6 has the detail.

### Linux / NAS (systemd)

Not the primary path here, but the app runs unchanged on Linux.

```ini
# /etc/systemd/system/itmc.service
[Unit]
Description=IT Manager Curriculum
After=network.target

[Service]
Type=simple
User=itmc
WorkingDirectory=/opt/itmc
EnvironmentFile=/opt/itmc/.env
ExecStartPre=/usr/bin/node packages/db/dist/migrate.js
ExecStart=/usr/bin/node apps/api/dist/main.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/itmc/data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now itmc
journalctl -u itmc -f
```

### Docker

`Dockerfile` and `docker-compose.yml` are in the repo root. Both are tested: the image builds, the
container passes the full end-to-end suite, data survives restarts, and SIGTERM shuts it down
cleanly.

**Set a real `AUTH_TOKEN` in `.env` first.** Compose reads `.env` from the project directory
automatically, so whatever is in there is what the container uses. With the placeholder value the
container deliberately refuses to start and logs why.

```bash
node scripts/new-token.mjs "docker"   # or generate one and put it in .env
docker compose build                  # ~2 min cold, 510 MB image
docker compose up -d                  # http://localhost:4000
docker compose logs -f
docker compose down                   # -v also deletes the data volume
```

On Windows 11 Home this needs the WSL2 backend. If `docker version` shows a client but no server,
run this once from an **elevated** PowerShell and then reboot:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\enable-docker-prereqs.ps1
```

The database lives in the `itmc-data` named volume. Back that up, not the container.

## 4. Security

This app holds no customer data, but it is on your network and it holds your notes.

| Control | Status |
| --- | --- |
| Authentication | Bearer token on every `/api` route except `/api/health`. Tokens stored as SHA-256 hashes. |
| Default credentials | The API refuses to start with `NODE_ENV=production` and a missing or default `AUTH_TOKEN`. |
| Transport | **Not provided.** Run behind a reverse proxy with TLS if it leaves localhost. |
| Per-device tokens | `node scripts/new-token.mjs "phone"` issues one; `node scripts/revoke-token.mjs "phone"` revokes it. |
| Secrets in the repo | `.env` is gitignored. Only `.env.example` is committed. |

If you expose this beyond localhost, put Caddy or nginx in front for TLS. Minimal Caddy config:

```
itmc.example.com {
    reverse_proxy localhost:4000
}
```

Do not expose it to the public internet without TLS. The bearer token would cross the network in
clear text.

## 5. Backup and restore

`data/itmc.db` is the only file you cannot rebuild. Everything else comes from the repo.

```bash
node scripts/backup.mjs              # writes backups/itmc-<timestamp>.db, keeps the last 30
```

It uses `VACUUM INTO`, so it is consistent even while the API is running. Copying the `.db` file
directly while the service is up is **not** safe, because of the write-ahead log.

Schedule it:

```bash
# Linux: daily at 02:00
0 2 * * * cd /opt/itmc && /usr/bin/node scripts/backup.mjs >> /var/log/itmc-backup.log 2>&1
```

```powershell
# Windows: daily at 02:00
$a = New-ScheduledTaskAction -Execute "node.exe" -Argument "scripts\backup.mjs" `
     -WorkingDirectory "C:\itmc"
Register-ScheduledTask -TaskName "ITMgrCurriculumBackup" -Action $a `
     -Trigger (New-ScheduledTaskTrigger -Daily -At 2am)
```

Restore: stop the service, replace `data/itmc.db` with a backup file, delete any stale
`itmc.db-wal` and `itmc.db-shm` alongside it, start the service.

## 6. Upgrading and adding content

Content is part of the repo, so adding lessons is a normal deploy.

```bash
git pull
pnpm install
pnpm content:validate          # fails loudly on a bad lesson; nothing is published
pnpm build
pnpm db:migrate                # no-op unless the schema changed
# restart the service
```

Progress survives content changes: the database references lessons and sections by stable ID, and
completion is recomputed against the current content. A deleted section stops counting rather than
corrupting the row.

## 7. Monitoring it

`GET /api/health` is public and returns `{ ok, contentVersion, uptime }`. Anything that can curl a
URL can watch it. There is no metrics endpoint; for a single-user app, the health check and the
service manager's restart policy are the whole monitoring story.

Logs go to stdout as JSON lines (Fastify/pino). `journalctl -u itmc`, `docker compose logs`, or
redirect to a file on Windows.

## 8. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| API exits immediately with a token error | `NODE_ENV=production` with `AUTH_TOKEN` unset or `change-me`. Set a real one. |
| `401` on every request | Token in the browser does not match any row. Re-enter it on the settings page, or issue a new one. |
| Web UI loads but every panel errors | API is not running, or `WEB_DIST` is served by something that is not proxying `/api`. |
| `content/dist/bundle.json` not found | `pnpm content:build` has not run since checkout. |
| Lesson shows "not written yet" | That level is still a stub. Check `status` in the lesson's frontmatter. |
| Progress looks lower after an upgrade | Expected when sections were removed from a lesson. Completion is derived, not stored. |
| Database locked | Two processes opened the same file. Only one API instance may run per database. |
