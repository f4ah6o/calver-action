# calver-action

> **Unofficial project.** This GitHub Action is not affiliated with, endorsed by, or maintained by the CalVer project, calver.org, its maintainers, or GitHub, Inc.

A small GitHub Action that allocates the next `YYYY.M.PATCH` release version from the workflow runtime date and existing immutable Git tags.

It is designed for release flows where a movable trigger tag such as `latest` starts a workflow, while the actual release receives an immutable CalVer tag such as `2026.8.0`.

CalVer itself is a calendar-based software versioning convention. See the original project and documentation at https://calver.org/about.html and https://github.com/mahmoud/calver.

## Behavior

For a workflow running in August 2026:

- no `2026.8.*` tags -> `2026.8.0`
- `2026.8.0` exists -> `2026.8.1`
- `2026.8.0` and `2026.8.4` exist -> `2026.8.5`
- July tags do not affect the August patch sequence

The default tag has no `v` prefix. A prefix can be configured when a repository needs one.

By default the action only allocates a version and returns outputs. With `create_tag: true`, it also creates and pushes the immutable tag. Concurrent releases that race for the same patch are retried after refreshing remote tags.

## Recommended release pattern

Move a trigger tag to the commit you want to release:

```bash
git tag -f latest HEAD
git push -f origin latest
```

Then trigger a release workflow from `latest`:

```yaml
name: Release

on:
  push:
    tags:
      - latest

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: f4ah6o/calver-action@main
        id: calver
        with:
          timezone: Asia/Tokyo
          create_tag: true

      - run: echo "release ${{ steps.calver.outputs.version }}"
```

The workflow runtime date is used as the release date. For example, a run on August 11, 2026 in `Asia/Tokyo` allocates from the `2026.8.*` sequence regardless of the authored or committed timestamp of the target commit.

When `create_tag` is enabled, the checkout credentials must be able to push tags. A typical GitHub-hosted workflow uses `permissions: contents: write` as above.

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `timezone` | `UTC` | IANA timezone used to resolve the release year/month |
| `prefix` | empty | Optional immutable tag prefix, for example `v` |
| `date` | empty | Optional `YYYY-MM-DD` override for deterministic runs/tests |
| `fetch_tags` | `true` | Force-refresh tags from `origin` before allocation |
| `create_tag` | `false` | Create and push the allocated immutable tag |
| `target` | `GITHUB_SHA` / `HEAD` | Git object to tag |
| `retries` | `5` | Allocation attempts when concurrent releases collide |

## Outputs

| Output | Example |
| --- | --- |
| `version` | `2026.8.0` |
| `tag` | `2026.8.0` |
| `year` | `2026` |
| `month` | `8` |
| `patch` | `0` |

## Prefix example

```yaml
- uses: f4ah6o/calver-action@main
  id: calver
  with:
    prefix: v
```

This returns `version=2026.8.0` and `tag=v2026.8.0`.

## Deterministic test/replay

```yaml
- uses: f4ah6o/calver-action@main
  id: calver
  with:
    date: 2026-08-11
    fetch_tags: false
```

## Development

The action uses only the Node.js standard library at runtime.

```bash
npm test
npm run check
```

GitHub currently supports JavaScript actions using the Node.js 24 action runtime; this repository declares `runs.using: node24` in `action.yml`.

## Scope

This action intentionally does not define compatibility semantics for your software. It only allocates a calendar-derived release identifier with a per-month patch sequence.

The selected scheme is specifically:

```text
YYYY.M.PATCH
```

where `PATCH` starts at `0` for the first release observed in a given year/month and increments from the highest existing matching tag.

## License and third-party notices

This repository is licensed under the MIT License. See `LICENSE`.

Third-party references, workflow dependencies, attribution, and the explicit unofficial-project notice are documented in `THIRD_PARTY_NOTICES.md`.
