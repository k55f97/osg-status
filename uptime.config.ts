// OpenShopGraph public status page configuration (UptimeFlare)
// Governance: PUBLIC page — component states + uptime only.
// No internal IPs/ports, vendor names, SHAs, quotas or percentages here.

// Don't edit this line
import { MaintenanceConfig, PageConfig, WorkerConfig } from './types/config'

// CANONICAL HOST: openshopgraph.com
//
// openshopgraph.org and api.openshopgraph.org are redirects to the .com
// hostnames and nothing else (measured 2026-08-17):
//   https://openshopgraph.org/en/          301 -> https://openshopgraph.com/en/
//   https://api.openshopgraph.org/<path>   308 -> https://api.openshopgraph.com/<path>
// Every target and every visitor-facing link below therefore names .com. The
// .org names stay alive as redirects so existing references keep working; they
// are simply not what this page should measure or point at.
const pageConfig: PageConfig = {
  title: 'OpenShopGraph Status',
  // Same icon the main site serves at /favicon.svg
  // (replaces the UptimeFlare default favicon.png, now deleted).
  favicon: '/favicon.svg',
  links: [{ link: 'https://openshopgraph.com', label: 'openshopgraph.com', highlight: true }],
  // Chrome/copy only — swaps the default "made with UptimeFlare" line for
  // one matching openshopgraph.com's footer tone ("Verified data, not
  // ads."). Monitor semantics below are untouched.
  customFooter:
    '<p class="osg-footer">Verified data, not ads. Independent status page for <a href="https://openshopgraph.com" target="_blank" rel="noopener">openshopgraph.com</a> — powered by <a href="https://github.com/lyc8503/UptimeFlare" target="_blank" rel="noopener">UptimeFlare</a>.</p>',
}

