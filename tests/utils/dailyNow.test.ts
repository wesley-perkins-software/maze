import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDailyNow } from '../../src/lib/utils/dailyNow';

// Helpers to stub window.location.search and hostname.
function stubLocation(search: string, hostname: string) {
  vi.stubGlobal('window', {
    location: { search, hostname },
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getDailyNow — no override', () => {
  it('returns a Date close to now when no param is set', () => {
    stubLocation('', 'localhost');
    const before = Date.now();
    const result = getDailyNow();
    const after = Date.now();
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.getTime()).toBeLessThanOrEqual(after);
  });

  it('returns a Date close to now when dailyNow param is absent', () => {
    stubLocation('?otherParam=foo', 'localhost');
    const before = Date.now();
    const result = getDailyNow();
    const after = Date.now();
    expect(result.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.getTime()).toBeLessThanOrEqual(after);
  });

  // Note: the production hostname guard (mazethis.com / www.mazethis.com) relies on
  // import.meta.env.DEV being false, which is always true in Vitest. That guard is
  // verified at runtime; the unit tests below cover the allowed-host code paths.
});

describe('getDailyNow — override allowed (localhost)', () => {
  it('returns the parsed override date on localhost', () => {
    stubLocation('?dailyNow=2026-05-21T23:59:50', 'localhost');
    const result = getDailyNow();
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2026-05-21T23:59:50.000Z');
  });

  it('returns the parsed override date on 127.0.0.1', () => {
    stubLocation('?dailyNow=2026-05-22T00:00:10', '127.0.0.1');
    const result = getDailyNow();
    expect(result.toISOString()).toBe('2026-05-22T00:00:10.000Z');
  });

  it('returns the parsed override date on a Netlify preview hostname', () => {
    stubLocation('?dailyNow=2026-05-21T12:00:00', 'deploy-preview-42--mazethis.netlify.app');
    const result = getDailyNow();
    expect(result.toISOString()).toBe('2026-05-21T12:00:00.000Z');
  });
});

describe('getDailyNow — invalid override falls back to now', () => {
  it('falls back to now for a non-date string', () => {
    stubLocation('?dailyNow=not-a-date', 'localhost');
    const before = Date.now();
    const result = getDailyNow();
    const after = Date.now();
    expect(result.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.getTime()).toBeLessThanOrEqual(after);
  });

  it('falls back to now for an empty dailyNow value', () => {
    stubLocation('?dailyNow=', 'localhost');
    const before = Date.now();
    const result = getDailyNow();
    const after = Date.now();
    expect(result.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.getTime()).toBeLessThanOrEqual(after);
  });
});
