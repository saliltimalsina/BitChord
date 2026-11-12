import { describe, expect, it } from 'vitest';
import { collectionLink, isCollection } from './collections';
import { sourceHref } from './links';

describe('isCollection', () => {
  it('takes albums, playlists, artists and Spotify playlists, not songs', () => {
    expect(['album', 'playlist', 'artist', 'spotify-playlist'].every((kind) => isCollection({ kind: kind as never }))).toBe(true);
    expect(isCollection({ kind: 'song' })).toBe(false);
    expect(isCollection({ kind: 'podcast' })).toBe(false);
  });
});

describe('collectionLink', () => {
  it('links a playlist without its VL prefix', () => {
    expect(collectionLink({ kind: 'playlist', id: 'VLPL123', title: '' })).toBe('https://music.youtube.com/playlist?list=PL123');
  });
  it('links albums and artists by browse id', () => {
    expect(collectionLink({ kind: 'album', id: 'MPREb_x', title: '' })).toBe('https://music.youtube.com/browse/MPREb_x');
    expect(collectionLink({ kind: 'artist', id: 'UCabc', title: '' })).toBe('https://music.youtube.com/channel/UCabc');
  });
  it('links Spotify playlists, and Liked Songs to the collection', () => {
    expect(collectionLink({ kind: 'spotify-playlist', id: '37i9dQZF1DZ06evO0K', title: '' })).toBe('https://open.spotify.com/playlist/37i9dQZF1DZ06evO0K');
    expect(collectionLink({ kind: 'spotify-playlist', id: 'liked', title: '' })).toBe('https://open.spotify.com/collection/tracks');
  });
});

describe('sourceHref', () => {
  it('goes back to the page a queue was started from', () => {
    expect(sourceHref({ title: 'OK Computer', type: 'album', id: 'MPREb_x' })).toBe('/album/MPREb_x');
    expect(sourceHref({ title: 'Black', type: 'playlist', id: 'VLPL1' })).toBe('/playlist/VLPL1');
    expect(sourceHref({ title: 'This Is Radiohead', type: 'playlist', id: 'spotify:37i9' })).toBe('/spotify/playlist/37i9');
    expect(sourceHref({ title: 'Radiohead: Top Songs', type: 'artist', id: 'UCabc' })).toBe('/artist/UCabc');
  });
  it('has nowhere to go for search, radio or a queue without an id', () => {
    expect(sourceHref({ title: 'x', type: 'search', id: 'q' })).toBeNull();
    expect(sourceHref({ title: 'x Radio', type: 'radio', id: 'RDAMVMx' })).toBeNull();
    expect(sourceHref({ title: 'x', type: 'album' })).toBeNull();
    expect(sourceHref(null)).toBeNull();
  });
});
