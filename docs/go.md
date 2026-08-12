# Go releases

`calver-action` can release Go modules while preserving Go's Semantic Import Versioning rules.

## Why Go uses a mapped tag

A plain CalVer tag such as `v2026.8.0` is not a practical Go module version for a module whose path has no `/v2026` suffix: Go interprets the first number as the semantic major version, and modules at v2 or later require a matching major suffix in the module path.

The Go reusable workflow therefore defaults to:

```text
human CalVer: 2026.8.0
Go version:   v1.202608.0
Git tag:      v1.202608.0
```

The semantic major stays at `1`, `YYYYMM` becomes the semantic minor, and the CalVer collision counter becomes the semantic patch. The next release in the same month becomes `v1.202608.1`; September starts at `v1.202609.0`.

This preserves monotonic Go module versions without forcing calendar years into the module path.

## Caller workflow

Pin the reusable workflow to an immutable commit SHA in production:

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

The default `format` is:

```yaml
format: 1.YYYY0M.PATCH
```

For August 2026 this produces the version body `1.202608.0`; the workflow supplies the `v` required by Go module tags.

## What the workflow does

1. verifies that the selected source commit belongs to `source_branch` (default `main`);
2. resolves the Go module tag prefix;
3. installs the Go version declared by `go.mod`;
4. allocates the next Go-compatible CalVer version;
5. validates the resulting tag against Go's canonical `vMAJOR.MINOR.PATCH` shape and checks `/vN` for major versions 2 and later;
6. optionally writes the selected source commit SHA to `provenance_file`;
7. runs `go mod download`, `go test ./...`, `go vet ./...`, and `go build ./...`;
8. creates a release-only commit only when provenance changed;
9. pushes the immutable release tag.

There is no registry publish switch for Go because public Go modules are published through their VCS tags rather than uploaded to a package registry by this workflow.

## Outputs

| Output | Example | Meaning |
| --- | --- | --- |
| `version` | `v1.202608.0` | Canonical Go module version |
| `tag` | `v1.202608.0` | Full immutable Git tag |
| `calver` | `2026.8.0` | Human/CLI-facing CalVer |
| `source_sha` | full SHA | Selected release source |
| `short_sha` | `a1b2c3d` | Seven-character source SHA |

For a nested module, `tag` includes the module directory while `version` remains the canonical Go version.

## Nested modules

For a module in `tools/foo/go.mod`:

```yaml
with:
  working_directory: tools/foo
```

With no explicit `tag_prefix`, the workflow automatically creates tags such as:

```text
tools/foo/v1.202608.0
```

This matches Go's repository tag convention for modules below the repository root.

Set `tag_prefix` explicitly only when the repository already uses a different compatible layout.

## v2 and later

The stable semantic major is intentionally independent from the calendar. If the module is already v2, use for example:

```yaml
with:
  format: 2.YYYY0M.PATCH
```

and ensure the module path in `go.mod` ends in `/v2`. The workflow rejects a v2+ release when the module path suffix does not match.

Do not increment the Go semantic major when the calendar year changes.

## Source provenance and CLI versions

`provenance_file` follows the same source-provenance policy as the Rust and npm workflows:

```yaml
with:
  provenance_file: internal/version/release-commit.txt
```

The file receives the seven-character release source SHA. Keep the human-facing CalVer (`calver` output) separate from the source identity so a CLI can present a value such as:

```text
mycli 2026.8.0 (a1b2c3d)
```

How the CLI embeds its version is project-specific; the reusable workflow deliberately does not assume a package name or `-ldflags -X` variable path.

## Release source

As with the Rust and npm workflows, a movable `latest` tag is one possible source-selection mechanism:

```bash
git tag -f latest <commit-to-release>
git push -f origin latest
```

The selected commit only needs to be in the configured `source_branch` history; it does not need to be branch HEAD.
