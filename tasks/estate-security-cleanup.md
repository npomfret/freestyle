# Staging image security cleanup

The estate's 24 November image scan reports three fixable critical dependency
findings in `freestyle-app` and sixteen in `freestyle-db`. The owner requested
remediation after receiving repeated estate alert emails.

Inventory: protobufjs 7.5.4, tar 7.5.13 and proxy-addr 2.0.7 in the app; Debian
Perl, OpenSSL and GnuTLS packages in the PostgreSQL 17 pgvector image. npm's
targeted lock update resolves the existing compatible ranges to protobufjs
7.6.6, tar 7.5.23 and proxy-addr 2.0.8 without adding overrides or dependencies.
Retain the database major, extension compatibility, persistent volume and old
image reference; take verified recovery material before database replacement.

- [x] Verify and independently review the dependency lock update, then publish
  and deploy through `npm run deploy`; verify app health.
  The CPU-only rebuild deployed successfully at `6ab1a14`; health passed and
  the database container was unchanged. A fresh scan remains pending.
- [x] Prepare and verify a patched, pinned PG17 pgvector image and a deliberate
  database maintenance path. The normal app deploy must keep the DB untouched.
  Reuse the existing deliberate `deploy:db` command after a verified recovery
  dump. `Dockerfile.database` keeps pgvector 0.8.2 and PG17 and refreshes signed
  Debian packages; its versioned image is separate from the app. Build and
  inspect the candidate before replacement; preserve the old image and volume.
  Run the database entrypoint as its existing unprivileged postgres user and
  remove unused gosu, whose old embedded Go runtime would otherwise lose the
  existing upstream-image acceptance when this custom image is named. Verify
  both initialization and existing-data startup rather than adding acceptance.
  Candidate `sha256:4b8cac90fbf433f59b34bceb5d3b7948b32505f46492e95e1a714c59e89b6835`
  built on staging. The native 32,774,141-byte maintenance dump is verified at
  `/var/backups/freestyle-maintenance/20261124T162456Z/freestyle.dump`.
  The canonical estate checker fully restored it into isolated scratch storage:
  16 application tables/views, vector 0.8.2 and pg_trgm 1.6. Deliberately expecting
  vector 0.0.0 was rejected; both scratch containers/volumes were removed.
  Independent database review found no substantive issues in this image diff.
  The database replacement is healthy at `98f05d1`: PostgreSQL 17.12, unchanged
  extensions and `freestyle_freestyle_pgdata`, with 14,279 resources retained.
  The server has no npm binary, so its existing target's exact Docker Compose
  command was invoked with health wait from the verified managed checkout.
- [x] Verify the final fresh staging scan clears both Freestyle image alerts.
  The 24 November 17:10:52 UTC scan checked all 23 staging images with zero
  failures and zero unaccepted fixable criticals. Both Freestyle images report
  zero fixable criticals; existing unfixable/high findings remain visible.

The deployment source is the server's committed Git checkout, updated by
`git pull --ff-only`; laptop untracked files never reach it. Match the estate's
tracked-source preflight so the owner's untracked `add-email-alerting` and
`own-nginx-config-behind-snowmonkey-edge` tasks can remain untouched. Tracked
edits, branch mismatch and unpublished commits must still block deployment.
This is a deliberate departure from the old all-untracked-files dirty check,
which blocked an otherwise reproducible committed release.

Verification: `npm run compile`, all 93 existing backend tests with one test
worker, shell syntax and substantive shellcheck checks pass. Independent
delegated review found no substantive issues. Live acceptance and the final
fresh image scan pass.
The first managed deployment stopped during image build, before replacing any
service: ONNX's optional CUDA 1.21.0 archive now returns HTTP 404. Its bundled
installer and README support `--onnxruntime-node-install-cuda=skip`; specify it
on the existing npm ci build step for this CPU-only host. Other dependency
lifecycle scripts remain enabled. The CPU-only rebuild and deployment passed.
No live SQL mutations, schema migrations, paid provider jobs, data-volume
deletion or new risk acceptance occurred.
