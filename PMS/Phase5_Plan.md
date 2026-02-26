# Phase 5 Plan: Inspections, PM Scheduling, Bid Management, Tenant Messaging, Compliance, Benchmarking

## Context

Phase 4 delivered: Asset Registry, Vendor Credentialing & Reviews, Lease Renewal Workflow, Incident & Complaint Logging, Budget Management, WO Attachments, Exception Alerts Widget, Vacancy & WO Analytics.

Phase 5 addresses the next tier of gaps across all four ProductModules — features that build on the Phase 4 foundation.

---

## Gap Analysis After Phase 4

| Area | Remaining Gap |
|---|---|
| Module 1 – Tenant | No messaging/communication hub between manager and tenant; no retention campaigns |
| Module 2 – Vendor | No bid/quote workflow; no automated dispatch |
| Module 3 – Asset | No inspection model; no preventive maintenance scheduling |
| Module 4 – Portfolio | No compliance tracking; no cross-property benchmarking |

---

## What We're NOT Building in Phase 5

- AI/LLM layer (Claude API integration, predictive scoring, NLP)
- IoT/sensor monitoring
- SMS notifications (Twilio)
- External accounting integrations (Yardi, AppFolio, QuickBooks)
- Vendor marketplace / AI dispatch
- Retention campaign automation

---

## Phase 5 Build Plan: 6 Tasks

---

### Task A: Inspection Management (Module 3)

**Why first:** Inspections are the primary data-collection mechanism for Asset condition. Move-in/move-out inspections are also legally significant for deposit disputes.

**Schema additions:**

```prisma
model Inspection {
  id           String           @id @default(cuid())
  propertyId   String
  property     Property         @relation(fields: [propertyId], references: [id])
  unitId       String?
  unit         Unit?            @relation(fields: [unitId], references: [id])
  type         InspectionType
  status       InspectionStatus @default(SCHEDULED)
  scheduledAt  DateTime
  completedAt  DateTime?
  conductedBy  String           // userId
  notes        String?
  items        InspectionItem[]
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt
}

model InspectionItem {
  id           String          @id @default(cuid())
  inspectionId String
  inspection   Inspection      @relation(fields: [inspectionId], references: [id], onDelete: Cascade)
  assetId      String?
  asset        Asset?          @relation(fields: [assetId], references: [id])
  area         String          // "Kitchen", "Bathroom 1", "Living Room"
  condition    AssetCondition  // reuse existing enum: GOOD / FAIR / POOR / FAILED
  notes        String?
  photoDocId   String?         // Document.id for photo
}

enum InspectionType   { MOVE_IN, MOVE_OUT, ROUTINE, DRIVE_BY }
enum InspectionStatus { SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED }
```

**Relation additions:**
- `Property`: `inspections Inspection[]`
- `Unit`: `inspections Inspection[]`
- `Asset`: `inspectionItems InspectionItem[]`

**API:**
- `GET /api/inspections` — list; filter by propertyId, unitId, type, status
- `POST /api/inspections` — create with items array
- `GET /api/inspections/[id]` — detail with items + asset info
- `PATCH /api/inspections/[id]` — update status, completedAt, notes
- `POST /api/inspections/[id]/items` — add item
- `PATCH /api/inspections/[id]/items/[itemId]` — update item condition/notes/photo

**UI:**
- `/dashboard/inspections` — list page: table with property, unit, type, scheduled date, status badge, "View" link
- `/dashboard/inspections/[id]` — detail page: header with metadata, items list grouped by area, condition badge per item, photo thumbnail if attached, "Complete Inspection" button
- Property detail page → 9th tab "Inspections": table of all inspections for that property, "Schedule Inspection" button → modal (type, unit, date)
- Exception alerts: surface SCHEDULED inspections more than 7 days overdue

---

### Task B: Preventive Maintenance Scheduling (Module 3)

**Why:** Asset Registry exists but there's no recurring work order generation. PM schedules turn the asset registry into a proactive maintenance system.

**Schema additions:**

