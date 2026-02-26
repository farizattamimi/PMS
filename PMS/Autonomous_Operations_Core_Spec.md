# Autonomous Operations Core Spec

## Objective

Build a vertical AI agent layer that executes end-to-end property operations autonomously and escalates only urgent or policy-blocked exceptions to human managers.

Primary success metric:
- >=80% of routine operational tasks completed without manager interaction.

Non-goals (Phase 1):
- Fully autonomous legal actions (eviction/legal notices).
- Unbounded financial authority.
- Replacing all external integrations on day one.

---

## 1) System Blueprint

### 1.1 Core Components

1. Policy Engine (deterministic guardrails)
- Determines if an action is auto-allowed, requires approval, or must be blocked.
- Inputs: role policy, property policy, spend thresholds, SLA rules, legal/compliance constraints.
- Output: decision + reason codes.

2. Agent Runtime (planner/executor/verifier)
- Planner: converts goals/events to ordered task graph.
- Executor: calls existing APIs/tools.
- Verifier: validates expected state transitions and retries/fallbacks.
- Memory: stores scoped context snapshots and learned preferences.

3. Event Bus + Scheduler
- Event-driven triggers (new incident, due compliance item, overdue PM, tenant message, etc.).
- Scheduled recurring runs (hourly/daily).
- Idempotent processing with dedupe keys.

4. Exception Inbox
- Single surface for manager escalations only.
- Includes context pack: summary, evidence, blocked rule, requested human decision.

5. Trust/Audit Layer
- Immutable action logs for every agent decision and side-effect.
- Replay support for incident investigation.

### 1.2 Reuse Existing APIs

Use your current endpoints as tool interfaces first (no rewrite):
- Work orders: `/api/workorders*`
- Messages: `/api/messages/threads*`
- Vendors/bids: `/api/vendors*`, `/api/workorders/[id]/bids*`
- Compliance: `/api/compliance*`
- PM/inspections: `/api/pm-schedules*`, `/api/inspections*`
- Leases/applications: `/api/leases*`, `/api/applications*`
- Notifications: `/api/notifications*`

Wrap these as internal tool definitions for the agent runtime.

---

## 2) Data Model Additions (Prisma)

Add these models.

### 2.1 Policies

```prisma
model AgentPolicy {
  id             String   @id @default(cuid())
  scopeType      String   // "global" | "property" | "portfolio"
  scopeId        String?  // propertyId when scopeType=property
  isActive       Boolean  @default(true)
  configJson     Json     // thresholds, allowed actions, escalation rules
  version        Int      @default(1)
  createdById    String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

### 2.2 Agent Run/Plan/Action Logs

```prisma
model AgentRun {
  id               String   @id @default(cuid())
  triggerType      String   // "event" | "schedule" | "manual"
  triggerRef       String?  // event id / schedule id
  propertyId       String?
  status           String   // "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "ESCALATED"
  startedAt        DateTime?
  completedAt      DateTime?
  summary          String?
  error            String?
  createdAt        DateTime @default(now())

  steps            AgentStep[]
}

model AgentStep {
  id               String   @id @default(cuid())
  runId            String
  run              AgentRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  stepOrder        Int
  name             String
  status           String   // "PLANNED" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED"
  inputJson        Json?
  outputJson       Json?
  startedAt        DateTime?
  completedAt      DateTime?
  error            String?
}

