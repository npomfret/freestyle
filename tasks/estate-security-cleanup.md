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

- [ ] Verify and independently review the dependency lock update, then publish
  and deploy through `npm run deploy`; verify app health and a fresh image scan.
- [ ] Prepare and verify a patched, pinned PG17 pgvector image and a deliberate
  database maintenance path. The normal app deploy must keep the DB untouched.

The deployment source is the server's committed Git checkout, updated by
`git pull --ff-only`; laptop untracked files never reach it. Match the estate's
tracked-source preflight so the owner's untracked `add-email-alerting` and
`own-nginx-config-behind-snowmonkey-edge` tasks can remain untouched. Tracked
edits, branch mismatch and unpublished commits must still block deployment.
This is a deliberate departure from the old all-untracked-files dirty check,
which blocked an otherwise reproducible committed release.

Verification: `npm run compile`, all 93 existing backend tests with one test
worker, shell syntax and substantive shellcheck checks pass. Independent
delegated review found no substantive issues. Live acceptance is pending.
The first managed deployment stopped during image build, before replacing any
service: ONNX's optional CUDA 1.21.0 archive now returns HTTP 404. Its bundled
installer and README support `--onnxruntime-node-install-cuda=skip`; specify it
on the existing npm ci build step for this CPU-only host. Other dependency
lifecycle scripts remain enabled. Rebuild/acceptance are pending.
No database writes, migration,
paid provider jobs, volume deletion or new risk acceptance is requested.
