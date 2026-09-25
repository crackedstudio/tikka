/**
 * Environment guard tests (#1563)
 *
 * These helpers are what keep the wallet adapters importable in Node, so they
 * are exercised directly: every read of a browser global has to degrade to a
 * value (`undefined` / `false`) instead of throwing.
 */

import {
  getGlobalObject,
  getGlobalProperty,
  hasGlobalProperty,
  isBrowserEnvironment,
  isNodeEnvironment,
} from './environment';

const globals = globalThis as any;

describe('environment guards', () => {
  afterEach(() => {
    delete globals.window;
    delete globals.document;
    delete globals.rabet;
    delete globals.xbull;
  });

  describe('getGlobalObject()', () => {
    it('returns the global object', () => {
      expect(getGlobalObject()).toBe(globalThis);
    });
  });

  describe('getGlobalProperty() / hasGlobalProperty()', () => {
    it('reads an injected extension global', () => {
      globals.rabet = { connect: () => 'ok' };

      expect(getGlobalProperty<{ connect: () => string }>('rabet')?.connect()).toBe('ok');
      expect(hasGlobalProperty('rabet')).toBe(true);
    });

    it('returns undefined for a missing global instead of throwing', () => {
      expect(getGlobalProperty('tikka-global-that-does-not-exist')).toBeUndefined();
      expect(hasGlobalProperty('tikka-global-that-does-not-exist')).toBe(false);
    });

    it('treats an explicitly undefined global as absent', () => {
      globals.xbull = undefined;

      expect(hasGlobalProperty('xbull')).toBe(false);
    });
  });

  describe('isBrowserEnvironment()', () => {
    it('is false in the Node test environment', () => {
      expect(isBrowserEnvironment()).toBe(false);
    });

    it('requires both window and document', () => {
      globals.window = {};
      expect(isBrowserEnvironment()).toBe(false);

      globals.document = {};
      expect(isBrowserEnvironment()).toBe(true);

      delete globals.window;
      expect(isBrowserEnvironment()).toBe(false);
    });
  });

  describe('isNodeEnvironment()', () => {
    it('is true in the Node test environment', () => {
      expect(isNodeEnvironment()).toBe(true);
    });

    it('is false once a browser document is present', () => {
      globals.window = {};
      globals.document = {};

      expect(isNodeEnvironment()).toBe(false);
    });
  });
});
