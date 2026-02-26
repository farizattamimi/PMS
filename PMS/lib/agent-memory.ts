// lib/agent-memory.ts
// Typed helpers for reading/writing to the AgentMemory table.
// The memory store gives the agent a persistent, per-scope key-value
// memory that survives across runs — allowing it to learn and improve.
//
// Scope types:  property | tenant | vendor
// Keys (typed): preferred_vendor_{category} | breach_count | last_intent |
//               compliance_snapshot

import { prisma } from './prisma'

// ─────────────────────────────────────────────────────────────────────────────
// Core read / write
// ─────────────────────────────────────────────────────────────────────────────

export async function readMemory(
  scopeType: string,
  scopeId: string,
  key: string
): Promise<unknown> {
  const entry = await prisma.agentMemory.findUnique({
    where: { scopeType_scopeId_key: { scopeType, scopeId, key } },
    select: { valueJson: true },
  })
  return entry?.valueJson ?? null
}

export async function writeMemory(
  scopeType: string,
  scopeId: string,
  key: string,
  value: unknown,
  confidence?: number
): Promise<void> {
  await prisma.agentMemory.upsert({
    where: { scopeType_scopeId_key: { scopeType, scopeId, key } },
    create: {
      scopeType,
      scopeId,
      key,
      valueJson: value as any,
      confidence: confidence ?? null,
    },
    update: {
      valueJson: value as any,
      confidence: confidence ?? undefined,
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed helpers — Vendor preference (property scope)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the vendorId that last successfully handled a WO of the given
 * category at this property. Returns null if no memory exists yet.
 */
export async function getPreferredVendor(
  propertyId: string,
  category: string
): Promise<string | null> {
  const v = await readMemory('property', propertyId, `preferred_vendor_${category}`)
  if (typeof v === 'string') return v
  return null
}

export async function setPreferredVendor(
  propertyId: string,
  category: string,
  vendorId: string
): Promise<void> {
  await writeMemory('property', propertyId, `preferred_vendor_${category}`, vendorId, 0.9)
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed helpers — Vendor reliability (vendor scope)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns how many times this vendor has breached SLA across all properties.
 */
export async function getVendorBreachCount(vendorId: string): Promise<number> {
  const v = await readMemory('vendor', vendorId, 'breach_count')
  if (typeof v === 'number') return v
  return 0
}

/**
 * Increments the vendor's SLA breach counter by 1.
 */
export async function incrementVendorBreachCount(vendorId: string): Promise<void> {
  const current = await getVendorBreachCount(vendorId)
  await writeMemory('vendor', vendorId, 'breach_count', current + 1)
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed helpers — Tenant context (tenant scope)
// ─────────────────────────────────────────────────────────────────────────────

interface TenantContext {
  lastIntent: string
  messageCount: number
  lastMessageAt: string
}

/**
 * Returns the last classified intent + message count for a tenant.
 */
export async function getTenantContext(
  tenantId: string
): Promise<TenantContext | null> {
  const v = await readMemory('tenant', tenantId, 'comms_context')
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as TenantContext
  }
  return null
}

export async function setTenantContext(
  tenantId: string,
  ctx: TenantContext
): Promise<void> {
  await writeMemory('tenant', tenantId, 'comms_context', ctx)
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed helpers — Compliance snapshot (property scope)
// ─────────────────────────────────────────────────────────────────────────────

interface ComplianceSnapshot {
  lastScanAt: string
  woCreated: number
  exceptions: number
  totalExceptionsAllTime: number
}

export async function getComplianceSnapshot(
  propertyId: string
): Promise<ComplianceSnapshot | null> {
  const v = await readMemory('property', propertyId, 'compliance_snapshot')
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as ComplianceSnapshot
  }
  return null
}

export async function setComplianceSnapshot(
  propertyId: string,
  snap: Omit<ComplianceSnapshot, 'totalExceptionsAllTime'> & { prevExceptionsAllTime: number }
): Promise<void> {
  const snapshot: ComplianceSnapshot = {
    lastScanAt: snap.lastScanAt,
    woCreated: snap.woCreated,
    exceptions: snap.exceptions,
    totalExceptionsAllTime: snap.prevExceptionsAllTime + snap.exceptions,
  }
  await writeMemory('property', propertyId, 'compliance_snapshot', snapshot)
}
