---
name: calver-release
description: Add or maintain CalVer release automation for Rust crates, Go modules, and npm packages using f4ah6o/calver-action, including cargo-dist handoff. Use when configuring calendar releases, movable release tags such as latest, registry publish/no-publish policy, Go-module-compatible CalVer mapping, legacy tag prefixes, embedded Git SHA provenance, or cargo-dist GitHub Release artifacts.
license: MIT
---

# CalVer Release

Use this skill when a repository needs calendar-based release automation backed by `f4ah6o/calver-action`.

## Core policy

Keep these concepts separate:

- **CalVer package/display version**: the calendar-derived release identifier.
- **Ecosystem version**: a registry or module-compatible version when an ecosystem imposes extra rules.
- **Source provenance**: release source commit SHA, embedded separately when useful for CLI `-V` output.
- **Git tag**: immutable release tag.
- **Release trigger**: commonly a movable `latest` tag, but the reusable workflows do not require a particular trigger.
- **Registry publication**: independent from GitHub repository visibility.

Do not encode a Git SHA into the package version merely to expose provenance. Prefer a version plus separate source provenance.

## Detect the package type

- `Cargo.toml` -> use `.github/workflows/rust-crate.yaml`.
- `go.mod` -> use `.github/workflows/go.yaml`.
- `package.json` -> use `.github/workflows/npm.yaml`.

If more than one exists, identify which package/module is being released and set `working_directory` accordingly.

## Default CalVer

For Rust and npm prefer:

```yaml
format: YYYY.MM.PATCH
timezone: Asia/Tokyo
```

For Go, do **not** use the calendar year as the semantic major version. Prefer the Go workflow default:

```yaml
format: 1.YYYY0M.PATCH
timezone: Asia/Tokyo
```

It maps August 2026 to Go module version `v1.202608.0` while separately exposing human-facing CalVer `2026.8.0`. This keeps the semantic major stable across calendar years and avoids forcing `/vYYYY` into the Go module path.

Use another supported format only when the project already has a compatible convention. Supported calendar tokens are `YYYY`, `YY`, `0Y`, `MM`, `0M`, `WW`, `0W`, `DD`, and `0D`. `PATCH` is an extension provided by this action for collision sequencing.

## Legacy tag migration

For Rust/npm, the action can absorb the difference between old `vYYYY.MM.PATCH` tags and new prefixless `YYYY.MM.PATCH` tags:

```yaml
tag_prefix: ''
legacy_prefixes: v
```

The allocator considers both the current prefix and all `legacy_prefixes` when finding the highest existing PATCH. Do not reset PATCH merely because a tag prefix convention changed.

For Go, preserve a canonical `vMAJOR.MINOR.PATCH` basename. A root module defaults to prefix `v`; a nested module such as `tools/foo` defaults to `tools/foo/v`. Configure `legacy_prefixes` only for a real migration and make sure every new tag remains valid for Go modules.

## Registry publication policy

Repository visibility and registry publication are separate axes for Rust/npm.

Use `registry_publish: true` when publishing to crates.io or npm. Use `registry_publish: false` for an internal/version-only release; validation, provenance, release-only commit creation, and immutable tagging still run.

For a Rust package that must never be published externally, also consider:

```toml
[package]
publish = false
```

Go does not use this switch in the reusable workflow. Go module publication is VCS-tag based, so the Go workflow validates the module and pushes the immutable module tag rather than uploading a package to a registry.

## Source selection

A movable `latest` tag is the recommended simple trigger when a human or agent wants to select an exact release source commit:

```bash
git tag -f latest <commit-to-release>
git push -f origin latest
```

The selected commit does **not** need to be `source_branch` HEAD. Normal development may be ahead. The reusable workflow only requires that the selected source commit belongs to the configured `source_branch` history.

Do not push a release-only metadata/provenance commit back to the development branch. The immutable release tag should retain that commit.

## Provenance for CLI versions

For command-line tools, prefer embedding the short release source SHA separately from the version:

```yaml
provenance_file: src/release-commit.txt
```

Then expose a version string such as:

```text
mycli 2026.8.1 (a1b2c3d)
```

The development checkout may use a stable placeholder such as `dev`. Ensure the provenance file is included in the published Rust/npm package, or embedded by the Go project's own build mechanism.

## Rust reusable workflow

Use a commit SHA pin for the reusable workflow. Do not point production release automation at `main`.

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
      registry_publish: true
      provenance_file: src/release-commit.txt
