# Releasing

Releases are fully automated and tag-driven: pushing a `v*` tag runs
`.github/workflows/release.yml`, which gates on the full quality suite and
publishes to npm via OIDC trusted publishing — no npm token ever lives in
GitHub.

## One-time setup: npm trusted publisher

Publishing uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
(OIDC) — the workflow proves to npm which repository/workflow it runs in, so
no `NPM_TOKEN` secret is configured or needed:

1. Sign in at [npmjs.com](https://www.npmjs.com) as a maintainer of
   `sameday-node-sdk`.
2. Open the package → **Settings → Trusted Publishers**.
3. Add a **GitHub Actions** trusted publisher:
   - **Repository owner**: `bucel-sebastian`
   - **Repository name**: `sameday-node-sdk`
   - **Workflow filename**: `release.yml`
4. Save. The workflow's `npm publish --provenance` now authenticates via the
   short-lived OIDC token (the workflow has `id-token: write` for this).

The setup is also mirrored in the comment at the top of
`.github/workflows/release.yml`.

## Cutting a release

```bash
npm version patch    # or: minor / major — bumps package.json, commits, tags vX.Y.Z
git push --follow-tags
```

The tag **must** match `package.json` (`v0.1.0` ↔ `0.1.0`) — the workflow
verifies this and fails with an explicit error otherwise. To retag after a
mistake: fix the version, delete the remote tag, push again.

## What the workflow does

On every `v*` tag push (`.github/workflows/release.yml`):

1. Checkout + Node.js 22 + `npm ci`.
2. **Quality gates** — `npm run lint`, `npm run typecheck`, `npm test`.
3. `npm run build` — dual ESM + CJS output with declarations (the
   `prepublishOnly` hook rebuilds before publishing as well; only `dist/`
   is shipped).
4. **Tag/version check** — `GITHUB_REF_NAME` without the `v` must equal
   `package.json`'s `version`.
5. `npm publish --provenance --access public` — authenticated via the OIDC
   trusted-publisher contract.
6. `gh release create "$TAG" --generate-notes` — GitHub Release with
   auto-generated notes.

## Provenance

`--provenance` makes npm attach a signed provenance attestation linking the
published artifact to this repository, the exact commit and the workflow
run. Consumers can verify it with:

```bash
npm view sameday-node-sdk provenance
```

## Release checklist

- [ ] `npm test`, `npm run lint`, `npm run typecheck` green locally.
- [ ] Changelog / commits merged to `master`.
- [ ] `npm version patch|minor|major`.
- [ ] `git push --follow-tags`.
- [ ] Release workflow green; package visible on npm with provenance.
