// OpenShopGraph public status page configuration (UptimeFlare)
// Governance: PUBLIC page — component states + uptime only.
// No internal IPs/ports, vendor names, SHAs, quotas or percentages here.

// Don't edit this line
import { MaintenanceConfig, PageConfig, WorkerConfig } from './types/config'

const pageConfig: PageConfig = {
  title: 'OpenShopGraph Status',
  // Same icon the main site serves at openshopgraph.org/favicon.svg
  // (replaces the UptimeFlare default favicon.png, now deleted).
  favicon: '/favicon.svg',
  links: [
    { link: 'https://openshopgraph.org', label: 'openshopgraph.org', highlight: true },
  ],
  // Chrome/copy only — swaps the default "made with UptimeFlare" line for
  // one matching openshopgraph.org's footer tone ("Verified data, not
  // ads."). Monitor semantics below are untouched.
  customFooter:
    '<p class="osg-footer">Verified data, not ads. Independent status page for <a href="https://openshopgraph.org" target="_blank" rel="noopener">openshopgraph.org</a> — powered by <a href="https://github.com/lyc8503/UptimeFlare" target="_blank" rel="noopener">UptimeFlare</a>.</p>',
}

const workerConfig: WorkerConfig = {
  // Reduce D1 write frequency (free-tier friendly); checks still run every minute.
  kvWriteCooldownMinutes: 3,
  monitors: [
    {
      id: 'website',
      name: 'Website',
      method: 'GET',
      target: 'https://openshopgraph.org/en/',
      tooltip: 'Public website (external HTTPS check)',
      statusPageLink: 'https://openshopgraph.org',
      expectedCodes: [200],
      timeout: 10000,
      headers: { 'User-Agent': 'OSG-StatusCheck/1.0 (UptimeFlare)' },
    },
    {
      id: 'api_health',
      name: 'API',
      method: 'GET',
      target: 'https://api.openshopgraph.org/health',
      tooltip: 'Public API health endpoint',
      expectedCodes: [200],
      timeout: 10000,
      headers: { 'User-Agent': 'OSG-StatusCheck/1.0 (UptimeFlare)' },
    },
    {
      id: 'mcp',
      name: 'AI Agent Interface (MCP)',
      method: 'GET',
      target: 'https://api.openshopgraph.org/mcp',
      tooltip: 'MCP endpoint reachability (auth required, 401 = alive)',
      // Endpoint requires auth; a 401 proves the service is up and routing.
      expectedCodes: [200, 401, 405, 406],
      timeout: 10000,
      headers: { 'User-Agent': 'OSG-StatusCheck/1.0 (UptimeFlare)' },
    },
    // NOTE (internal, not a leak — this comment is only in the repo):
    // Enrichment worker / database / deploy pipeline have no public endpoints.
    // They stay on the internal admin view (public-admin behind Cloudflare
    // Access) fed by the Mini collectors. If a stable tunnel hostname for
    // Mini health is created later, add it here as an HTTP monitor.
  ],
  notification: {
    // Wire Pushover here (same account as ops/minimax-usage.sh) — needs the
    // owner's Pushover token/user key; do not commit real keys, use the
    // full-config option of reading from env if desired.
    // webhook: {
    //   url: 'https://api.pushover.net/1/messages.json',
    //   payloadType: 'x-www-form-urlencoded',
    //   payload: { token: 'APP_TOKEN', user: 'USER_KEY', message: '$MSG' },
    // },
    timeZone: 'Europe/Berlin',
    // Avoid flapping alerts: notify only after 3 consecutive failed checks.
    gracePeriod: 3,
  },
}

// No scheduled maintenances currently.
const maintenances: MaintenanceConfig[] = []

// Don't edit this line
export { pageConfig, workerConfig, maintenances }