```

If `registry_publish: false`, `id-token: write` is not needed for crates.io authentication, but leaving it present is harmless. Prefer least privilege when editing an existing repository.

## cargo-dist integration

When a Rust CLI uses cargo-dist for GitHub Release artifacts, keep the immutable CalVer tag as the handoff boundary.

Use a Cargo-style SemVer-compatible CalVer such as `YYYY.MM.PATCH`. cargo-dist's generated workflow parses the release tag as a Cargo-style SemVer version; formats such as `YYYY-0M-0D` are not interchangeable for this integration.

Enable cargo-dist dispatch generation:

```toml
[workspace.metadata.dist]
dispatch-releases = true
```

Then regenerate with the project's pinned dist version and verify the generated workflow is clean:

```bash
dist generate
dist generate --check
dist manifest --artifacts=all --output-format=json --no-local-paths
```

Do **not** rely on the immutable tag pushed with `GITHUB_TOKEN` to trigger a second `push.tags` workflow. GitHub suppresses most recursive workflow runs caused by `GITHUB_TOKEN`. Explicitly dispatch cargo-dist after the CalVer release job succeeds.

Prefer the bundled reusable workflow:

```yaml
jobs:
  publish:
    permissions:
      contents: write
      id-token: write
    uses: f4ah6o/calver-action/.github/workflows/rust-crate.yaml@<commit-sha>
    with:
      format: YYYY.MM.PATCH
      timezone: Asia/Tokyo
      tag_prefix: v

  dist-release:
    needs: publish
    permissions:
      actions: write
      contents: read
    uses: f4ah6o/calver-action/.github/workflows/cargo-dist.yaml@<commit-sha>
    with:
      tag: ${{ needs.publish.outputs.tag }}
```

The cargo-dist helper passes the immutable tag as both the target workflow ref and the generated workflow's `tag` input. This is deliberate: the tag points at the release-only commit containing the final Cargo version, so cargo-dist builds the same source/version that was published to crates.io.

Keep one owner for each publication side effect. A clean split is:

- `rust-crate.yaml`: CalVer allocation, release-only commit, crates.io publication, immutable tag;
- cargo-dist: binaries/installers/checksums and GitHub Release assets.

If cargo-dist alone fails after the immutable tag exists, rerun or redispatch cargo-dist for that existing tag. Do not allocate a new CalVer merely to retry artifact generation.

See `docs/cargo-dist.md` / `docs/cargo-dist.ja.md` for the full integration rationale and recovery model.

## Go reusable workflow

Use the Go workflow for a repository or subdirectory containing `go.mod`:

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
    uses: f4ah6o/calver-action/.github/workflows/go.yaml@<commit-sha>
    with:
      timezone: Asia/Tokyo
```

The default mapping is `2026.8.0` -> `v1.202608.0`. `version` returns the canonical Go module version, `calver` returns the human-facing `YYYY.M.PATCH`, and `tag` returns the full Git tag.

For a nested module:

```yaml
with:
  working_directory: tools/foo
```

The tag prefix is automatically `tools/foo/v`, producing a tag such as `tools/foo/v1.202608.0`.

For an existing v2 module, use `format: 2.YYYY0M.PATCH` and keep the `go.mod` module path ending in `/v2`. The workflow validates v2+ module-path suffixes.

## npm reusable workflow

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
      registry_publish: true
      provenance_file: src/release-commit.txt
      access: public
```

When npm Trusted Publishing is enabled, configure npm with the **calling workflow filename** from the package repository. If `registry_publish: false`, Trusted Publishing configuration is unnecessary.

## Validation before commit

Before committing integration changes:

1. Validate all modified workflow YAML.
2. Run the repository's normal test/check command.
3. Confirm the reusable workflow is pinned to an immutable commit SHA.
4. Check existing release tags and configure `legacy_prefixes` if changing prefix convention.
5. For Go, verify the canonical module version and nested-module tag prefix; never let the calendar year become an unintended semantic major version.
6. If using provenance, verify the file is included in the released artifact or consumed by the build.
7. For cargo-dist, run `dist generate --check` and verify the release workflow accepts `workflow_dispatch` with a tag input.
8. Do not move `latest` unless the user explicitly intends to trigger a release.

## Scope

Do not add extra release triggers merely for flexibility. Keep trigger expansion YAGNI unless the repository has a concrete need for `workflow_dispatch`, GitHub Release events, branch release workflows, or another source-selection mechanism.
