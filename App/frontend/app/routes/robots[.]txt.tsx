import type { LoaderFunctionArgs } from '@remix-run/node';
import { buildRobots } from '~/lib/seo';
import { siteOrigin } from '~/lib/site-url.server';

export function loader({ request }: LoaderFunctionArgs) {
  return new Response(buildRobots(siteOrigin(request)), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