```prisma
model PMSchedule {
  id             String    @id @default(cuid())
  assetId        String
  asset          Asset     @relation(fields: [assetId], references: [id])
  title          String    // "Annual HVAC Filter Replacement"
  description    String?
  frequencyDays  Int       // 30, 90, 180, 365
  lastRunAt      DateTime?
  nextDueAt      DateTime
  vendorId       String?
  vendor         Vendor?   @relation(fields: [vendorId], references: [id])
  autoCreateWO   Boolean   @default(true)
  isActive       Boolean   @default(true)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}
```

**Relation additions:**
- `Asset`: `pmSchedules PMSchedule[]`
- `Vendor`: `pmSchedules PMSchedule[]`

**API:**
- `GET /api/pm-schedules` — list; filter by assetId, propertyId (via asset.propertyId), isDue
- `POST /api/pm-schedules` — create
- `PATCH /api/pm-schedules/[id]` — update (pause/resume, change frequency)
- `DELETE /api/pm-schedules/[id]`
- `GET /api/cron/pm-due` — secured by CRON_SECRET; finds schedules where `nextDueAt <= now AND isActive = true`; creates WorkOrder per schedule; updates `lastRunAt` and `nextDueAt = now + frequencyDays`

**UI:**
- Property detail → Assets tab: below asset table, add "PM Schedules" section listing all schedules across all property assets. "Add Schedule" button.
- Asset detail (slide-over or inline expand): shows PM schedules for that asset with next due date, countdown chip.
- Cron endpoint: add to `/api/cron/lease-expiry` documentation or create separate endpoint. Add to exception alerts if any schedule is overdue by > 7 days.

---

### Task C: Bid Management (Module 2)

**Why:** High-cost work orders should go through a quote process before vendor assignment. No bid/RFQ workflow exists.

**Schema additions:**

```prisma
model BidRequest {
  id          String    @id @default(cuid())
  workOrderId String
  workOrder   WorkOrder @relation(fields: [workOrderId], references: [id])
  vendorId    String
  vendor      Vendor    @relation(fields: [vendorId], references: [id])
  status      BidStatus @default(PENDING)
  amount      Float?
  notes       String?
  sentAt      DateTime  @default(now())
  respondedAt DateTime?
  createdAt   DateTime  @default(now())
}

enum BidStatus { PENDING, SUBMITTED, ACCEPTED, DECLINED }
```

**Relation additions:**
- `WorkOrder`: `bids BidRequest[]`
- `Vendor`: `bids BidRequest[]`

**API:**
- `GET /api/workorders/[id]/bids` — list bids for a WO
- `POST /api/workorders/[id]/bids` — send bid request to vendor(s)
- `PATCH /api/workorders/[id]/bids/[bidId]` — vendor submits amount/notes, or manager accepts/declines
  - Accepting a bid: sets `assignedVendorId` on the WorkOrder, sets other bids to DECLINED, sends notification to accepted vendor

**UI:**
- Work Order detail page: add "Bids" section (shown when WO is in NEW or ASSIGNED status)
  - "Request Bid" button → select one or more vendors (matching WO category) → sends notification
  - Bid list: vendor name, status badge, submitted amount (if any), accept button
- Vendor notification: "You've received a bid request for WO #..." with link
- Work Order list: add bid count chip on rows that have pending bids

---

### Task D: Tenant Communication Hub (Module 1)

**Why:** No structured messaging exists between managers and tenants. All communication is one-way (system notifications). This closes the largest tenant experience gap.

**Schema additions:**

```prisma
model MessageThread {
  id          String    @id @default(cuid())
  propertyId  String
  property    Property  @relation(fields: [propertyId], references: [id])
  tenantId    String
  tenant      Tenant    @relation(fields: [tenantId], references: [id])
  subject     String
  status      ThreadStatus @default(OPEN)
  messages    Message[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model Message {
  id          String        @id @default(cuid())
  threadId    String
  thread      MessageThread @relation(fields: [threadId], references: [id])
  authorId    String        // userId
  body        String
  readAt      DateTime?
  createdAt   DateTime      @default(now())
}

enum ThreadStatus { OPEN, CLOSED }
```

