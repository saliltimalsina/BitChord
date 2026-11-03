import { describe, expect, it } from 'vitest';
import { acceptsDrop } from './songDrag';

describe('dropping songs on a sidebar playlist', () => {
  const addable = [{ playlistId: 'PLmine' }, { playlistId: 'VLPLalso' }];
  it('takes them only on playlists Add to Playlist offers, VL or not', () => {
    expect(acceptsDrop('VLPLmine', addable)).toBe(true);
    expect(acceptsDrop('PLalso', addable)).toBe(true);
    expect(acceptsDrop('VLPLsomeoneElses', addable)).toBe(false);
  });
  it('takes nothing before the list has loaded', () => {
    expect(acceptsDrop('VLPLmine', undefined)).toBe(false);
  });
});
