const test = require('node:test');
const assert = require('node:assert/strict');
const {
  allocate,
  nextPatch,
  parseExplicitDate,
  releaseYearMonth,
} = require('../src/calver');

test('allocates patch zero for the first release in a month', () => {
  assert.deepEqual(
    allocate([], { dateInput: '2026-08-11' }),
    { version: '2026.8.0', tag: '2026.8.0', year: 2026, month: 8, patch: 0 },
  );
});

test('increments the highest patch in the same month', () => {
  assert.equal(
    nextPatch(['2026.8.0', '2026.8.2', '2026.7.99'], { year: 2026, month: 8 }),
    3,
  );
});

test('supports an optional tag prefix without requiring one', () => {
  assert.equal(
    allocate(['v2026.8.0', '2026.8.8'], { dateInput: '2026-08-11', prefix: 'v' }).tag,
    'v2026.8.1',
  );
});

test('can migrate away from a legacy tag prefix', () => {
  assert.deepEqual(
    allocate(['v2026.8.0', 'v2026.8.3'], {
      dateInput: '2026-08-11',
      prefix: '',
      legacyPrefixes: ['v'],
    }),
    { version: '2026.8.4', tag: '2026.8.4', year: 2026, month: 8, patch: 4 },
  );
});

test('uses the requested timezone for the workflow runtime date', () => {
  const now = new Date('2026-07-31T15:30:00Z');
  assert.deepEqual(releaseYearMonth({ timezone: 'Asia/Tokyo', now }), {
    year: 2026,
    month: 8,
  });
  assert.deepEqual(releaseYearMonth({ timezone: 'UTC', now }), {
    year: 2026,
    month: 7,
  });
});

test('validates explicit calendar dates', () => {
  assert.deepEqual(parseExplicitDate('2026-08-11'), { year: 2026, month: 8 });
  assert.throws(() => parseExplicitDate('2026-02-30'), /invalid calendar date/);
  assert.throws(() => parseExplicitDate('2026-8-1'), /expected YYYY-MM-DD/);
});
