# calver-action

[English](README.md) | [日本語](README.ja.md)

> **非公式プロジェクトです。** このGitHub Actionは、CalVerプロジェクト、calver.org、そのメンテナ、GitHub、crates.io、npmとは提携・承認・運営関係にありません。

workflowの実行日時と既存のimmutable Git tagから、Calendar Versioning（CalVer）のrelease versionを採番するformat-drivenなGitHub Actionです。

CalVerは単一形式を強制するversioning方式ではなく、プロジェクトに応じて複数のcalendar schemeを利用できます。元仕様は calver.org のOverview / Aboutを参照してください。

このrepositoryには、Rust crateとnpm packageをCalVerでreleaseするopinionatedなreusable workflowも含まれます。

## Agent Skill

GitHub CLIからrelease integration skillをinstallできます。

```bash
gh skill install f4ah6o/calver-action calver-release
```

user scopeに入れる場合:

```bash
gh skill install f4ah6o/calver-action calver-release --scope user
```

install前の確認:

```bash
gh skill preview f4ah6o/calver-action calver-release
```

SkillはRust/npm reusable workflowの選択、`vYYYY.MM.PATCH`からprefixなしtagへの移行、registry publish有無、release source SHA provenanceの埋め込みなどをagentへ案内します。

## Core Action

```yaml
- uses: f4ah6o/calver-action@<commit-sha>
  id: calver
  with:
    format: YYYY.MM.PATCH
    timezone: Asia/Tokyo

- run: echo "release ${{ steps.calver.outputs.version }}"
```

2026-08-11に実行し、同一bucketの既存tagがなければ`2026.8.0`、次は`2026.8.1`、`2026.8.2`…と採番します。

## Reusable Release Workflows

### Rust / crates.io

caller側は小さく保てます。

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

workflowは次を行います。

1. release対象commitが`source_branch`（default: `main`）の履歴に含まれることを確認する。branch HEADである必要はありません。
2. 次のCalVerを採番する。
3. `provenance_file`指定時はrelease source commitの7文字SHAを書き込む。
4. release専用commit内で`Cargo.toml` / `Cargo.lock`を更新する。
5. fmt、clippy、test、`cargo package`を実行する。
6. `registry_publish: true`ならcrates.io OIDCでpublishする。
7. release専用commitへimmutable CalVer tagを作る。

release専用commitはdevelopment branchへmergeしません。そのため通常開発がrelease対象commitより先行していても問題ありません。

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

npm workflowも同じrelease-only commit modelです。`npm version --no-git-tag-version`でversionを更新し、`npm ci`、任意のbuild/test、`npm pack --dry-run`を実行します。`registry_publish: true`ならnpm Trusted Publishing（OIDC）でpublishし、immutable CalVer tagを作成します。

npm Trusted Publishingではpackage側のTrusted Publisherに**caller workflowのfilename**を設定してください。publishするcallerは`id-token: write`も必要です。

### Registry publish policy

GitHub repositoryのvisibilityとregistryへのpublishは別の軸です。

```yaml
with:
  registry_publish: false
```

`false`でも以下は実行します。

- CalVer採番
- provenance埋め込み
- package metadata更新
- build/test/package検証
- release-only commit
- immutable CalVer tag

skipするのはcrates.io/npmの認証とpublishだけです。

| Repository | `registry_publish` | 動作 |
| --- | --- | --- |
| private | `true` | registry/auth条件を満たせばregistryへpublish |
| private | `false` | 社内向けCalVer + provenance + immutable Git tagのみ |
| public | `true` | 通常のregistry release |
| public | `false` | sourceはpublicだがregistryにはpublishしない |

絶対にcrates.ioへ出したくないRust packageでは、`Cargo.toml`の`publish = false`も併用すると防御を重ねられます。

### Source provenance

package versionは純粋なCalVerのままにします。

```text
2026.8.1
```

source commitは別情報として埋め込みます。

```text
a1b2c3d
```

CLIなら次のように表示できます。

```text
mycli 2026.8.1 (a1b2c3d)
```

`provenance_file`はrepository-relative pathです。crates.io/npmからinstallした後も保持したい場合、そのfileがpublish packageへ含まれることを確認してください。

## Format

calver.orgのscheme terminologyに沿って、以下のcalendar tokenを利用できます。

| Token | 意味 | 2026-08-11の例 |
| --- | --- | --- |
| `YYYY` | 4桁年 | `2026` |
| `YY` | 2000年基準の短縮年 | `26` |
| `0Y` | zero-paddingした短縮年 | `26` |
| `MM` | 月 | `8` |
| `0M` | zero-paddingした月 | `08` |
| `WW` | 年初からの週 | `32` |
| `0W` | zero-paddingした週 | `32` |
| `DD` | 日 | `11` |
| `0D` | zero-paddingした日 | `11` |
| `PATCH` | **このAction独自拡張:** 同じcalendar bucket内の0始まり連番 | `0` |

