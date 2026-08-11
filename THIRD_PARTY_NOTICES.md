# Third-Party Notices

## Unofficial-project notice

`calver-action` is an independent, unofficial project. It is not affiliated with, endorsed by, sponsored by, or maintained by the CalVer project, calver.org, its maintainers, GitHub, Inc., crates.io, the Rust project, npm, Inc., or the Node.js project.

Names and links are used only to identify conventions, registries, runtimes, and tools that this software interoperates with.

## CalVer / calver.org

This project implements configurable calendar-version formatting using terminology documented by the Calendar Versioning project, including `YYYY`, `YY`, `0Y`, `MM`, `0M`, `WW`, `0W`, `DD`, and `0D`.

The `PATCH` token is an independent extension implemented by this project for automatic collision sequencing; it is not represented as an official CalVer calendar token.

- Project site: https://calver.org/
- Overview and scheme terminology: https://calver.org/overview.html
- About: https://calver.org/about.html
- Source repository: https://github.com/mahmoud/calver

No CalVer source code is incorporated into this repository. Consult the upstream project for the applicable terms of upstream content.

## GitHub Actions workflow dependencies

The reusable workflows call the following third-party or upstream-maintained GitHub Actions at runtime. They are referenced from GitHub and are not redistributed in this repository.

### actions/checkout

- Repository: https://github.com/actions/checkout
- License: MIT

### actions/setup-node

- Repository: https://github.com/actions/setup-node
- License: MIT

### dtolnay/rust-toolchain

- Repository: https://github.com/dtolnay/rust-toolchain
- License: MIT

### Swatinem/rust-cache

- Repository: https://github.com/Swatinem/rust-cache
- License: LGPL-3.0

### rust-lang/crates-io-auth-action

- Repository: https://github.com/rust-lang/crates-io-auth-action
- License: Apache-2.0

## crates.io

The `rust-crate.yaml` reusable workflow publishes Rust crates to crates.io and obtains short-lived registry credentials through the official `rust-lang/crates-io-auth-action` OIDC flow.

- Registry: https://crates.io/
- Documentation: https://doc.rust-lang.org/cargo/reference/publishing.html

No crates.io source code is incorporated into this repository.

## npm

The `npm.yaml` reusable workflow publishes packages to the npm registry using npm Trusted Publishing / OIDC when the package and caller workflow are configured accordingly.

- Registry: https://www.npmjs.com/
- Trusted Publishing documentation: https://docs.npmjs.com/trusted-publishers/

The workflow installs npm 11 at release time to satisfy the Trusted Publishing client requirement. npm itself is not redistributed in this repository.

## Node.js

The core JavaScript action executes on the Node.js runtime supplied by GitHub Actions and uses only Node.js standard-library modules at runtime. Node.js is not redistributed in this repository.

- Project: https://nodejs.org/
- License information: https://github.com/nodejs/node/blob/main/LICENSE
