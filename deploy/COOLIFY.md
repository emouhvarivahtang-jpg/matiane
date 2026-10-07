# Matiane on Coolify

The VPS uses Coolify 4.4.1. The dashboard and API are at
https://coolify.57.129.177.67.sslip.io. The application stays at
http://57.129.177.67 so browser-local photobooks retain the same origin.

## Deployment

`Dockerfile` installs the frozen npm lockfile, runs unit tests and builds the
static app. Its Nginx container publishes a release to the existing host Nginx
directory through `/var/www/matiane:/var/www/matiane`. Runtime settings:

- `MATIANE_PUBLICATION_ROOT=/var/www/matiane`
- `MATIANE_CHECK_HOST=57.129.177.67`
- `MATIANE_CHECK_URL=http://57.129.177.67`
- Coolify directory storage: host `/var/www/matiane`, mount `/var/www/matiane`.
- Internal port 80, HTTP health check, no mapped public port or generated domain.

Coolify supplies the actual Git revision in `SOURCE_COMMIT`. Publication uses a
lock and an atomic symlink replacement. HTTP checks compare the served HTML,
JavaScript, metadata and Georgian font to the release files. Failed checks restore the
previous release. Older JavaScript chunks remain available to open editor tabs.
Releases remain on disk; their retention needs periodic review as the site grows.
`/deploy-info.json` identifies the published revision and UTC publication time.

Host Nginx already owns ports 80 and 443, including the Coolify HTTPS gateway.
Leave Coolify's default Traefik proxy stopped. Do not run the older
`matiane-update.timer` alongside this publisher. That optional standalone
systemd installer remains available for installations without Coolify.

## Automatic GitHub updates

`deploy/github-poller.Dockerfile` runs a separate trusted infrastructure
application. It checks registered public GitHub branches every 60 seconds over
HTTPS, then asks the local Coolify queue to deploy a new revision. GitHub webhook
administration and an API credential inside the worker are unnecessary.

The worker uses a Coolify host-file storage for `/var/run/docker.sock`, mounted
at the same path, and a persistent named volume at `/state`. Set custom Docker
options to `--cap-drop ALL`. Register mounts with the **Storages** API rather than
custom Docker options: Coolify 4.4.1 ignores `--volume` and `--add-host` there.
The socket grants server administration
rights; only trusted maintenance code should receive it. It has no public
listener. Its own source revision is pinned and is updated deliberately.

Runtime `GITHUB_DEPLOY_PROJECTS` is a literal JSON array:

```json
[{"application_uuid":"COOLIFY_APPLICATION_UUID","project_uuid":"COOLIFY_PROJECT_UUID","repository":"https://github.com/OWNER/REPOSITORY.git","branch":"main"}]
```

Each registration is checked against Coolify's application, project, repository
and branch before queueing. Current or pending revisions are skipped. Failed
revisions wait 15 minutes before retrying. Turn off **Auto Deploy** in the target
application to pause updates. Worker logs record the commit and queue status.

For another project, create and verify its application in Coolify through the
HTTPS API, then append its registration and redeploy the worker. Backend
applications and databases use their own containers and storage. The static
Matiane publication mount is specific to Matiane. Private repositories need
their own authorized source and deployment trigger.

Codex obtains `COOLIFY_URL` and the securely bound `COOLIFY_API_TOKEN` from its
cloud environment. The token has Read, Write and Deploy rights. Inspect existing
resources before changes and keep credentials out of repositories and logs.
Git push access does not grant permission to administer GitHub webhooks.

## Validation

```sh
python3 deploy/test_github_poller.py
docker build -t matiane:coolify-test .
python3 deploy/test_coolify_publication.py
```

The publication test uses isolated real Nginx containers and checks successful
publication, old chunks, HTTP errors, mismatched responses, rollback and repeat
publication. The live deployment is also checked with the browser tests and an
actual GitHub commit picked up by the worker.
