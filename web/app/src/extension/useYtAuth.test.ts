import { describe, expect, it, vi } from 'vitest';

const signedIn = { browserSignedIn: true, connected: true, signedIn: true, accounts: [], active: null, problem: null };

// The extension answers only after a moment, as it does while the page starts.
vi.mock('@bitchord/shared/bridge', () => ({
  detectExtension: () =>
    new Promise((resolve) =>
      setTimeout(
        () => resolve({ info: { capabilities: ['yt.auth'] }, bridge: { call: async () => signedIn, subscribe: () => () => {} } }),
        50,
      ),
    ),
}));
vi.mock('@/config', () => ({ config: { chromiumExtensionId: 'x' } }));

const { ensureYtAuth } = await import('./useYtAuth');

describe('ensureYtAuth', () => {
  it('waits for the extension instead of answering signed out', async () => {
    await expect(ensureYtAuth()).resolves.toMatchObject({ browserSignedIn: true, signedIn: true });
  });
});
