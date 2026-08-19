# Rust CLI 配布

[English](rust-dist.md)

crate publishとprebuilt binary配布を、同じCalVerのrelease-only commitから行うRust CLIでは `.github/workflows/rust-dist.yaml` を使います。

workflowは既存のrelease primitiveを役割分担したまま合成します。

1. `rust-crate.yaml` がCargo互換CalVerを採番し、release-only commitを作り、必要ならcrates.ioへpublishし、immutable release tagをpushする。
2. `cargo-dist.yaml` がそのimmutable tagからproject側のdist生成workflowを明示dispatchする。
3. `rust-dist.yaml` がGitHub Releaseがpublishされartifactを持つまで待つ。
4. crates.io publish有効時は、releaseした正確なversionを実際に `cargo binstall` してacceptanceする。

## Project側の準備

`YYYY.MM.PATCH` のようなCargo SemVer互換CalVerを使ってください。`YYYY-0M-0D` のようなcalendar stringはこのRust distribution pathには適しません。

distをexplicit dispatchに対応させます。現在のstable distでは次の設定です。

```toml
[workspace.metadata.dist]
cargo-dist-version = "0.32.0"
dispatch-releases = true
```

生成workflowを更新してcommitします。

```bash
dist generate
dist generate --check
dist manifest --artifacts=all --output-format=json --no-local-paths
```

生成workflowは通常 `.github/workflows/release.yml` で、distが生成する `workflow_dispatch` のtag inputを持っている必要があります。

## 推奨caller

```yaml
name: Release

on:
  push:
    tags:
      - latest

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
      provenance_file: src/release-commit.txt
      registry_publish: true
```

production callerは `calver-action` のimmutable commit SHAへpinしてください。

生成されたdist workflowのfilenameまたはinput名が異なる場合:

```yaml
with:
  dist_workflow_file: release.yml
  dist_tag_input: tag
```

## cargo binstall acceptance

`registry_publish: true` のとき、`binstall_acceptance` はdefaultで `true` です。

acceptanceはdistのGitHub Releaseがnon-draftになりassetを持つまで待ち、その後releaseしたcrateの正確なversionをcargo-binstallでinstallします。strategyは意図的に `crate-meta-data` のみに固定します。

```text
cargo binstall --strategies crate-meta-data <crate>@=<version>
```

これにより、このcheckではcargo-binstallの `quick-install` とsource `compile` fallbackが無効になります。したがって、sourceからbuildできただけ、または無関係なthird-party quick-install artifactが存在しただけではgreenになりません。

workflowは現在のstable cargo-binstall `1.21.1` を使い、acceptance runではtelemetryを無効化します。

GitHub Release待機はdefaultで10秒間隔×180回、最大30分です。Release ready後はcrates.io metadataの反映遅延を吸収するため、cargo-binstallを短時間retryします。

version-only / internal releaseでは:

```yaml
with:
  registry_publish: false
```

crate releaseとdist handoffは実行しますが、crates.io metadataを意図的に作らないためpublicな `cargo binstall <crate>` acceptanceはskipします。その運用を明示する場合は `binstall_acceptance: false` も指定してください。

## Failure boundary

immutable CalVer tagをrecovery boundaryのまま維持します。crates.io publishとimmutable tag作成後にdistまたはbinstall acceptanceだけが失敗した場合、artifact/metadata側を直して同じtagのdownstream distributionを再実行します。binary配布のretryだけを目的に新しいCalVerを採番しません。

custom orchestrationが必要なrepository向けには、低レベルhelperの `cargo-dist.yaml` も引き続き利用できます。通常のRust CLI releaseでは `rust-dist.yaml` を高レベルのdefaultとして使います。