**Relation additions:**
- `Property`: `threads MessageThread[]`
- `Tenant`: `threads MessageThread[]`

**API:**
- `GET /api/messages/threads` — list threads; TENANT sees only their own; MANAGER sees all for their properties
- `POST /api/messages/threads` — create thread (tenant or manager can initiate)
- `GET /api/messages/threads/[id]` — full thread with messages; marks messages as read
- `POST /api/messages/threads/[id]/messages` — post a reply; creates in-app notification for the other party
- `PATCH /api/messages/threads/[id]` — close/reopen thread

**UI:**
- `/dashboard/messages` — inbox page: thread list with subject, last message preview, unread count badge, tenant name (for managers), last activity time
- `/dashboard/messages/[id]` — thread view: chat-style message bubbles, reply text area, "Close Thread" button for managers
- Sidebar: add "Messages" nav item (all roles)
- Topbar bell: message unread count merged with notification unread count (or separate)
- Tenant dashboard quick action: "Message Manager" → `/dashboard/messages`
- Manager dashboard: unread messages count in KPI row

**Middleware:** Add `/dashboard/messages` to TENANT allowed paths.

---

### Task E: Compliance & Regulatory Tracking (Module 4 + Module 2)

**Why:** Properties have regulatory deadlines (fire inspections, elevator certificates, health permits). No model exists to track these. Missed deadlines = fines.

**Schema additions:**

```prisma
model ComplianceItem {
  id           String           @id @default(cuid())
  propertyId   String
  property     Property         @relation(fields: [propertyId], references: [id])
  title        String           // "Annual Fire Inspection", "Elevator Certificate"
  category     ComplianceCategory
  authority    String?          // "City Fire Marshal", "State DOL"
  dueDate      DateTime
  renewalDays  Int?             // if recurring, days between renewals
  status       ComplianceStatus @default(PENDING)
  completedAt  DateTime?
  docId        String?          // Document.id for certificate/permit
  notes        String?
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt
}

enum ComplianceCategory { FIRE_SAFETY, ELEVATOR, HEALTH_PERMIT, BUILDING_PERMIT, HVAC_CERT, ELECTRICAL, PLUMBING, OTHER }
enum ComplianceStatus   { PENDING, IN_PROGRESS, COMPLIANT, OVERDUE, WAIVED }
```

**Relation additions:**
- `Property`: `complianceItems ComplianceItem[]`

**API:**
- `GET /api/compliance` — list; filter by propertyId, status, category
- `POST /api/compliance` — create
- `PATCH /api/compliance/[id]` — update status, completedAt, docId
- `DELETE /api/compliance/[id]`
- Cron: extend `/api/cron/lease-expiry` (or new `/api/cron/compliance-check`) — find items due within 30 days; create notifications for managers; mark OVERDUE if past due

**UI:**
- `/dashboard/compliance` — list page: table with property, title, category, due date, status badge, days-until countdown (red if < 30, yellow if < 60). "Add Item" button.
- Property detail → 10th tab "Compliance": filtered view for that property
- Sidebar: add "Compliance" nav item (ADMIN/MANAGER only)
- Exception alerts: surface OVERDUE items and items due within 30 days

---

### Task F: Cross-Property Benchmarking (Module 4)

**Why:** Portfolio managers need peer comparison to understand whether a property is performing above or below portfolio average. Spec explicitly calls this out.

**No schema change needed.** Derive from existing data.

**API:**
- `GET /api/reports/benchmarks` — computes per-property metrics and portfolio averages:
  - Occupancy % (occupied units / total units)
  - Avg days to fill vacancy (from UnitStatus change to new lease start)
  - Avg WO resolution time (hours from NEW to COMPLETED)
  - Rent per sq ft (avg across occupied units)
  - Maintenance cost per unit (total WO costs / unit count, last 90 days)
  - Open incident count
  - Returns: `{ properties: [...metrics], portfolio: {...avg} }`

**UI:**
- `/dashboard/reporting/benchmarks` — benchmarking page:
  - Header KPI row: portfolio averages for each metric
  - Grouped BarChart (recharts): each group = one metric, bars = properties, with portfolio average as a reference line
  - Table below: one row per property, all metrics side-by-side, cells color-coded green (above avg) / red (below avg) / gray (average)
