terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5"
    }
  }
}

provider "cloudflare" {
  # read token from $CLOUDFLARE_API_TOKEN
}

variable "CLOUDFLARE_ACCOUNT_ID" {
  # read account id from $TF_VAR_CLOUDFLARE_ACCOUNT_ID
  type = string
}

variable "enable_do_migration" {
  type    = bool
  default = false
}

# Pushover alert channel (worker/src/pushover.ts). Read from the environment as
# $TF_VAR_PUSHOVER_TOKEN / $TF_VAR_PUSHOVER_USER, which deploy.yml fills from
# the GitHub repository secrets of the same name. Defaulted to "" so a fork or
# a first-time deploy without the secrets still applies cleanly — the worker
# then logs "[ALERT-CHANNEL-BROKEN] … missing Worker secret(s) …" on every
# alert it had to drop, instead of failing silently.
variable "PUSHOVER_TOKEN" {
  type      = string
  sensitive = true
  default   = ""
}

variable "PUSHOVER_USER" {
  type      = string
  sensitive = true
  default   = ""
}

resource "cloudflare_d1_database" "uptimeflare_d1" {
  account_id            = var.CLOUDFLARE_ACCOUNT_ID
  name                  = "uptimeflare_d1"
  read_replication = {
    mode = "auto"
  }
}

resource "cloudflare_workers_script" "uptimeflare_worker" {
  account_id          = var.CLOUDFLARE_ACCOUNT_ID
  script_name         = "uptimeflare_worker"
  main_module         = "worker/dist/index.js"
  content_file        = "worker/dist/index.js"
  content_sha256      = filesha256("worker/dist/index.js")
  compatibility_date  = "2025-04-02"
  compatibility_flags = ["nodejs_compat"]

  observability = {
    enabled = true
    logs = {
      enabled         = true
      invocation_logs = true
    }
  }

  migrations = var.enable_do_migration ? {
    new_tag            = "v1"
    new_sqlite_classes = ["RemoteChecker"]
  } : null

  # `bindings` is authoritative: whatever is NOT listed here is removed from the
  # worker on the next apply. So the Pushover secrets must be bound here — a
  # `wrangler secret put` would survive exactly until the next deploy.
  bindings = concat([{
    name       = "REMOTE_CHECKER_DO"
    class_name = "RemoteChecker"
    type       = "durable_object_namespace"
    }, {
    name = "UPTIMEFLARE_D1"
    type = "d1"
    id   = cloudflare_d1_database.uptimeflare_d1.id
    }],
    # Only bound when both are actually supplied; Cloudflare rejects an empty
    # secret_text, and a half-configured channel would be worse than none.
    var.PUSHOVER_TOKEN != "" && var.PUSHOVER_USER != "" ? [{
      name = "PUSHOVER_TOKEN"
      type = "secret_text"
      text = var.PUSHOVER_TOKEN
      }, {
      name = "PUSHOVER_USER"
      type = "secret_text"
      text = var.PUSHOVER_USER
  }] : [])
}

resource "cloudflare_workers_cron_trigger" "uptimeflare_worker_cron" {
  account_id  = var.CLOUDFLARE_ACCOUNT_ID
  script_name = cloudflare_workers_script.uptimeflare_worker.script_name
  schedules = [{
    # Was "* * * * *" (every 1 minute) until 2026-09-01. CF log breakdown that
    # day: OSG-StatusCheck was the single largest UA on openshopgraph.com,
    # 31.2% of 18k requests/24h (~79% of the "dynamic" bucket) — 5 monitors x
    # 1,440 fires/day = 7,200 origin requests/day for a PUBLIC STATUS PAGE,
    # not a paging SLA. At gracePeriod=3 (uptime.config.ts) a 1-minute cron
    # pages after ~3-4 min of downtime; a 3-minute cron pages after ~9-12 min,
    # which is fine for an uptime display. New: 5 monitors x 480 fires/day =
    # 2,400 requests/day (-66.7%).
    cron = "*/3 * * * *" # every 3 minutes
  }]
}

resource "cloudflare_pages_project" "uptimeflare" {
  account_id        = var.CLOUDFLARE_ACCOUNT_ID
  name              = "uptimeflare"
  production_branch = "main"

  deployment_configs = {
    # SMH Cloudflare provider will throw an error without preview config
    preview = {
      fail_open = false
    }
    production = {
      d1_databases = {
        UPTIMEFLARE_D1 = {
          id = cloudflare_d1_database.uptimeflare_d1.id
        }
      }
      compatibility_date  = "2025-04-02"
      compatibility_flags = ["nodejs_compat"]
      fail_open           = false
    }
  }

  # SMH it will error without this build_config
  build_config = {
    root_dir = "/"
  }
}