model AgentActionLog {
  id               String   @id @default(cuid())
  runId            String
  stepId           String?
  actionType       String   // "API_CALL" | "DECISION" | "ESCALATION"
  target           String   // endpoint/tool name
  requestJson      Json?
  responseJson     Json?
  policyDecision   String?  // "ALLOW" | "APPROVAL" | "BLOCK"
  policyReason     String?
  createdAt        DateTime @default(now())

  @@index([runId, createdAt])
}
```

### 2.3 Exceptions Inbox

```prisma
model AgentException {
  id               String   @id @default(cuid())
  runId            String?
  propertyId       String?
  severity         String   // "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  category         String   // "LEGAL" | "FINANCIAL" | "SAFETY" | "SLA" | "SYSTEM"
  title            String
  details          String
  contextJson      Json?
  status           String   @default("OPEN") // "OPEN" | "ACK" | "RESOLVED"
  requiresBy       DateTime?
  resolvedById     String?
  resolvedAt       DateTime?
  createdAt        DateTime @default(now())
}
```

### 2.4 Optional Memory (Phase 2)

```prisma
model AgentMemory {
  id               String   @id @default(cuid())
  scopeType        String   // "property" | "tenant" | "vendor"
  scopeId          String
  key              String
  valueJson        Json
  confidence       Float?
  updatedAt        DateTime @updatedAt

  @@unique([scopeType, scopeId, key])
}
```

---

## 3) Service/API Layer

Create internal APIs first, then UI.

### 3.1 Policy APIs
- `GET /api/agent/policies?scopeType=&scopeId=`
- `POST /api/agent/policies` (create/update by versioning)
- `POST /api/agent/policies/evaluate` (dry-run action against policy)

### 3.2 Runtime APIs
- `POST /api/agent/runs` (manual trigger)
- `GET /api/agent/runs?status=&propertyId=`
- `GET /api/agent/runs/[id]` (steps/actions/timeline)
- `POST /api/agent/runs/[id]/cancel`

### 3.3 Event Intake APIs
- `POST /api/agent/events` (internal event publisher)
- `POST /api/agent/cron/tick` (scheduler trigger)

### 3.4 Exceptions APIs
- `GET /api/agent/exceptions`
- `PATCH /api/agent/exceptions/[id]` (ack/resolve)
- `POST /api/agent/exceptions/[id]/decision` (human decision payload)

---

## 4) Runtime Design

### 4.1 Execution Flow
1. Receive trigger (event/schedule/manual).
2. Build context bundle (property, tenants, open WOs, vendor stats, compliance/PM state).
3. Planner emits task graph with explicit expected outcomes.
4. For each task:
   - Evaluate policy.
   - If ALLOW: execute tool/API call.
   - If APPROVAL/BLOCK: create exception and pause/branch.
5. Verifier checks state changed as intended.
6. On failure: retry with bounded attempts, then escalate.
7. Persist run summary and KPIs.

### 4.2 Idempotency
- Every run has deterministic dedupe key:
  - `hash(triggerType + triggerRef + propertyId + dateBucket)`
- Tool calls include idempotency metadata where possible.

### 4.3 Retry/Fallback Rules
- Transient failures: exponential backoff, max 3 tries.
- Permanent validation/policy failures: no retry, escalate.
- Partial completion: mark run `ESCALATED` with completed step list.

---

## 5) First Autonomous Workflows (Build First)

### Workflow A: Maintenance Autopilot
Trigger:
- New tenant issue message or incident, or PM due.

Autonomous path:
1. Classify issue and map to WO category/priority.
2. Create/update work order.
3. If high-cost: request bids; else choose vendor by policy + historical score.
4. Dispatch vendor and send tenant acknowledgement.
5. Follow up on SLA timers; auto-escalate if no vendor response.
6. Closeout + tenant satisfaction ping + vendor review prompt.

Escalate when:
- Safety/legal risk, spend exceeds threshold, no vendor coverage, repeated failure.

### Workflow B: Tenant Comms Autopilot
Trigger:
- New message thread or incoming message.

Autonomous path:
1. Intent classify (maintenance/billing/lease/info/complaint).
2. Resolve with policy-grounded response or dispatch related action.
3. Keep thread state and notifications updated.

Escalate when:
- Harassment/legal threats, discrimination claims, injury/safety, eviction/legal notice contexts.

### Workflow C: Compliance + PM Autopilot
Trigger:
- Daily schedule tick.

Autonomous path:
1. Scan due/overdue compliance and PM schedules.
2. Auto-create WOs/tasks and notify assigned parties.
3. Re-check completion and update statuses.

Escalate when:
- Deadline breach within critical window, failed task after retries.

---

## 6) Policy Schema (configJson draft)

```json
{
  "spend": {
    "autoApproveMax": 750,
    "requireApprovalAbove": 750,
    "hardBlockAbove": 5000
  },
  "workOrders": {
    "autoAssignAllowedCategories": ["PLUMBING", "HVAC", "ELECTRICAL", "GENERAL"],
    "emergencyAlwaysEscalate": true,
    "maxOpenPerVendor": 25
  },
  "messaging": {
    "quietHours": { "start": "21:00", "end": "07:00" },
    "allowedAutoIntents": ["STATUS_UPDATE", "FAQ", "MAINTENANCE_INTAKE", "RENEWAL_INFO"],
    "legalKeywordsEscalate": true
  },
  "compliance": {
    "criticalDaysBeforeDue": 7,
    "autoCreateTasks": true,
    "overdueAlwaysEscalate": true
  },
  "escalation": {
    "channels": ["in_app", "email"],
    "criticalAlsoSms": false
  }
}
```

---

## 7) Manager Experience (Exception-Only)

Create an `Autonomous Ops` section with:
- Exceptions inbox (sorted by severity + due-by).
- Run history (latest runs, outcomes, failure clusters).
- Policy editor with dry-run simulator.
- KPI panel:
  - Autonomous resolution rate
  - Escalation rate by category
  - SLA attainment
  - Cost per resolved work order
  - Repeat issue rate

No full manual workflow entry points from this view except override actions.

---

## 8) Reliability, Safety, Compliance

- Every agent action writes `AgentActionLog` + existing `AuditLog`.
- Include policy reason codes in user-visible exception context.
- PII boundaries:
  - Tool payload redaction for logs where needed.
- Hard kill-switch:
  - global flag disables autonomous execution and reverts to notify-only mode.
- Legal-safe defaults:
  - block autonomous irreversible legal/financial actions until explicitly enabled.

---

## 9) Rollout Plan

### Phase 0 (1 sprint): Foundations
- Add new Prisma models + migrations.
- Build policy evaluator + run/step/action persistence.
- Build event queue and worker skeleton.

### Phase 1 (1-2 sprints): Maintenance Autopilot MVP
- Implement Workflow A with strict spend guardrails.
- Add exception inbox UI and run timeline UI.
- Canary on 1-2 properties.

### Phase 2 (1 sprint): Messaging Autopilot
- Intent routing + controlled auto-replies + action linking.
- Escalation taxonomy and legal keyword controls.

### Phase 3 (1 sprint): Compliance/PM Autopilot
- Scheduled autonomous loops with overdue escalation.
- KPI instrumentation complete.

### Phase 4: Scale + Learning
- Add memory and adaptive vendor strategy.
- Add portfolio-level optimization.

---

## 10) Immediate Build Checklist (next 2 weeks)

1. Implement Prisma migration for `AgentPolicy`, `AgentRun`, `AgentStep`, `AgentActionLog`, `AgentException`.
2. Add `lib/policy-engine.ts` with deterministic evaluator and reason codes.
3. Add `lib/agent-runtime.ts` (planner/executor/verifier interfaces).
4. Add `/api/agent/runs`, `/api/agent/policies/evaluate`, `/api/agent/exceptions`.
5. Build worker loop (`tsx` worker process) polling queued runs.
6. Wire one workflow end-to-end: PM due -> WO create -> vendor assign -> notify -> verify.
7. Add tests:
   - policy evaluator unit tests
   - run idempotency tests
   - failure/retry/escalation tests
8. Ship manager Exception Inbox page with ack/resolve actions.

---

## 11) Definition of Done (MVP)

- Agent autonomously resolves >=50% of PM-due generated maintenance tasks on canary properties.
- Zero unauthorized actions (policy tests pass).
- All escalations include actionable context and reason code.
- Run replay available for every failed or escalated run.
- Manager time spent on routine maintenance coordination reduced by >=40% on canary.
