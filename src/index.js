const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { allocate } = require('./calver');

function input(name, fallback = '') {
  const value = process.env[`INPUT_${name.toUpperCase()}`];
  return value == null || value === '' ? fallback : value;
}

function boolInput(name, fallback) {
  const raw = input(name, String(fallback)).trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`input ${name} must be true or false`);
}

function intInput(name, fallback) {
  const raw = input(name, String(fallback)).trim();
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error(`input ${name} must be an integer between 1 and 100`);
  }
  return value;
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function fetchTags() {
  git(['fetch', '--force', '--tags', 'origin']);
}

function localTags() {
  const output = git(['tag', '--list']);
  return output ? output.split(/\r?\n/) : [];
}

function writeOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    process.stdout.write(`${name}=${value}\n`);
    return;
  }
  fs.appendFileSync(outputPath, `${name}=${value}\n`, 'utf8');
}

function publishOutputs(result) {
  writeOutput('version', result.version);
  writeOutput('tag', result.tag);
  writeOutput('year', result.year);
  writeOutput('month', result.month);
  writeOutput('patch', result.patch);
}

function logResult(result, created) {
  const verb = created ? 'created' : 'allocated';
  process.stdout.write(`Unofficial CalVer: ${verb} ${result.tag}\n`);
}

function allocateFromRepository(options) {
  return allocate(localTags(), options);
}

function createTagWithRetry(options, target, retries, shouldFetch) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    if (shouldFetch || attempt > 1) fetchTags();
    const result = allocateFromRepository(options);
    git(['tag', result.tag, target]);
    try {
      git(['push', 'origin', `refs/tags/${result.tag}`]);
      return result;
    } catch (error) {
      lastError = error;
      try {
        git(['tag', '-d', result.tag]);
      } catch {
        // Best effort local cleanup before retrying allocation.
      }
      if (attempt < retries) {
        process.stderr.write(
          `tag push for ${result.tag} failed; refreshing tags and retrying allocation (${attempt}/${retries})\n`,
        );
      }
    }
  }
  throw lastError || new Error('could not create release tag');
}

function main() {
  const timezone = input('timezone', 'UTC');
  const prefix = input('prefix', '');
  const legacyPrefixes = input('legacy_prefixes', '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const dateInput = input('date', '');
  const shouldFetch = boolInput('fetch_tags', true);
  const shouldCreateTag = boolInput('create_tag', false);
  const retries = intInput('retries', 5);
  const target = input('target', process.env.GITHUB_SHA || 'HEAD');
  const options = { timezone, prefix, legacyPrefixes, dateInput };

  let result;
  if (shouldCreateTag) {
    result = createTagWithRetry(options, target, retries, shouldFetch);
    logResult(result, true);
  } else {
    if (shouldFetch) fetchTags();
    result = allocateFromRepository(options);
    logResult(result, false);
  }
  publishOutputs(result);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`Unofficial CalVer failed: ${message}\n`);
  process.exitCode = 1;
}
