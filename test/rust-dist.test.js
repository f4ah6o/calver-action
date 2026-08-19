const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'rust-dist.yaml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

test('Rust dist workflow composes existing release owners from its own commit', () => {
  assert.match(workflow, /uses: \$\/\.github\/workflows\/rust-crate\.yaml/);
  assert.match(workflow, /uses: \$\/\.github\/workflows\/cargo-dist\.yaml/);
  assert.doesNotMatch(workflow, /cargo publish/);
  assert.doesNotMatch(workflow, /gh release create/);
});

test('binstall acceptance cannot pass through quick-install or source compilation', () => {
  assert.match(workflow, /--strategies crate-meta-data/);
  assert.match(workflow, /"\$\{CRATE_NAME\}@=\$\{VERSION\}"/);
  assert.doesNotMatch(workflow, /--strategies[^\n]*quick-install/);
  assert.doesNotMatch(workflow, /--strategies[^\n]*compile/);
  assert.match(workflow, /inputs\.binstall_acceptance && inputs\.registry_publish/);
});

test('binstall acceptance waits for a published GitHub Release with assets', () => {
  assert.match(workflow, /gh release view "\$TAG"/);
  assert.match(workflow, /not release\["isDraft"\]/);
  assert.match(workflow, /len\(release\["assets"\]\) > 0/);
});
