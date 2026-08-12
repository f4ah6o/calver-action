---
name: calver-release
description: Add or maintain CalVer release automation for Rust crates and npm packages using f4ah6o/calver-action, including cargo-dist handoff. Use when configuring YYYY.MM.PATCH-style releases, movable release tags such as latest, registry publish/no-publish policy, legacy v-prefixed tags, embedded Git SHA provenance, or cargo-dist GitHub Release artifacts.
license: MIT
---

# CalVer Release

Use this skill when a repository needs calendar-based release automation backed by `f4ah6o/calver-action`.

## Core policy

Keep these concepts separate:

- **CalVer package version**: registry-compatible version such as `2026.8.1`.
- **Source provenance**: release source commit SHA, embedded separately when useful for CLI `-V` output.
- **Git tag**: immutable CalVer release tag.
- **Release trigger**: commonly a movable `latest` tag, but the reusable workflows do not require a particular trigger.
- **Registry publication**: independent from GitHub repository visibility.

Do not encode a Git SHA into the package version merely to expose provenance. Prefer pure CalVer plus a provenance file.

## Detect the package type

- `Cargo.toml` -> use `.github/workflows/rust-crate.yaml`.
- `package.json` -> use `.github/workflows/npm.yaml`.

If both exist, identify which package is being released and set `working_directory` accordingly.

## Default CalVer

Prefer:

```yaml
format: YYYY.MM.PATCH
timezone: Asia/Tokyo
```

Use another supported format only when the project already has a different CalVer convention. Supported calendar tokens are `YYYY`, `YY`, `0Y`, `MM`, `0M`, `WW`, `0W`, `DD`, and `0D`. `PATCH` is an extension provided by this action for collision sequencing.

## Legacy `v` tag migration

The action can absorb the difference between old `vYYYY.MM.PATCH` tags and new prefixless `YYYY.MM.PATCH` tags.

To continue the same PATCH sequence while dropping `v` from new tags:

```yaml
tag_prefix: ''
legacy_prefixes: v
```

Example:

```text
v2026.8.0
v2026.8.3

next new tag -> 2026.8.4
```

The allocator considers both the current prefix and all `legacy_prefixes` when finding the highest existing PATCH. Do not reset PATCH merely because a tag prefix convention changed.

## Registry publication policy

Repository visibility and registry publication are separate axes.

Use:

```yaml
registry_publish: true
```

when publishing to crates.io or npm.

Use:

```yaml
registry_publish: false
```

for an internal/version-only release. This still performs CalVer allocation, validation, provenance embedding, release-only commit creation, and immutable tagging; it only skips registry authentication and publication.

For a Rust package that must never be published externally, also consider:

```toml
[package]
publish = false
```

## Source selection

A movable `latest` tag is the recommended simple trigger when a human or agent wants to select an exact release source commit:

```bash
git tag -f latest <commit-to-release>
git push -f origin latest
```

The selected commit does **not** need to be `source_branch` HEAD. Normal development may be ahead. The reusable workflow only requires that the selected source commit belongs to the configured `source_branch` history.

Do not push the release-only version-bump commit back to the development branch. The immutable CalVer tag should retain that release-only commit.

## Provenance for CLI versions

For command-line tools, prefer embedding the short release source SHA in a file included in the package:

```yaml
provenance_file: src/release-commit.txt
```

Then expose a version string such as:

```text
mycli 2026.8.1 (a1b2c3d)
```

The development checkout may use a stable placeholder such as `dev`. Ensure the provenance file is included in the published package so installation from crates.io/npm preserves the release source SHA.

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
5. If using provenance, verify the file is included in `cargo package --list` or `npm pack --dry-run`.
6. For cargo-dist, run `dist generate --check` and verify the release workflow accepts `workflow_dispatch` with a tag input.
7. Do not move `latest` unless the user explicitly intends to trigger a release.

## Scope

Do not add extra release triggers merely for flexibility. Keep trigger expansion YAGNI unless the repository has a concrete need for `workflow_dispatch`, GitHub Release events, branch release workflows, or another source-selection mechanism.
