# calver-action

> **Unofficial project.** This GitHub Action is not affiliated with, endorsed by, or maintained by the CalVer project, calver.org, its maintainers, GitHub, crates.io, or npm.

A small format-driven GitHub Action that allocates Calendar Versioning release identifiers from the workflow runtime date and existing immutable Git tags.

CalVer itself is a calendar-based software versioning convention with multiple valid schemes rather than one mandatory format. See https://calver.org/overview.html and https://calver.org/about.html.

This repository also provides opinionated reusable workflows for publishing Rust crates and npm packages with CalVer.

## Core action

```yaml
- uses: f4ah6o/calver-action@<commit-sha>
  id: calver
  with:
    format: YYYY.MM.PATCH
    timezone: Asia/Tokyo

- run: echo "release ${{ steps.calver.outputs.version }}"
```

For a run on August 11, 2026, the default format allocates `2026.8.0` when no matching tag exists, then `2026.8.1`, `2026.8.2`, and so on.

## Reusable release workflows

### Rust / crates.io

A caller can stay very small:

```yaml
name: Release

on:
  push:
    tags:
      - latest

jobs:
  release:
    permissions:
      contents: write
      id-token: write
    uses: f4ah6o/calver-action/.github/workflows/rust-crate.yaml@<commit-sha>
    with:
      format: YYYY.MM.PATCH
      timezone: Asia/Tokyo
      legacy_prefixes: v
      provenance_file: src/release-commit.txt
```

The reusable workflow:

1. checks that the selected source commit belongs to `source_branch` (default `main`), but does **not** require it to be branch HEAD;
2. allocates the next CalVer;
3. optionally writes the selected source commit's 7-character SHA to `provenance_file`;
4. updates `Cargo.toml` / `Cargo.lock` in a release-only commit;
5. runs fmt, clippy, tests, and `cargo package`;
6. publishes through crates.io OIDC using `rust-lang/crates-io-auth-action`;
7. creates an immutable CalVer tag pointing at the release-only commit.

The release-only commit is not merged back into the development branch, so normal development may remain ahead of the selected release source.

### npm

```yaml
name: Release

on:
  push:
    tags:
      - latest

jobs:
  release:
    permissions:
      contents: write
      id-token: write
    uses: f4ah6o/calver-action/.github/workflows/npm.yaml@<commit-sha>
    with:
      format: YYYY.MM.PATCH
      timezone: Asia/Tokyo
      provenance_file: src/release-commit.txt
      access: public
```

The npm workflow follows the same release-only-commit model. It updates `package.json` and lock metadata with `npm version --no-git-tag-version`, runs `npm ci`, optional build/tests, `npm pack --dry-run`, publishes with npm Trusted Publishing (OIDC), and creates the immutable CalVer tag.

For npm Trusted Publishing, configure the npm package's trusted publisher for the **calling workflow filename** in the package repository. npm's reusable-workflow validation uses the caller workflow identity. The caller must grant `id-token: write` as shown above.

### Registry publishing policy

Repository visibility and registry publishing are separate concerns. Both reusable workflows accept:

```yaml
with:
  registry_publish: false
```

When `registry_publish: false`, the workflow still allocates CalVer, embeds provenance, updates package metadata, validates/packages the project, creates the release-only commit, and pushes the immutable CalVer tag. It skips only crates.io/npm authentication and registry publication.

| Repository | `registry_publish` | Result |
| --- | --- | --- |
| private | `true` | Publish to the configured public registry, subject to registry/auth rules |
| private | `false` | Internal CalVer + provenance + immutable Git tag only |
| public | `true` | Normal registry release |
| public | `false` | Public source repo, but no registry publication; Git version/tag release only |

This makes `registry_publish: false` useful for company-internal tools that want consistent versions and source provenance without distributing artifacts through crates.io or npm. For Rust, `publish = false` in `Cargo.toml` is also a useful defense-in-depth setting for projects that must never be uploaded to a registry.

A private GitHub repository can call these reusable workflows because `calver-action` itself is public. For npm Trusted Publishing, publishing from a private GitHub repository is supported, but npm provenance attestations are not generated for private repositories.

### Embedded source provenance

Package versions stay pure CalVer:

```text
2026.8.1
```

Source identity is separate. When `provenance_file` is set, the reusable workflow writes the release source SHA into the published package before packaging:

```text
a1b2c3d
```

A CLI can then expose it without changing registry version semantics. For example, a Rust program can package `src/release-commit.txt` and render:

```text
mycli 2026.8.1 (a1b2c3d)
```

The file path is repository-relative and must be included in the package published by the project.

## Formats

Supported CalVer calendar tokens follow the terminology documented by calver.org:

