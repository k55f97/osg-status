// Pushover alert channel for the status worker.
//
// WHY THIS FILE EXISTS
// The fork ships exactly one built-in notification path, `notification.webhook`
// in uptime.config.ts (dispatched by worker/src/util.ts:82 `webhookNotify`).
// That path takes its credentials from the *committed* config object, so wiring
// Pushover through it would put the app token and the user key into a PUBLIC
// git repository. It stayed commented out for that reason — which meant every
// outage, including an outage of the check regions themselves, notified nobody.
//
// This module sends the same formatted message to Pushover, but reads the two
// credentials from Worker *secret bindings* (env), so nothing secret is ever
// committed. It is deliberately FAIL-CLOSED AND LOUD: if a credential is
// missing the run does not silently skip, it logs an error that names exactly
// what is missing and what the operator has to do.
//
// Same account/endpoint as the Mac mini's existing alert path
// (`~/osg/ops/minimax-usage.sh`, credentials in `~/osg/shared/.env` under the
// keys PUSHOVER_TOKEN / PUSHOVER_USER). Pushover's API is a plain HTTPS POST
// with a form body and needs no SDK, no account beyond the existing one and no
// egress that a Cloudflare Worker cannot do.

/** Secret bindings this channel needs. Optional on purpose: absence is a state
 *  we must detect and report, not a compile error. */
export type PushoverEnv = {
  PUSHOVER_TOKEN?: string
  PUSHOVER_USER?: string
}

const PUSHOVER_API = 'https://api.pushover.net/1/messages.json'

/** Marker every failure of the alert channel itself carries, so it can be
 *  grepped in `wrangler tail` / Workers Logs without knowing this file. */
export const ALERT_CHANNEL_BROKEN = '[ALERT-CHANNEL-BROKEN]'

/**
 * Send one status-change message to Pushover.
 *
 * Never throws: a broken alert channel must not abort the monitoring run that
 * produced the alert. Every failure path logs with `console.error` so it shows
 * up as an error in Workers Logs (observability is on, deploy.tf:38-45).
 */
export async function pushoverNotify(
  env: PushoverEnv | undefined,
  message: string,
  isUp: boolean,
  monitorName: string,
  timeoutMs = 8000
): Promise<boolean> {
  const token = env?.PUSHOVER_TOKEN?.trim()
  const user = env?.PUSHOVER_USER?.trim()

  const missing: string[] = []
  if (!token) missing.push('PUSHOVER_TOKEN')
  if (!user) missing.push('PUSHOVER_USER')
  if (missing.length > 0) {
    // FAIL-CLOSED: no credential -> no alert. Say so loudly instead of
    // returning quietly, otherwise this looks exactly like "all is well".
    console.error(
      `${ALERT_CHANNEL_BROKEN} Pushover alert for "${monitorName}" (${
        isUp ? 'UP' : 'DOWN'
      }) was NOT sent: missing Worker secret(s) ${missing.join(
        ' and '
      )}. Nobody is being notified about outages. Fix: set the GitHub repository secret(s) ` +
        `${missing.join(' and ')} on k55f97/osg-status; deploy.yml passes them as TF_VAR_* and ` +
        `deploy.tf binds them as Worker secrets. Message that was dropped: ${message}`
    )
    return false
  }

  // priority 1 = bypass quiet hours for a real outage, 0 = normal for recovery.
  const body = new URLSearchParams({
    token: token as string,
    user: user as string,
    title: `OpenShopGraph Status: ${monitorName} ${isUp ? 'recovered' : 'DOWN'}`,
    message,
    priority: isUp ? '0' : '1',
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(PUSHOVER_API, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller.signal,
    })
    // Response body is small JSON and carries the error reason on 4xx; it never
    // echoes the credentials back, so it is safe to log. The request body is
    // NOT logged — it contains the token and the user key.
    const text = await resp.text()
    if (!resp.ok) {
      console.error(
        `${ALERT_CHANNEL_BROKEN} Pushover rejected the alert for "${monitorName}": HTTP ${resp.status} ${text}`
      )
      return false
    }
    console.log(`Pushover alert sent for "${monitorName}" (${isUp ? 'UP' : 'DOWN'}): ${text}`)
    return true
  } catch (e) {
    console.error(
      `${ALERT_CHANNEL_BROKEN} Pushover alert for "${monitorName}" could not be delivered: ${e}`
    )
    return false
  } finally {
    clearTimeout(timer)
  }
}
