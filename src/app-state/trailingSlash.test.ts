import { describe, expect, it } from 'vitest';
import { withoutTrailingSlash } from './trailingSlash';

describe('an address asked for with a slash at the end', () => {
  it('is sent on to the same address without the slash, keeping its query and its hash', () => {
    expect(withoutTrailingSlash('/home/')).toBe('/home');
    expect(withoutTrailingSlash('/practice/marathon/')).toBe('/practice/marathon');
    expect(withoutTrailingSlash('/playground/', '?topics=ledger', '#top')).toBe('/playground?topics=ledger#top');
    expect(withoutTrailingSlash('/topics//')).toBe('/topics');
  });

  it('is left alone when there is no slash to drop, so a page that does not exist is never redirected in a loop', () => {
    expect(withoutTrailingSlash('/')).toBeNull();
    expect(withoutTrailingSlash('/no-such-page')).toBeNull();
    expect(withoutTrailingSlash('/topics/ledger')).toBeNull();
  });
});
