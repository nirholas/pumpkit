import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { requireEnv, optionalEnv, parseListEnv, parseIntEnv } from '../config.js';

describe('config', () => {
  const ENV_BACKUP: Record<string, string | undefined> = {};

  function setEnv(key: string, value: string) {
    ENV_BACKUP[key] = process.env[key];
    process.env[key] = value;
  }

  function clearEnv(key: string) {
    ENV_BACKUP[key] = process.env[key];
    delete process.env[key];
  }

  afterEach(() => {
    for (const [key, value] of Object.entries(ENV_BACKUP)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe('requireEnv', () => {
    it('returns the value when set', () => {
      setEnv('TEST_REQ', 'hello');
      expect(requireEnv('TEST_REQ')).toBe('hello');
    });

    it('throws when missing', () => {
      clearEnv('TEST_REQ_MISSING');
      expect(() => requireEnv('TEST_REQ_MISSING')).toThrow('Missing required environment variable: TEST_REQ_MISSING');
    });

    it('throws when empty string', () => {
      setEnv('TEST_REQ_EMPTY', '');
      expect(() => requireEnv('TEST_REQ_EMPTY')).toThrow();
    });
  });

  describe('optionalEnv', () => {
    it('returns the value when set', () => {
      setEnv('TEST_OPT', 'value');
      expect(optionalEnv('TEST_OPT', 'default')).toBe('value');
    });

    it('returns default when missing', () => {
      clearEnv('TEST_OPT_MISSING');
      expect(optionalEnv('TEST_OPT_MISSING', 'fallback')).toBe('fallback');
    });

    it('returns default when empty', () => {
      setEnv('TEST_OPT_EMPTY', '');
      expect(optionalEnv('TEST_OPT_EMPTY', 'fallback')).toBe('fallback');
    });
  });

  describe('parseListEnv', () => {
    it('splits comma-separated values', () => {
      setEnv('TEST_LIST', 'a, b, c');
      expect(parseListEnv('TEST_LIST')).toEqual(['a', 'b', 'c']);
    });

    it('trims whitespace', () => {
      setEnv('TEST_LIST_WS', '  foo , bar  ');
      expect(parseListEnv('TEST_LIST_WS')).toEqual(['foo', 'bar']);
    });

    it('returns empty array when missing', () => {
      clearEnv('TEST_LIST_MISS');
      expect(parseListEnv('TEST_LIST_MISS')).toEqual([]);
    });

    it('filters out empty entries', () => {
      setEnv('TEST_LIST_EMPTY', 'a,,b, ,c');
      expect(parseListEnv('TEST_LIST_EMPTY')).toEqual(['a', 'b', 'c']);
    });
  });

  describe('parseIntEnv', () => {
    it('parses integer values', () => {
      setEnv('TEST_INT', '42');
      expect(parseIntEnv('TEST_INT', 0)).toBe(42);
    });

    it('returns default when missing', () => {
      clearEnv('TEST_INT_MISS');
      expect(parseIntEnv('TEST_INT_MISS', 99)).toBe(99);
    });

    it('returns default for non-numeric strings', () => {
      setEnv('TEST_INT_NAN', 'abc');
      expect(parseIntEnv('TEST_INT_NAN', 10)).toBe(10);
    });

    it('handles negative numbers', () => {
      setEnv('TEST_INT_NEG', '-5');
      expect(parseIntEnv('TEST_INT_NEG', 0)).toBe(-5);
    });
  });
});
