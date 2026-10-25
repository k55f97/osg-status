// Search-facing identity of the status page. Rendered server-side (see
// components/SeoMarkup.tsx and pages/_app.tsx) so crawlers get it in the first
// HTML response. Public page: no personal names, no internal details.
export const SEO = {
  title: 'OpenShopGraph Status',
  description:
    'Live operational status and uptime of the OpenShopGraph website, API and MCP server.',
  canonical: 'https://status.openshopgraph.com/',
  h1: 'OpenShopGraph Status',
  intro: 'Current status and uptime history of the OpenShopGraph website, API and MCP server.',
}
