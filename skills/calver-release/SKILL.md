---
name: calver-release
description: Add or maintain CalVer release automation for Rust crates and CLIs, Go modules, and npm packages using f4ah6o/calver-action, including dist and cargo-binstall acceptance. Use when configuring calendar releases, movable release tags such as latest, registry publish/no-publish policy, Go-module-compatible CalVer mapping, legacy tag prefixes, embedded Git SHA provenance, or Rust binary distribution.
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
- **Release trigger**: commonly a movable `latest` tag, but reusable workflows do not require a particular trigger.
- **Registry publication**: independent from GitHub repository visibility.
- **Binary distribution**: for Rust CLIs, owned by dist after the immutable tag exists.

Do not encode a Git SHA into the package version merely to expose provenance. Prefer a version plus separate source provenance.

## Detect the release shape

- Rust library/crate with `Cargo.toml` -> `.github/workflows/rust-crate.yaml`.
- Rust CLI/application that uses dist for prebuilt GitHub Release artifacts -> `.github/workflows/rust-dist.yaml`.
- Go module with `go.mod` -> `.github/workflows/go.yaml`.
- npm package with `package.json` -> `.github/workflows/npm.yaml`.

If more than one package exists, identify the released package and set `working_directory` accordingly.

## Default CalVer

For Rust and npm prefer:

```yaml
format: YYYY.MM.PATCH
timezone: Asia/Tokyo
```

For Rust + dist, keep the version Cargo SemVer-compatible. Do not use a format such as `YYYY-0M-0D` for that path.

For Go prefer the workflow default:

```yaml
format: 1.YYYY0M.PATCH
timezone: Asia/Tokyo
```

It maps August 2026 to Go module version `v1.202608.0` while separately exposing human-facing CalVer `2026.8.0`. This keeps the semantic major stable across calendar years and avoids forcing `/vYYYY` into the module path.

Supported calendar tokens are `YYYY`, `YY`, `0Y`, `MM`, `0M`, `WW`, `0W`, `DD`, and `0D`. `PATCH` is the action's collision counter.

## Legacy tag migration

For Rust/npm, preserve PATCH history across a `v` prefix migration:

```yaml
tag_prefix: ''
legacy_prefixes: v
```

For Go, preserve a valid `vMAJOR.MINOR.PATCH` basename. Root modules default to prefix `v`; nested modules such as `tools/foo` default to `tools/foo/v`.

## Registry publication policy

Repository visibility and registry publication are separate axes for Rust/npm.

Use `registry_publish: true` for crates.io/npm publication. Use `registry_publish: false` for version-only/internal releases; validation, provenance, release-only commit creation, and immutable tagging still run.

For a Rust package that must never be published externally, also consider:

```toml
[package]
publish = false
```

Go publication is VCS-tag based, so the Go workflow validates the module and pushes the immutable module tag rather than uploading a package to a registry.

## Source selection

A movable `latest` tag is the simple source-selection trigger:

```bash
git tag -f latest <commit-to-release>
git push -f origin latest
```

The selected commit does not need to be `source_branch` HEAD. It only needs to belong to the configured source branch history.

Do not merge release-only metadata/provenance commits back into the development branch. The immutable release tag retains that commit.

## Provenance for CLI versions

For command-line tools, prefer:

```yaml
provenance_file: src/release-commit.txt
```

and expose a version such as:

```text
mycli 2026.8.1 (a1b2c3d)
```

Ensure the provenance file is included in the published package or otherwise consumed by the build.

## Rust crate workflow

Pin production callers to an immutable `calver-action` commit SHA.

```yaml
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

Use this for crate publication without a prebuilt-binary distribution contract.

## Rust CLI + dist + cargo-binstall

Prefer the high-level `rust-dist.yaml` workflow for a normal Rust CLI release.

Project-side dist configuration should enable explicit dispatch:

```toml
[workspace.metadata.dist]
cargo-dist-version = "0.32.0"
dispatch-releases = true
```

Then regenerate and validate the generated workflow:

```bash
dist generate
dist generate --check
dist manifest --artifacts=all --output-format=json --no-local-paths
```

Caller:

```yaml
jobs:
  release:
    permissions:
      actions: write
      contents: write
      id-token: write
    uses: f4ah6o/calver-action/.github/workflows/rust-dist.yaml@<commit-sha>
    with:
      format: YYYY.MM.PATCH
      timezone: Asia/Tokyo
      legacy_prefixes: v
      registry_publish: true
      provenance_file: src/release-commit.txt
```

The workflow keeps one owner for each side effect:

- `rust-crate.yaml`: CalVer allocation, release-only commit, crates.io publication, immutable tag.
- `cargo-dist.yaml`: explicit dispatch of the project's dist-generated workflow from that immutable tag.
- dist: binaries/installers/checksums and GitHub Release assets.
- `rust-dist.yaml`: waits for the published Release and runs the consumer acceptance.

Do not rely on a tag pushed with `GITHUB_TOKEN` to recursively trigger a second `push.tags` workflow. The explicit dispatch exists to avoid that GitHub recursion suppression and to make dist build the exact release-only commit.

When `registry_publish: true`, `rust-dist.yaml` defaults to a real cargo-binstall acceptance. It uses cargo-binstall's `crate-meta-data` strategy only:

```text
cargo binstall --strategies crate-meta-data <crate>@=<version>
```

This intentionally excludes `quick-install` and source `compile` fallback, so a green acceptance proves the released binary metadata/path works rather than merely proving the crate can compile. The acceptance waits for a non-draft GitHub Release with assets and retries briefly for crates.io propagation.

For a version-only/internal dist release, use `registry_publish: false`; public cargo-binstall acceptance is skipped because crates.io metadata is absent. Set `binstall_acceptance: false` explicitly when documenting that policy.

If only custom orchestration is needed, use the lower-level `.github/workflows/cargo-dist.yaml` helper directly. If dist or binstall fails after crates.io publication and immutable tag creation, recover from that existing tag rather than allocating a new CalVer.

See `docs/rust-dist.md`, `docs/rust-dist.ja.md`, and the lower-level `docs/cargo-dist.md` guides.

## Go workflow

```yaml
jobs:
  release:
    permissions:
      contents: write
    uses: f4ah6o/calver-action/.github/workflows/go.yaml@<commit-sha>
    with:
      timezone: Asia/Tokyo
```

The default mapping is `2026.8.0` -> `v1.202608.0`. `version` returns the canonical Go module version and `calver` returns the human-facing calendar version.

For a nested module:

```yaml
with:
  working_directory: tools/foo
```

For an existing v2 module, use `format: 2.YYYY0M.PATCH` and keep the `go.mod` module path ending in `/v2`.

## npm workflow

```yaml
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

For npm Trusted Publishing, configure npm with the calling workflow filename from the package repository. If `registry_publish: false`, Trusted Publishing is unnecessary.

## Validation before commit

1. Validate modified workflow YAML and run the repository's normal tests/checks.
2. Pin production reusable workflows to an immutable commit SHA.
3. Check existing release tags and configure `legacy_prefixes` for real prefix migrations.
4. Verify provenance is included or consumed by the released artifact.
5. For Go, verify semantic-major/module-path compatibility.
6. For dist, run `dist generate --check` and verify the generated workflow accepts explicit dispatch with a tag input.
7. For Rust CLI distribution, keep cargo-binstall acceptance enabled unless registry publication is intentionally disabled.
8. Do not move `latest` unless the user explicitly intends to trigger a release.

## Scope

Do not add release triggers merely for flexibility. Keep source selection, registry publication, binary distribution, and consumer acceptance explicit and independently recoverable.