例:

```text
YYYY.MM.PATCH   -> 2026.8.0
YY.0M.PATCH     -> 26.08.0
YYYY.0M.0D      -> 2026.08.11
YYYY-0M-0D      -> 2026-08-11
YYYY.WW.PATCH   -> 2026.32.0
```

`PATCH`はcalver.orgのcalendar tokenではなく、このActionがcollision回避のために追加している拡張です。`PATCH`を含まないformatで同じtagが既に存在する場合は、勝手にformatを変えずcollision errorにします。

week formatとmonth/day tokenは混在できません。

## PATCH採番

`format: YYYY.MM.PATCH`、2026年8月の場合:

- `2026.8.*`なし -> `2026.8.0`
- `2026.8.0`あり -> `2026.8.1`
- `2026.8.0` / `2026.8.4`あり -> `2026.8.5`
- 2026年7月tagは8月のPATCHに影響しない

`YYYY.WW.PATCH`ならyear/week単位でPATCHを採番します。

## `v` prefixの移行

新tagを`v2026.8.0`にしたい場合:

```yaml
with:
  prefix: v
```

旧`v...` tagを採番履歴として扱いつつ、新tagから`v`を外す場合:

```yaml
with:
  legacy_prefixes: v
```

例:

```text
v2026.8.0
v2026.8.3

next -> 2026.8.4
```

つまり`vYYYY.MM.PATCH`と`YYYY.MM.PATCH`の差でPATCH sequenceをresetしません。

## Release trigger

core action / reusable workflowは特定triggerに依存しません。

簡単な運用として、release対象commitへmovable `latest` tagを付け直す方法があります。

```bash
git tag -f latest <commit-to-release>
git push -f origin latest
```

release対象は`main` HEADである必要はありません。reusable workflowでは指定branchの履歴に含まれることだけを確認します。

`workflow_dispatch`やGitHub Release eventなどのtriggerは、具体的な必要性が出るまでcore actionへ組み込みません。

## calver-action自身のrelease

このrepository自身もcore actionをdogfoodします。

`main`履歴上のrelease対象commitへ`latest`を移動すると、`.github/workflows/release.yaml`が次を行います。

1. sourceが`main`履歴上にあることを確認
2. Node 24でtest
3. `uses: ./`でこのAction自身を実行
4. `Asia/Tokyo`の`YYYY.MM.PATCH`を採番
5. immutable CalVer tagを作成
6. GitHub Release draftを作成

```bash
git tag -f latest <commit-to-release>
git push -f origin latest
```

Marketplace公開にはGitHub UI上の**Publish this Action to the GitHub Marketplace**選択が必要なため、Releaseは意図的にdraftで止めます。

## GitHub Marketplace

Marketplace公開を想定したrepository構成です。

- public repository
- rootに1つの`action.yml`
- `name` / `description` / `author` / `branding`あり
- Node 24 Action
- MIT License
- `THIRD_PARTY_NOTICES.md`
- 非公式プロジェクトであることを明記
- CIあり
- 自身のCalVer release workflowあり

初回Marketplace releaseでは、生成されたdraft ReleaseをGitHub UIで開き、**Publish this Action to the GitHub Marketplace**を選び、categoryを設定し、必要ならMarketplace Developer Agreementへ同意してReleaseをpublishします。

## Core action inputs

| Input | Default | 説明 |
| --- | --- | --- |
| `format` | `YYYY.MM.PATCH` | CalVer format |
| `timezone` | `UTC` | runtime calendar dateのIANA timezone |
| `prefix` | empty | 新しいimmutable tagのprefix |
| `legacy_prefixes` | empty | 採番時に参照する旧prefix（comma-separated） |
| `date` | empty | test/replay用`YYYY-MM-DD` override |
| `fetch_tags` | `true` | allocation前に`origin` tagをrefresh |
| `create_tag` | `false` | immutable tagを作成・push |
| `target` | `GITHUB_SHA` / `HEAD` | tag対象Git object |
| `retries` | `5` | concurrent PATCH collision時のretry回数 |

## Outputs

| Output | 例 |
| --- | --- |
| `version` | `2026.8.0` |
| `tag` | `2026.8.0` |
| `year` | `2026` |
| `month` | `8` |
| `week` | `32` |
| `day` | `11` |
| `patch` | `0`、またはPATCHなしformatではempty |

Rust/npm reusable workflowは追加で`source_sha`と`short_sha`を返します。

## Development

core actionのruntime dependencyはNode.js標準libraryのみです。

```bash
npm test
npm run check
```

workflow fileはすべて`.yaml` extensionを使用します。

## License / Third-party notices

このrepositoryはMIT Licenseです。`LICENSE`を参照してください。

第三者への参照、workflow dependency、attribution、非公式プロジェクト表記については`THIRD_PARTY_NOTICES.md`にまとめています。
