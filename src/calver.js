function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseExplicitDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`invalid date ${JSON.stringify(value)}; expected YYYY-MM-DD`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`invalid calendar date ${JSON.stringify(value)}`);
  }
  return { year, month };
}

function releaseYearMonth({ dateInput = '', timezone = 'UTC', now = new Date() } = {}) {
  if (dateInput) {
    return parseExplicitDate(dateInput);
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new Error(`could not resolve release date in timezone ${JSON.stringify(timezone)}`);
  }
  return { year, month };
}

function nextPatch(tags, { year, month, prefix = '', legacyPrefixes = [] }) {
  const prefixes = [...new Set([prefix, ...legacyPrefixes])];
  const patterns = prefixes.map(
    (candidate) => new RegExp(`^${escapeRegex(candidate)}${year}\\.${month}\\.(\\d+)$`),
  );
  let maxPatch = -1;
  for (const tag of tags) {
    for (const pattern of patterns) {
      const match = pattern.exec(tag.trim());
      if (!match) continue;
      const patch = Number(match[1]);
      if (!Number.isSafeInteger(patch)) {
        throw new Error(`patch in tag ${JSON.stringify(tag)} exceeds JavaScript safe integer range`);
      }
      maxPatch = Math.max(maxPatch, patch);
      break;
    }
  }
  return maxPatch + 1;
}

function allocate(tags, options = {}) {
  const { prefix = '', legacyPrefixes = [] } = options;
  const { year, month } = releaseYearMonth(options);
  const patch = nextPatch(tags, { year, month, prefix, legacyPrefixes });
  const version = `${year}.${month}.${patch}`;
  return {
    version,
    tag: `${prefix}${version}`,
    year,
    month,
    patch,
  };
}

module.exports = {
  allocate,
  nextPatch,
  parseExplicitDate,
  releaseYearMonth,
};
