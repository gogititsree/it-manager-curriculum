import { describe, expect, it } from 'vitest';
import { toDatabaseUrl } from '../src/index.js';

describe('toDatabaseUrl', () => {
  it('maps :memory: to the libsql in-memory url', () => {
    expect(toDatabaseUrl(':memory:')).toBe('file::memory:');
  });

  it('passes an existing file: url through untouched', () => {
    expect(toDatabaseUrl('file:///C:/data/itmc.db')).toBe('file:///C:/data/itmc.db');
  });

  it('encodes characters that are URL-significant, so a # in a path cannot start a fragment', () => {
    const url = toDatabaseUrl('./a#b/itmc.db');
    expect(url.startsWith('file:///')).toBe(true);
    expect(url).not.toContain('#');
    expect(url).toContain('%23');
  });

  it('encodes spaces rather than leaving them raw', () => {
    expect(toDatabaseUrl('./my data/itmc.db')).toContain('%20');
  });

  it('produces an absolute url from a relative path', () => {
    expect(toDatabaseUrl('./data/itmc.db')).toMatch(/^file:\/\/\/.+data\/itmc\.db$/);
  });
});
