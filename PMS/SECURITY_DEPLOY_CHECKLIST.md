# Security Deploy Checklist

This checklist covers rollout and operations for:
- Distributed rate limiting
- Private document storage with signed URLs
- Malware scanning and quarantine
- Webhook signature verification
- Agent concurrency protections

## 1. Required Environment Variables

Set these in production before deployment.

### Distributed Rate Limiting (Upstash Redis)
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `RATE_LIMIT_PREFIX` (optional, default: `pms:rl`)

### Signed Document Access
- `DOCUMENT_URL_SIGNING_SECRET` (required, strong random secret)

### Malware Scanning
- `MALWARE_SCAN_ENDPOINT` (required in production)
- `MALWARE_SCAN_TOKEN` (if scanner requires auth)
- `MALWARE_SCAN_REQUIRED=true`
- `MALWARE_SCAN_ALLOW_LOCAL_HEURISTICS=false`

### Webhook Signatures
- `STRIPE_WEBHOOK_SECRET` (already required by Stripe route)
- `SCREENING_WEBHOOK_HMAC_SECRET` (recommended)
- `SCREENING_WEBHOOK_SECRET` (legacy bearer fallback; remove after HMAC migration)

## 2. Deployment Order

1. Deploy scanner service and verify health endpoint.
2. Set all new environment variables in staging.
3. Deploy application to staging.
4. Run authz/security test suites in staging CI.
5. Validate document upload/download/delete flows manually.
6. Validate webhook signature behavior with signed and unsigned test payloads.
7. Promote same config to production.
8. Deploy to production during low-traffic window.

## 3. Post-Deploy Verification

Run these checks immediately after production deploy.

1. Upload a clean PDF and verify:
- Upload succeeds.
- DB `Document.fileUrl` is `private:<fileName>` style.
- UI opens `/api/documents/files/:id?token=...`.

2. Upload a suspicious test sample and verify:
- Upload is rejected.
- Quarantine file appears under `private_uploads/quarantine`.

3. Verify signed URL protections:
- Expired token is rejected (403).
- Token from User A cannot be reused by User B.

4. Verify rate limits:
- Burst requests return `429` with `Retry-After` and `X-RateLimit-*` headers.

5. Verify screening webhook security:
- Valid HMAC request succeeds.
- Invalid signature request returns `401`.

## 4. Secret Rotation Runbook

Use dual-window rotation with zero downtime.

1. Generate new secret values in secret manager.
2. Update environment variables in staging and deploy.
3. Validate signed URLs, webhook verification, and scanner auth.
4. Update production secrets and deploy.
5. Monitor errors for 30 minutes.
6. Revoke old secrets after stable window.

Rotation frequency:
- High-risk webhook/scanner secrets: every 90 days.
- Document signing secret: every 90 days.
- Redis token: every 90 days or after suspected exposure.

## 5. Incident Response Triggers

Escalate immediately if any occur:
- Repeated `Invalid signature` events from unknown sources.
- Sustained malware scan failures (`scanner_not_configured`, scanner 5xx).
- Sudden spike in `429` from trusted internal clients.
- Unexpected increase in quarantined uploads.

Immediate actions:
1. Freeze risky endpoints via WAF/routing rule if abuse is active.
2. Rotate affected secret(s).
3. Pull last 24h request logs and identify source IPs/user IDs.
4. Open incident ticket with timeline and impacted resources.

## 6. Monitoring and Alerts

Set alerts on:
- `429` rate by endpoint and principal key.
- Malware scan verdict counts (`CLEAN`, `SUSPICIOUS`, `ERROR`).
- Webhook auth failures per source.
- Agent action approval conflict errors (`already being handled`).
- Document file read failures on `/api/documents/files/[id]`.

## 7. Cleanup and Migration Tasks

1. Backfill/migrate old `/uploads/documents/*` public files to private storage.
2. Keep legacy read fallback temporarily for migrated records.
3. Remove legacy fallback once migration reaches 100%.
4. Remove `SCREENING_WEBHOOK_SECRET` bearer fallback after HMAC clients fully migrated.

## 8. Rollback Plan

If production errors spike:

1. Keep private file route enabled.
2. Temporarily set `MALWARE_SCAN_REQUIRED=false` only if scanner outage is blocking operations.
3. Keep signed URLs enabled; do not revert to public document links.
4. Keep webhook signature verification enabled for Stripe always.
5. Roll back application version only if required, then re-run verification checklist.