const workerConfig: WorkerConfig = {
  // Reduce D1 write frequency (free-tier friendly); checks still run every minute.
  kvWriteCooldownMinutes: 3,
  //
  // TARGET RULE: point every monitor at the address that actually serves the
  // response — never at a redirect to it, never at a path the service does not
  // serve. Two distinct traps, both measured 2026-08-17:
  //
  // 1. REDIRECTS. Until this change all five monitors named .org, so each check
  //    was two requests, not one. monitor.ts:313 calls fetch() without a
  //    `redirect` option, and the Workers default is `redirect: 'follow'` — so
  //    the hop is followed silently and `response.status` is the FINAL 200. The
  //    redirect is therefore invisible in the recorded state: it never showed
  //    up as a status, only as latency. Cost, 3 runs each, curl -L:
  //      openshopgraph.org/en/        0.430 s, 2 TLS connects
  //      openshopgraph.com/en/        0.198 s, 1 TLS connect
  //      api.openshopgraph.org/health 0.544 s, 2 TLS connects
  //      api.openshopgraph.com/health 0.223 s, 1 TLS connect
  //    Every response time this page has ever published was roughly DOUBLE the
  //    service's own, because it timed the redirect too. And because both hops
  //    collapse into one status, "the redirect broke" and "the origin broke"
  //    were the same red bar with no way to tell them apart.
  //
  // 2. WRONG PATH. api.openshopgraph.com/ returns 404 on the bare root — only
  //    /health, /ready and /mcp are served. A monitor aimed at the API root
  //    would sit at a permanent, meaningless red. No monitor here does that;
  //    the entries below name explicit paths on purpose. Do not "simplify" one
  //    to the bare host.
  //
  // Verified for each target below before it was written in (curl, no -L, so
  // the first response is the one shown):
  //   https://openshopgraph.com/en/          200
  //   https://api.openshopgraph.com/health   200
  //   https://api.openshopgraph.com/ready    200
  //   https://api.openshopgraph.com/mcp      405  (within expectedCodes)
  monitors: [
    {
      id: 'website',
      name: 'Website',
      method: 'GET',
      target: 'https://openshopgraph.com/en/',
      tooltip: 'Public website (external HTTPS check)',
      statusPageLink: 'https://openshopgraph.com',
      expectedCodes: [200],
      timeout: 10000,
      headers: { 'User-Agent': 'OSG-StatusCheck/1.0 (UptimeFlare)' },
    },
    {
      id: 'api_health',
      name: 'API',
      method: 'GET',
      target: 'https://api.openshopgraph.com/health',
      tooltip: 'Public API health endpoint',
      expectedCodes: [200],
      timeout: 10000,
      headers: { 'User-Agent': 'OSG-StatusCheck/1.0 (UptimeFlare)' },
    },
    {
      id: 'api_ready',
      name: 'API Readiness',
      method: 'GET',
      target: 'https://api.openshopgraph.com/ready',
      // Different question than api_health above: /health says "the process
      // is alive", /ready says "I can serve real requests" — it runs a real
      // DB query (repos.shops.count()) and fails closed with 503+reason if
      // that query fails. Same expectedCodes semantics as api_health: only
      // 200 passes, 503 (or any other code) counts as down. Verified against
      // worker/src/monitor.ts:getStatus (this file's own check function,
      // unmodified) with a local test target: 200 -> up:true, 503 -> up:false
      // with err "Expected codes: [200], Got: 503". Before this entry, /ready
      // had no caller at all — no readinessProbe, no compose check, no
      // monitoring script, just an OpenAPI doc line.
      tooltip: 'Public API readiness (DB reachable), separate from /health',
      expectedCodes: [200],
      timeout: 10000,
      headers: { 'User-Agent': 'OSG-StatusCheck/1.0 (UptimeFlare)' },
    },
    {
      id: 'mcp',
      name: 'AI Agent Interface (MCP)',
      method: 'GET',
      target: 'https://api.openshopgraph.com/mcp',
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

    // ---------------------------------------------------------------------
    // SECOND CHECK REGION — exactly one, for the website only.
    //
    // Why: measured 2026-07-31 from the live compacted state, 456 of 456
    // latency samples (152 per monitor, the 12h window) carry loc "LHR" —
    // a single run-length entry per monitor, no second value. Every monitor
    // above omits `checkProxy`, so each check runs in whatever colo the cron
    // worker was scheduled in. One vantage point cannot distinguish "the
    // service is down" from "the route from this one colo is down".
    //
    // How it works (worker/src/monitor.ts:361-401): `checkProxy` is ONE
    // value per monitor, not a list. A second region therefore means one
    // extra monitor entry, not an extra field.
    //   'worker://<hint>'  -> REMOTE_CHECKER_DO with a DurableObjectLocationHint:
    //                         wnam | enam | sam | weur | eeur | apac | oc | afr | me
    //   'globalping://...' -> Globalping probes instead of a Cloudflare DO
    //
    // `checkProxyFallback: true` is MANDATORY here, not cosmetic. Without it
    // monitor.ts:397-400 records a failure of the PROBE as `up: false` with
    // "Unknown check proxy error" — a probe outage would be published as a
    // service outage (fail-closed on the wrong axis). With it, monitor.ts:395-396
    // re-checks the target locally and the run is reported from the local
    // colo, so the page never claims a region it did not actually measure.
    //
    // Load — count the RPC calls, not the checks. monitor.ts:369-378 makes
    // TWO calls on the DO stub per check: `getLocationAndStatus()` and then
    // `kill()`. Cloudflare bills every RPC method call on a stub as its own
    // session, i.e. as one request. Cron is `* * * * *` (deploy.tf:64-69),
    // so this one extra monitor costs 2 x 1440 = 2,880 DO requests/day.
    // Free plan cap: 100,000 DO requests/day -> 2.88% used, and room for
    // about 34 region monitors in total, not ~69. Add them one at a time.
    {
      id: 'website_enam',
      name: 'Website (North America)',
      method: 'GET',
      target: 'https://openshopgraph.com/en/',
      tooltip: 'Public website, checked from a North American vantage point',
      statusPageLink: 'https://openshopgraph.com',
      expectedCodes: [200],
      timeout: 10000,
      headers: { 'User-Agent': 'OSG-StatusCheck/1.0 (UptimeFlare)' },
      checkProxy: 'worker://enam',
      // See above — never remove this without removing checkProxy too.
      checkProxyFallback: true,
    },
    // Further regions (apac, weur, …) stay OFF until this one has carried a
    // full window cleanly. Same shape, one entry each, fallback always true.
    // ---------------------------------------------------------------------
  ],
  notification: {
    // ALERT CHANNEL — Pushover, wired in worker/src/pushover.ts.
    //
    // `webhook` stays UNSET here on purpose and is not a gap: the upstream
    // webhook path (worker/src/util.ts:83) reads its credentials out of THIS
    // committed object, and this repository is public, so a Pushover app token
    // and user key cannot live here. The fork sends the identical formatted
    // message from Worker SECRET bindings instead (PUSHOVER_TOKEN /
    // PUSHOVER_USER, see worker/src/index.ts Env and deploy.tf).
    //
    // Everything below still applies to it: it is dispatched by the same
    // `formatAndNotify`, so skipNotificationIds, maintenance windows and the
    // grace period gate Pushover exactly as they gated the webhook.
    //
    // If the secrets are not set, the channel is FAIL-CLOSED AND LOUD: every
    // dropped alert logs `[ALERT-CHANNEL-BROKEN] … missing Worker secret(s) …`
    // as an error, so an outage nobody could be told about is itself visible.
    timeZone: 'Europe/Berlin',
    // Avoid flapping alerts: notify only after 3 consecutive failed checks.
    gracePeriod: 3,
  },
}

// No scheduled maintenances currently.
const maintenances: MaintenanceConfig[] = []

// Don't edit this line
export { pageConfig, workerConfig, maintenances }
