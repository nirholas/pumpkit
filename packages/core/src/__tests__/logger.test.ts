import { describe, it, expect, beforeEach, vi } from 'vitest';
import { log, setLogLevel, getLogLevel } from '../logger.js';

describe('logger', () => {
  beforeEach(() => {
    setLogLevel('info');
  });

  it('defaults to info level', () => {
    expect(getLogLevel()).toBe('info');
  });

  it('setLogLevel changes the level', () => {
    setLogLevel('debug');
    expect(getLogLevel()).toBe('debug');
    setLogLevel('error');
    expect(getLogLevel()).toBe('error');
  });

  it('logs info messages when level is info', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    log.info('hello %s', 'world');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0]).toMatch(/\[INFO\] hello world/);
    spy.mockRestore();
  });

  it('suppresses debug messages when level is info', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    log.debug('should be hidden');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('shows debug messages when level is debug', () => {
    setLogLevel('debug');
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    log.debug('visible now');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0]).toMatch(/\[DEBUG\] visible now/);
    spy.mockRestore();
  });

  it('logs warn messages', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    log.warn('something bad');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0]).toMatch(/\[WARN\] something bad/);
    spy.mockRestore();
  });

  it('logs error messages', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    log.error('fatal: %d', 42);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0]).toMatch(/\[ERROR\] fatal: 42/);
    spy.mockRestore();
  });

  it('suppresses info when level is warn', () => {
    setLogLevel('warn');
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    log.info('hidden');
    log.warn('visible');
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledOnce();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('includes ISO timestamp in output', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    log.info('test');
    // ISO format: 2024-01-01T00:00:00.000Z
    expect(spy.mock.calls[0]![0]).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    spy.mockRestore();
  });
});
