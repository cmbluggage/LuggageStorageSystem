/** Canonical site origin, used for metadataBase, sitemap, robots, and OG tags.
 *  Set NEXT_PUBLIC_SITE_URL in deployment env vars once the production domain is live. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://luggagestoragecolombo.com').replace(/\/$/, '');
