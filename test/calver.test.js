const test = require('node:test');
const assert = require('node:assert/strict');
const {
  allocate,
  nextPatch,
  parseExplicitDate,
  releaseDateParts,
  validateFormat,
  weekOfYear,
} = require('../src/calver');

test('allocates default YYYY.MM.PATCH', () => {
  assert.deepEqual(
    allocate([], { dateInput: '2026-08-11' }),
    {
      version: '2026.8.0',
      tag: '2026.8.0',
      year: 2026,
      month: 8,
      week: 32,
      day: 11,
      patch: 0,
    },
  );
});

test('increments the highest PATCH in the same calendar bucket', () => {
  const parts = parseExplicitDate('2026-08-11');
  assert.equal(
    nextPatch(['2026.8.0', '2026.8.2', '2026.7.99'], {
      format: 'YYYY.MM.PATCH',
      parts,
    }),
    3,
  );
});

test('renders official CalVer year month and day token variants', () => {
  const tags = [];
  assert.equal(allocate(tags, { dateInput: '2026-08-11', format: 'YYYY.0M.0D' }).version, '2026.08.11');
  assert.equal(allocate(tags, { dateInput: '2026-08-11', format: 'YY.MM.DD' }).version, '26.8.11');
  assert.equal(allocate(tags, { dateInput: '2006-01-02', format: '0Y.0M.0D' }).version, '06.01.02');
});

test('renders week token variants since the start of the year', () => {
  assert.equal(weekOfYear({ year: 2026, month: 1, day: 1 }), 1);
  assert.equal(weekOfYear({ year: 2026, month: 1, day: 8 }), 2);
  assert.equal(allocate([], { dateInput: '2026-08-11', format: 'YYYY.0W.PATCH' }).version, '2026.32.0');
});

test('supports an optional tag prefix without requiring one', () => {
  assert.equal(
    allocate(['v2026.8.0', '2026.8.8'], {
      dateInput: '2026-08-11',
      format: 'YYYY.MM.PATCH',
      prefix: 'v',
    }).tag,
    'v2026.8.1',
  );
});

test('can migrate away from a legacy tag prefix', () => {
  assert.equal(
    allocate(['v2026.8.0', 'v2026.8.3'], {
      dateInput: '2026-08-11',
      format: 'YYYY.MM.PATCH',
      prefix: '',
      legacyPrefixes: ['v'],
    }).version,
    '2026.8.4',
  );
});

test('PATCH sequence follows the selected format bucket', () => {
  assert.equal(
    allocate(['2026.32.0', '2026.32.4', '2026.31.99'], {
      dateInput: '2026-08-11',
      format: 'YYYY.WW.PATCH',
    }).version,
    '2026.32.5',
  );
});

test('formats without PATCH reject duplicate release identifiers', () => {
  assert.throws(
    () => allocate(['2026.08.11'], { dateInput: '2026-08-11', format: 'YYYY.0M.0D' }),
    /collision.*has no PATCH/i,
  );
});

test('uses the requested timezone for the workflow runtime date', () => {
  const now = new Date('2026-07-31T15:30:00Z');
  assert.deepEqual(releaseDateParts({ timezone: 'Asia/Tokyo', now }), {
    year: 2026,
    month: 8,
    week: 31,
    day: 1,
  });
  assert.deepEqual(releaseDateParts({ timezone: 'UTC', now }), {
    year: 2026,
    month: 7,
    week: 31,
    day: 31,
  });
});

test('validates explicit calendar dates', () => {
  assert.deepEqual(parseExplicitDate('2026-08-11'), {
    year: 2026,
    month: 8,
    week: 32,
    day: 11,
  });
  assert.throws(() => parseExplicitDate('2026-02-30'), /invalid calendar date/);
  assert.throws(() => parseExplicitDate('2026-8-1'), /expected YYYY-MM-DD/);
});

test('rejects unknown tokens and mixed week/month schemes', () => {
  assert.throws(() => validateFormat('YYY.MM.PATCH'), /unknown CalVer token/);
  assert.throws(() => validateFormat('YYYY.WW.MM.PATCH'), /cannot be combined/);
  assert.throws(() => validateFormat('PATCH'), /calendar token/);
  assert.throws(() => validateFormat('YYYY.PATCH.PATCH'), /at most once/);
});