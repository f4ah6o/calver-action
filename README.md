# calver-action

> **Unofficial project.** This GitHub Action is not affiliated with, endorsed by, or maintained by the CalVer project, calver.org, its maintainers, or GitHub, Inc.

A small format-driven GitHub Action that allocates Calendar Versioning release identifiers from the workflow runtime date and existing immutable Git tags.

CalVer itself is a calendar-based software versioning convention with multiple valid schemes rather than one mandatory format. See https://calver.org/overview.html and https://calver.org/about.html.

## Quick start

```yaml
- uses: f4ah6o/calver-action@<commit-sha>
  id: calver
  with:
    format: YYYY.MM.PATCH
    timezone: Asia/Tokyo

- run: echo "release ${{ steps.calver.outputs.version }}"
```

For a run on August 11, 2026, the default format allocates `2026.8.0` when no matching tag exists, then `2026.8.1`, `2026.8.2`, and so on.

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
YY.0M.PATCH    -> 26.08.0
YYYY.0M.0D     -> 2026.08.11
YYYY-0M-0D     -> 2026-08-11
YYYY.WW.PATCH  -> 2026.32.0
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

The action only allocates or creates a CalVer tag; it does **not** require a particular release trigger.

A movable tag such as `latest` is one useful pattern:

```bash
git tag -f latest <commit-to-release>
git push -f origin latest
```

```yaml
on:
  push:
    tags:
      - latest
```

The release commit does not need to be the current branch HEAD. Normal development may continue ahead of the commit selected for release. Whether the selected commit must belong to a particular branch is a policy for the consuming workflow, not this action.

Other triggers such as `workflow_dispatch`, GitHub Releases, or branch workflows can call the same action without changes to its version-allocation behavior.

## Runtime date

The workflow runtime date is used by default, not the authored or committed timestamp of the target commit.

```yaml
with:
  timezone: Asia/Tokyo
```

A run after midnight in Japan therefore uses the new Japanese calendar date even when it is still the previous UTC date.

For deterministic tests or replay:

```yaml
with:
  date: 2026-08-11
  fetch_tags: false
```

## Creating tags

By default the action only allocates a version and returns outputs.

```yaml
with:
  create_tag: true
```

With `create_tag: true`, the action creates and pushes the immutable tag to `target` (`GITHUB_SHA`, then `HEAD`, by default). The checkout credentials need tag-push permission, typically `permissions: contents: write`.

Concurrent releases that race for the same `PATCH` refresh remote tags and retry allocation.

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

## Inputs

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

## Outputs

| Output | Example |
| --- | --- |
| `version` | `2026.8.0` |
| `tag` | `2026.8.0` |
| `year` | `2026` |
| `month` | `8` |
| `week` | `32` |
| `day` | `11` |
| `patch` | `0`, or empty when the format has no `PATCH` |

## Development

The action uses only the Node.js standard library at runtime.

```bash
npm test
npm run check
```

## Scope

This action does not define compatibility semantics, support windows, or release cadence for your project. It only turns a release calendar date plus repository tag history into a version identifier according to the selected format.

Release-trigger orchestration is intentionally outside the action's core scope.

## License and third-party notices

This repository is licensed under the MIT License. See `LICENSE`.

Third-party references, workflow dependencies, attribution, and the explicit unofficial-project notice are documented in `THIRD_PARTY_NOTICES.md`.