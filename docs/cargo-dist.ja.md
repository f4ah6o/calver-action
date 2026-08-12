# cargo-dist 連携

[English](cargo-dist.md)

`calver-action` が CalVer 採番・package metadata 更新・registry publish・immutable release tag を担当し、cargo-dist が GitHub Release のartifact / installer生成を担当する構成にできます。

重要な境界は **immutable CalVer tag** です。registry publish と配布artifactの両方を、同じrelease-only commitから作るようにします。

## なぜ明示dispatchが必要か

Rust reusable workflowはrelease-only commitを作成し、publish後にimmutable CalVer tagをpushします。このtagはworkflowの`GITHUB_TOKEN`で作成されます。

GitHubは`GITHUB_TOKEN`が発生させたeventから別workflowが再帰的に起動することを原則抑止しています。そのため、CalVer workflowがimmutable tagをpushした後にcargo-dist側の`push.tags` triggerが動くことを前提にしない方が安全です。

代わりにcargo-distのdispatch modeを有効化し、生成されたworkflowを`workflow_dispatch`で明示的に起動します。GitHubでは`workflow_dispatch`と`repository_dispatch`はこの再帰起動抑止の例外です。

この方式にはもう1つ利点があります。cargo-distは`main`やversion bump前のsource commitではなく、**release-only commitそのもの**から実行する必要があります。immutable tagを`--ref`とcargo-distの`tag` inputの両方へ渡すことで、checkout対象・manifest version・GitHub Release tag・registry package versionを一致させられます。

## cargo-dist設定

cargo-distと組み合わせる場合は、Cargo-style SemVerとして解釈できるCalVerを使います。推奨は`YYYY.MM.PATCH`です。

cargo-dist生成workflowはtagからCargo-style SemVer versionを解析するため、`YYYY-0M-0D`のような任意のCalVer文字列をそのまま同じ用途には使えません。

`vYYYY.MM.PATCH`のような一般的なversion tag prefixは利用できます。

project側のcargo-dist設定でdispatch releaseを有効にします。

```toml
[workspace.metadata.dist]
cargo-dist-version = "0.32.0"
dispatch-releases = true
```

その後、projectでpinしているdist versionを使ってworkflowを再生成します。

```bash
dist generate
```

生成された`.github/workflows/release.yml`をcommitします。cargo-dist設定で表現できる挙動を、生成workflowへ手編集で埋め込むのは避けます。

CIでは次の確認が有効です。

```bash
dist generate --check
dist manifest --artifacts=all --output-format=json --no-local-paths
```

## 推奨caller

release workflowは小さく保てます。

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

`cargo-dist.yaml` reusable workflowは生成済み`release.yml`を次の対応でdispatchします。

```text
ref = <immutable CalVer tag>
tag = <immutable CalVer tag>
```

この2つを同じtagにするのが重要です。immutable tagは最終versionが書き込まれたrelease-only commitを指すため、cargo-distはcrates.ioへpublish済みのversionと同一sourceからartifactをbuildします。

callerのcargo-dist dispatch jobには`actions: write`が必要です。生成されたcargo-dist workflow自身は通常、GitHub Release作成のため`contents: write`を使用します。

生成workflow名やdispatch input名が異なる場合はoverrideできます。

```yaml
with:
  tag: ${{ needs.publish.outputs.tag }}
  workflow_file: release.yml
  tag_input: tag
```

## publish副作用は1つのownerにする

同じ対象を複数systemからpublishしないようにします。

分担例:

- `rust-crate.yaml`: CalVer採番、release-only commit、validation、crates.io publish、immutable tag作成
- cargo-dist: binary / installer / checksum生成、GitHub Release artifact publish

cargo-dist側に追加registry publisherを設定している場合は、各registryをどちらが担当するか明示します。crates.io/npmへのpublishを二重化すると、retryやpartial failureの復旧が複雑になります。

## failure / retry

復旧境界はimmutable tagです。

crates.io publishとtag作成まで成功し、cargo-distだけ失敗した場合は、既存immutable tagに対してcargo-distを再実行・再dispatchします。artifact生成retryのためだけに新しいCalVerを採番しません。

immutable tag作成前にCalVer workflowが失敗した場合は、原因を修正してCalVer release pathを再実行します。allocatorは既存tagを再確認して`PATCH`を決定します。

release-only version bumpをdevelopment branchへ戻さなくても、registry publish・GitHub artifact生成・retryの責任境界を明確に保てます。

## Checklist

1. Cargo SemVer互換のCalVerを使う（既定推奨: `YYYY.MM.PATCH`）。
2. `dispatch-releases = true`を有効化し、cargo-dist CIを再生成する。
3. 先にCalVer workflowでrelease-only commitとimmutable tagを作る。
4. immutable tagをcargo-distのworkflow `ref`と`tag` inputの両方へ渡す。
5. dispatch jobへ`actions: write`を付与する。
6. 外部publish副作用ごとにownerを1つにする。
7. artifactだけ失敗した場合は、新versionを採番せず既存immutable tagからretryする。
