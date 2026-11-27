import { NotFoundView } from '@/components/NotFoundView';

/** Every address the site does not have (the static export writes it as 404.html, which the server answers with). */
export default function NotFound() {
  return <NotFoundView />;
}
