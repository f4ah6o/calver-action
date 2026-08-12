# cargo-dist integration

[日本語](cargo-dist.ja.md)

`calver-action` can own version allocation, package metadata updates, registry publication, and the immutable release tag while cargo-dist owns GitHub Release artifacts and installers.

The important boundary is the immutable CalVer tag: both publication paths should build from the same release-only commit.

## Why explicit dispatch is needed

The Rust reusable workflow creates a release-only commit, publishes it, and then pushes the immutable CalVer tag. That tag is created with the workflow's `GITHUB_TOKEN`.

GitHub intentionally prevents most events created by `GITHUB_TOKEN` from recursively starting new workflow runs. Do not rely on a cargo-dist `push.tags` trigger firing after the CalVer workflow pushes the immutable tag.

Instead, enable cargo-dist's dispatch mode and explicitly start its generated workflow with `workflow_dispatch`. GitHub documents `workflow_dispatch` and `repository_dispatch` as exceptions to the recursive-run prevention rule.

This also solves a second problem: the cargo-dist workflow must run from the release-only commit, not from `main` or from the original source commit before the version bump. Passing the immutable tag as both `--ref` and the cargo-dist `tag` input makes the checkout, manifest version, GitHub Release tag, and registry package version agree.

## cargo-dist configuration

Use a Cargo-style SemVer-compatible CalVer such as `YYYY.MM.PATCH`. cargo-dist's generated release workflow parses the tag as a Cargo-style SemVer version, so arbitrary CalVer strings such as `YYYY-0M-0D` are not interchangeable here.

`vYYYY.MM.PATCH` is fine because cargo-dist accepts common version-tag prefixes.

Enable dispatch releases in the project's cargo-dist configuration:

```toml
[workspace.metadata.dist]
cargo-dist-version = "0.32.0"
dispatch-releases = true
```

Then regenerate the workflow with the project's pinned dist version:

```bash
dist generate
```

Commit the generated `.github/workflows/release.yml`. Avoid hand-editing generated cargo-dist workflow logic when the same behavior is available through cargo-dist configuration.

Useful CI checks are:

```bash
dist generate --check
dist manifest --artifacts=all --output-format=json --no-local-paths
```

## Recommended caller

The repository can keep one small release workflow:

```yaml
name: Publish crate

on:
  push:
    tags:
      - latest

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

The `cargo-dist.yaml` reusable workflow dispatches the generated `release.yml` with:

```text
ref = <immutable CalVer tag>
tag = <immutable CalVer tag>
```

That exact pairing is intentional. The tag points at the release-only commit containing the final `Cargo.toml` / `Cargo.lock` version, so cargo-dist builds the same version that the Rust reusable workflow published to crates.io.

The caller must grant `actions: write` to the cargo-dist dispatch job. The generated cargo-dist workflow itself normally needs `contents: write` to create the GitHub Release.

If the generated workflow filename or dispatch input differs, the helper accepts overrides:

```yaml
with:
  tag: ${{ needs.publish.outputs.tag }}
  workflow_file: release.yml
  tag_input: tag
```

## One owner for each publication side effect

Avoid configuring two independent systems to publish the same thing.

A clean split is:

- `rust-crate.yaml`: allocate CalVer, create the release-only commit, validate, publish to crates.io, push the immutable tag;
- cargo-dist: build binaries/installers/checksums and publish the GitHub Release assets from that immutable tag.

If cargo-dist is configured with additional registry publishers, decide explicitly which workflow owns each registry. Duplicate crates.io/npm publication attempts make retries and partial-failure recovery harder.

## Failure and retry behavior

The immutable tag is the recovery boundary.

If crates.io publication and tag creation succeeded but cargo-dist failed, rerun or redispatch cargo-dist for the existing immutable tag. Do not allocate a new CalVer merely to retry artifact generation.

If the CalVer workflow fails before the immutable tag exists, fix the failure and rerun the CalVer release path. The allocator will inspect existing tags before choosing the next `PATCH`.

This separation keeps registry publication, GitHub artifact generation, and retries idempotent enough to reason about without merging the release-only version bump back into the development branch.

## Checklist

1. Use a Cargo SemVer-compatible CalVer (`YYYY.MM.PATCH` is the default choice).
2. Enable `dispatch-releases = true` and regenerate cargo-dist CI.
3. Let the CalVer release workflow create the release-only commit and immutable tag first.
4. Dispatch cargo-dist with the immutable tag as both workflow `ref` and `tag` input.
5. Grant the dispatch job `actions: write`.
6. Keep one owner for each external publication side effect.
7. On artifact-only failure, retry from the existing immutable tag instead of allocating a new version.