| Token | Meaning | Example on 2026-08-11 |
| --- | --- | --- |
| `YYYY` | full year | `2026` |
| `YY` | short year relative to 2000 | `26` |
| `0Y` | zero-padded short year relative to 2000 | `26` |
| `MM` | month | `8` |
| `0M` | zero-padded month | `08` |
| `WW` | week since start of year | `32` |
| `0W` | zero-padded week since start of year | `32` |
| `DD` | day of month | `11` |
| `0D` | zero-padded day of month | `11` |
| `PATCH` | **action extension:** zero-based collision counter for the rendered calendar bucket | `0` |

Examples:

```text
YYYY.MM.PATCH   -> 2026.8.0
YY.0M.PATCH     -> 26.08.0
YYYY.0M.0D      -> 2026.08.11
YYYY-0M-0D      -> 2026-08-11
YYYY.WW.PATCH   -> 2026.32.0
```

`PATCH` is not a CalVer calendar token from calver.org; this action adds it as an automatic monotonically increasing counter within the selected rendered calendar bucket. If a format omits `PATCH`, a second release that would produce an existing tag fails with a collision error instead of silently changing the format.

Week formats cannot be combined with month/day tokens. Week numbers are 1-based seven-day buckets counted from January 1, matching the CalVer notion of weeks since the start of the year.

Uppercase identifiers that are not supported tokens are rejected so format typos fail early. Separators and lowercase literal text are preserved.

## PATCH allocation

For `format: YYYY.MM.PATCH` during August 2026:

- no `2026.8.*` tags -> `2026.8.0`
- `2026.8.0` exists -> `2026.8.1`
- `2026.8.0` and `2026.8.4` exist -> `2026.8.5`
- July tags do not affect the August sequence

For `format: YYYY.WW.PATCH`, the counter is scoped to the rendered year/week instead.

## Release trigger patterns

The core action and reusable workflows do **not** require a particular release trigger.

A movable tag such as `latest` is one useful pattern:

```bash
git tag -f latest <commit-to-release>
git push -f origin latest
```

The selected release commit may be behind current `main`; reusable workflows only require it to be in the configured branch history.

Other triggers such as `workflow_dispatch`, GitHub Releases, or branch workflows can invoke the same reusable workflows later without changing CalVer allocation. Trigger expansion is intentionally not built into the action itself.

## Runtime date

The workflow runtime date is used by default, not the authored or committed timestamp of the target commit.

```yaml
with:
  timezone: Asia/Tokyo
```

For deterministic tests or replay:

```yaml
with:
  date: 2026-08-11
  fetch_tags: false
```

## Creating tags directly

By default the core action only allocates a version and returns outputs.

```yaml
with:
  create_tag: true
```

With `create_tag: true`, the action creates and pushes the immutable tag to `target` (`GITHUB_SHA`, then `HEAD`, by default). Concurrent releases that race for the same `PATCH` refresh remote tags and retry allocation.

## Prefix migration

New tags are prefixless by default. To create `v2026.8.0`:

```yaml
with:
  prefix: v
```

To migrate from old `v...` tags to prefixless tags without resetting a `PATCH` sequence:

```yaml
with:
  legacy_prefixes: v
```

For example, with `format: YYYY.MM.PATCH`, if `v2026.8.3` exists, the next prefixless tag is `2026.8.4`.

## Core action inputs

| Input | Default | Description |
| --- | --- | --- |
| `format` | `YYYY.MM.PATCH` | CalVer format |
| `timezone` | `UTC` | IANA timezone used to resolve the runtime calendar date |
| `prefix` | empty | Prefix for newly allocated immutable tags |
| `legacy_prefixes` | empty | Comma-separated old prefixes considered during allocation |
| `date` | empty | Optional `YYYY-MM-DD` runtime-date override |
| `fetch_tags` | `true` | Refresh tags from `origin` before allocation |
| `create_tag` | `false` | Create and push the allocated immutable tag |
| `target` | `GITHUB_SHA` / `HEAD` | Git object to tag |
| `retries` | `5` | Tag-allocation attempts for concurrent PATCH races |

## Core action outputs

| Output | Example |
| --- | --- |
| `version` | `2026.8.0` |
| `tag` | `2026.8.0` |
| `year` | `2026` |
| `month` | `8` |
| `week` | `32` |
| `day` | `11` |
| `patch` | `0`, or empty when the format has no `PATCH` |

Reusable Rust/npm workflows additionally expose `source_sha` and `short_sha`.

## Development

The core action uses only the Node.js standard library at runtime.

```bash
npm test
npm run check
```

All workflow files use the `.yaml` extension.

## Scope

The core action determines version identifiers. The reusable workflows provide opinionated package release orchestration for crates.io and npm. Neither defines compatibility semantics for your software.

## License and third-party notices

This repository is licensed under the MIT License. See `LICENSE`.

Third-party references, workflow dependencies, attribution, and the explicit unofficial-project notice are documented in `THIRD_PARTY_NOTICES.md`.
