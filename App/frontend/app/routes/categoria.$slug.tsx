import type { LoaderFunctionArgs } from '@remix-run/node';
import { loadCatalogListing } from '~/lib/catalog-listing.server';

export const loader = (args: LoaderFunctionArgs) => loadCatalogListing(args, args.params.slug ?? '');

export {
  CatalogListing as default,
  catalogListingHeaders as headers,
  catalogListingMeta as meta,
  catalogListingShouldRevalidate as shouldRevalidate,
} from '~/components/catalog/catalog-listing';
