const DAY_MS = 24 * 60 * 60 * 1000;
const TOKENS = ['PATCH', 'YYYY', '0Y', 'YY', '0M', 'MM', '0W', 'WW', '0D', 'DD'];
const CALENDAR_TOKENS = new Set(['YYYY', 'YY', '0Y', 'MM', '0M', 'WW', '0W', 'DD', '0D']);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function weekOfYear({ year, month, day }) {
  const start = Date.UTC(year, 0, 1);
  const current = Date.UTC(year, month - 1, day);
  const dayOfYear = Math.floor((current - start) / DAY_MS) + 1;
  return Math.floor((dayOfYear - 1) / 7) + 1;
}

function withWeek(parts) {
  return { ...parts, week: weekOfYear(parts) };
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
  return withWeek({ year, month, day });
}

function releaseDateParts({ dateInput = '', timezone = 'UTC', now = new Date() } = {}) {
  if (dateInput) {
    return parseExplicitDate(dateInput);
  }

  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const year = Number(formatted.find((part) => part.type === 'year')?.value);
  const month = Number(formatted.find((part) => part.type === 'month')?.value);
  const day = Number(formatted.find((part) => part.type === 'day')?.value);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`could not resolve release date in timezone ${JSON.stringify(timezone)}`);
  }
  return withWeek({ year, month, day });
}

function tokenizeFormat(format) {
  if (!format) throw new Error('format must not be empty');
  const pieces = [];
  let index = 0;
  while (index < format.length) {
    const token = TOKENS.find((candidate) => format.startsWith(candidate, index));
    if (token) {
      pieces.push({ token });
      index += token.length;
      continue;
    }
    const character = format[index];
    if (/[A-Z]/.test(character)) {
      throw new Error(`unknown CalVer token near ${JSON.stringify(format.slice(index))}`);
    }
    pieces.push({ literal: character });
    index += 1;
  }
  return pieces;
}

function validateFormat(format) {
  const pieces = tokenizeFormat(format);
  const tokens = pieces.filter((piece) => piece.token).map((piece) => piece.token);
  if (!tokens.some((token) => CALENDAR_TOKENS.has(token))) {
    throw new Error('format must include at least one calendar token');
  }
  if (tokens.filter((token) => token === 'PATCH').length > 1) {
    throw new Error('format may contain PATCH at most once');
  }
  const hasWeek = tokens.some((token) => token === 'WW' || token === '0W');
  const hasMonthOrDay = tokens.some((token) => ['MM', '0M', 'DD', '0D'].includes(token));
  if (hasWeek && hasMonthOrDay) {
    throw new Error('week tokens (WW/0W) cannot be combined with month/day tokens');
  }
  return { pieces, hasPatch: tokens.includes('PATCH') };
}

function tokenValue(token, parts, patch) {
  switch (token) {
    case 'YYYY':
      return String(parts.year);
    case 'YY': {
      const relative = parts.year - 2000;
      if (relative < 0) throw new Error('YY requires a release year of 2000 or later');
      return String(relative);
    }
    case '0Y': {
      const relative = parts.year - 2000;
      if (relative < 0) throw new Error('0Y requires a release year of 2000 or later');
      return String(relative).padStart(2, '0');
    }
    case 'MM':
      return String(parts.month);
    case '0M':
      return String(parts.month).padStart(2, '0');
    case 'WW':
      return String(parts.week);
    case '0W':
      return String(parts.week).padStart(2, '0');
    case 'DD':
      return String(parts.day);
    case '0D':
      return String(parts.day).padStart(2, '0');
    case 'PATCH':
      if (!Number.isSafeInteger(patch) || patch < 0) {
        throw new Error('PATCH requires a non-negative safe integer');
      }
      return String(patch);
    default:
      throw new Error(`unsupported CalVer token ${token}`);
  }
}

function renderFormat(formatInfo, parts, patch) {
  return formatInfo.pieces
    .map((piece) => (piece.token ? tokenValue(piece.token, parts, patch) : piece.literal))
    .join('');
}

function formatRegex(formatInfo, parts) {
  return formatInfo.pieces
    .map((piece) => {
      if (piece.token === 'PATCH') return '(\\d+)';
      if (piece.token) return escapeRegex(tokenValue(piece.token, parts, null));
      return escapeRegex(piece.literal);
    })
    .join('');
}

function nextPatch(tags, { format = 'YYYY.MM.PATCH', parts, prefix = '', legacyPrefixes = [] }) {
  const formatInfo = validateFormat(format);
  if (!formatInfo.hasPatch) throw new Error('nextPatch requires a format containing PATCH');
  const prefixes = [...new Set([prefix, ...legacyPrefixes])];
  const body = formatRegex(formatInfo, parts);
  const patterns = prefixes.map((candidate) => new RegExp(`^${escapeRegex(candidate)}${body}$`));
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

function exactTagExists(tags, version, prefixes) {
  const candidates = new Set(prefixes.map((prefix) => `${prefix}${version}`));
  return tags.some((tag) => candidates.has(tag.trim()));
}

function allocate(tags, options = {}) {
  const {
    format = 'YYYY.MM.PATCH',
    prefix = '',
    legacyPrefixes = [],
  } = options;
  const parts = releaseDateParts(options);
  const formatInfo = validateFormat(format);
  const prefixes = [...new Set([prefix, ...legacyPrefixes])];

  let patch = null;
  if (formatInfo.hasPatch) {
    patch = nextPatch(tags, { format, parts, prefix, legacyPrefixes });
  }
  const version = renderFormat(formatInfo, parts, patch);
  if (!formatInfo.hasPatch && exactTagExists(tags, version, prefixes)) {
    throw new Error(
      `CalVer collision: ${JSON.stringify(version)} already exists and format ${JSON.stringify(format)} has no PATCH counter`,
    );
  }

  return {
    version,
    tag: `${prefix}${version}`,
    year: parts.year,
    month: parts.month,
    week: parts.week,
    day: parts.day,
    patch,
  };
}

module.exports = {
  allocate,
  nextPatch,
  parseExplicitDate,
  releaseDateParts,
  tokenizeFormat,
  validateFormat,
  weekOfYear,
};