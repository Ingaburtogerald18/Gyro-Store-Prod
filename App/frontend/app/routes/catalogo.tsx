import type { LoaderFunctionArgs } from '@remix-run/node';
import { loadCatalogListing } from '~/lib/catalog-listing.server';

export const loader = ({ request }: LoaderFunctionArgs) => loadCatalogListing(request, null);

export {
  CatalogListing as default,
  catalogListingHeaders as headers,
  catalogListingMeta as meta,
  catalogListingShouldRevalidate as shouldRevalidate,
} from '~/components/catalog/catalog-listing';
