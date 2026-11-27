/**
 * The address a page lives at when it was asked for with a slash at the end. The site is a static export whose pages
 * are files such as `home.html`, so `/home` is found and `/home/` is not; the not-found page sends a learner who typed
 * or followed `/home/` on to `/home`. Null when the path has no slash to drop (the root, or a path without one), so a
 * page that does not exist under either spelling is not redirected in a loop.
 */
export function withoutTrailingSlash(pathname: string, search = '', hash = ''): string | null {
  const trimmed = pathname.replace(/\/+$/, '');
  if (trimmed === '' || trimmed === pathname) return null;
  return `${trimmed}${search}${hash}`;
}