- Reporting page: add "Benchmarking" link alongside Rent Roll and Vacancy links

---

## Schema Migration Summary

All changes via `prisma db push`:

**New models:** `Inspection`, `InspectionItem`, `PMSchedule`, `BidRequest`, `MessageThread`, `Message`, `ComplianceItem`

**New enums:** `InspectionType`, `InspectionStatus`, `BidStatus`, `ThreadStatus`, `ComplianceCategory`, `ComplianceStatus`

**Relation additions on existing models:**
- `Property`: `inspections`, `threads`, `complianceItems`
- `Unit`: `inspections`
- `Asset`: `inspectionItems`, `pmSchedules`
- `Vendor`: `pmSchedules`, `bids`
- `Tenant`: `threads`
- `WorkOrder`: `bids`

---

## Execution Sequence

```
Step 1: prisma db push (all schema changes at once)
Step 2: API routes for A (inspections) + C (bids) + E (compliance) — parallel
Step 3: API routes for B (pm-schedules) + D (messages) + F (benchmarks) — parallel
Step 4: UI for A (inspection list + detail + property tab) — parallel with B + E
Step 5: UI for C (bids on WO detail) + D (messages inbox + thread) + E (compliance page) + F (benchmarks) — parallel
Step 6: Cron updates (pm-due, compliance check), sidebar + middleware updates
Step 7: npx tsc --noEmit — must pass clean
```

---

## Files to Create / Modify

**Schema:**
- `prisma/schema.prisma`

**New API routes:**
- `app/api/inspections/route.ts`
- `app/api/inspections/[id]/route.ts`
- `app/api/inspections/[id]/items/[itemId]/route.ts`
- `app/api/pm-schedules/route.ts`
- `app/api/pm-schedules/[id]/route.ts`
- `app/api/cron/pm-due/route.ts`
- `app/api/workorders/[id]/bids/route.ts`
- `app/api/workorders/[id]/bids/[bidId]/route.ts`
- `app/api/messages/threads/route.ts`
- `app/api/messages/threads/[id]/route.ts`
- `app/api/messages/threads/[id]/messages/route.ts`
- `app/api/compliance/route.ts`
- `app/api/compliance/[id]/route.ts`
- `app/api/reports/benchmarks/route.ts`

**Modified API routes:**
- `app/api/cron/lease-expiry/route.ts` — add compliance overdue check
- `app/api/dashboard/route.ts` — add overdue inspections + compliance exceptions

**New pages:**
- `app/(dashboard)/dashboard/inspections/page.tsx`
- `app/(dashboard)/dashboard/inspections/[id]/page.tsx`
- `app/(dashboard)/dashboard/messages/page.tsx`
- `app/(dashboard)/dashboard/messages/[id]/page.tsx`
- `app/(dashboard)/dashboard/compliance/page.tsx`
- `app/(dashboard)/dashboard/reporting/benchmarks/page.tsx`

**Modified pages:**
- `app/(dashboard)/dashboard/properties/[id]/page.tsx` — add Inspections tab (9th), Compliance tab (10th)
- `app/(dashboard)/dashboard/workorders/[id]/page.tsx` — add Bids section
- `app/(dashboard)/dashboard/reporting/page.tsx` — add Benchmarking link
- `components/layout/Sidebar.tsx` — add Messages + Compliance nav items
- `middleware.ts` — add /dashboard/messages to TENANT allowed paths

---

## Verification

- `npx tsc --noEmit` — must pass clean
- Test inspection create → add items → complete inspection → condition propagates to asset
- Test PM schedule cron: create schedule with nextDueAt in past → run cron → WO auto-created
- Test bid flow: request bid → vendor sees notification → submit amount → manager accepts → WO assignedVendorId updated
- Test message thread: manager creates thread → tenant sees it in /dashboard/messages → tenant replies → manager notified
- Test compliance item: create with due date < 30 days → exception alert shown on dashboard → mark compliant → exception clears
- Test benchmarks: verify per-property metrics are mathematically correct against known data
