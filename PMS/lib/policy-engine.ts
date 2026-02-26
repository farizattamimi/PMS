// lib/policy-engine.ts
// Deterministic policy evaluator — no side effects, no I/O.
// Loaded policy config comes from AgentPolicy.configJson or DEFAULT_POLICY.

export type PolicyDecision = 'ALLOW' | 'APPROVAL' | 'BLOCK'

export interface PolicyResult {
  decision: PolicyDecision
  reason: string
}

export interface PolicyConfig {
  spend: {
    autoApproveMax: number
    requireApprovalAbove: number
    hardBlockAbove: number
  }
  workOrders: {
    autoAssignAllowedCategories: string[]
    emergencyAlwaysEscalate: boolean
    maxOpenPerVendor: number
  }
  messaging: {
    quietHours: { start: string; end: string }
    allowedAutoIntents: string[]
    legalKeywordsEscalate: boolean
  }
  compliance: {
    criticalDaysBeforeDue: number
    autoCreateTasks: boolean
    overdueAlwaysEscalate: boolean
  }
  escalation: {
    channels: string[]
    criticalAlsoSms: boolean
  }
}

export const DEFAULT_POLICY: PolicyConfig = {
  spend: {
    autoApproveMax: 750,
    requireApprovalAbove: 750,
    hardBlockAbove: 5000,
  },
  workOrders: {
    autoAssignAllowedCategories: ['PLUMBING', 'HVAC', 'ELECTRICAL', 'GENERAL'],
    emergencyAlwaysEscalate: true,
    maxOpenPerVendor: 25,
  },
  messaging: {
    quietHours: { start: '21:00', end: '07:00' },
    allowedAutoIntents: ['STATUS_UPDATE', 'FAQ', 'MAINTENANCE_INTAKE', 'RENEWAL_INFO'],
    legalKeywordsEscalate: true,
  },
  compliance: {
    criticalDaysBeforeDue: 7,
    autoCreateTasks: true,
    overdueAlwaysEscalate: true,
  },
  escalation: {
    channels: ['in_app', 'email'],
    criticalAlsoSms: false,
  },
}

export interface EvaluateInput {
  actionType: string
  context: Record<string, unknown>
}

/**
 * Pure deterministic policy evaluator.
 * Returns ALLOW | APPROVAL | BLOCK with a human-readable reason code.
 */
export function evaluateAction(
  input: EvaluateInput,
  policy: PolicyConfig = DEFAULT_POLICY
): PolicyResult {
  const { actionType, context } = input

  switch (actionType) {
    case 'SPEND_APPROVE': {
      const amount = (context.amount as number) ?? 0
      if (amount > policy.spend.hardBlockAbove) {
        return {
          decision: 'BLOCK',
          reason: `Spend $${amount} exceeds hard block limit of $${policy.spend.hardBlockAbove}`,
        }
      }
      if (amount > policy.spend.autoApproveMax) {
        return {
          decision: 'APPROVAL',
          reason: `Spend $${amount} exceeds auto-approve limit of $${policy.spend.autoApproveMax}; manager approval required`,
        }
      }
      return { decision: 'ALLOW', reason: `Spend $${amount} within auto-approve limit` }
    }

    case 'WO_ASSIGN_VENDOR': {
      const category = (context.category as string) ?? ''
      const priority = (context.priority as string) ?? ''
      const openCount = (context.vendorOpenWOCount as number) ?? 0

      if (priority === 'EMERGENCY' && policy.workOrders.emergencyAlwaysEscalate) {
        return { decision: 'BLOCK', reason: 'Emergency priority WO requires human escalation' }
      }
      if (!policy.workOrders.autoAssignAllowedCategories.includes(category)) {
        return {
          decision: 'APPROVAL',
          reason: `Category "${category}" not in auto-assign whitelist`,
        }
      }
      if (openCount >= policy.workOrders.maxOpenPerVendor) {
        return {
          decision: 'APPROVAL',
          reason: `Vendor already has ${openCount} open WOs (max ${policy.workOrders.maxOpenPerVendor})`,
        }
      }
      return { decision: 'ALLOW', reason: `Auto-assign allowed for category "${category}"` }
    }

    case 'WO_BID_REQUEST': {
      // Bid requests are always permitted — they reduce rather than commit spend
      return { decision: 'ALLOW', reason: 'Bid request collection is always permitted' }
    }

    case 'WO_CREATE': {
      const priority = (context.priority as string) ?? ''
      if (priority === 'EMERGENCY' && policy.workOrders.emergencyAlwaysEscalate) {
        return { decision: 'BLOCK', reason: 'Emergency WO creation requires human review' }
      }
      return { decision: 'ALLOW', reason: 'Work order creation is within policy' }
    }

    case 'MESSAGE_SEND': {
      const intent = (context.intent as string) ?? ''
      const hasLegalKeywords = (context.hasLegalKeywords as boolean) ?? false

      if (hasLegalKeywords && policy.messaging.legalKeywordsEscalate) {
        return {
          decision: 'BLOCK',
          reason: 'Message contains legal keywords — requires human review before sending',
        }
      }
      if (!policy.messaging.allowedAutoIntents.includes(intent)) {
        return {
          decision: 'APPROVAL',
          reason: `Intent "${intent}" is not in the allowed auto-send list`,
        }
      }
      const now = new Date()
      if (isInQuietHours(now, policy.messaging.quietHours.start, policy.messaging.quietHours.end)) {
        return {
          decision: 'APPROVAL',
          reason: `Message blocked by quiet hours (${policy.messaging.quietHours.start}–${policy.messaging.quietHours.end})`,
        }
      }
      return { decision: 'ALLOW', reason: `Auto-send permitted for intent "${intent}"` }
    }

    case 'COMPLIANCE_TASK_CREATE': {
      if (!policy.compliance.autoCreateTasks) {
        return {
          decision: 'APPROVAL',
          reason: 'Auto-creation of compliance tasks is disabled by policy',
        }
      }
      const isOverdue = (context.isOverdue as boolean) ?? false
      if (isOverdue && policy.compliance.overdueAlwaysEscalate) {
        return {
          decision: 'BLOCK',
          reason: 'Overdue compliance item requires immediate human escalation',
        }
      }
      return { decision: 'ALLOW', reason: 'Compliance task auto-creation is within policy' }
    }

    case 'ESCALATE': {
      // Escalations are always permitted — they are the safety valve
      return { decision: 'ALLOW', reason: 'Escalation is always permitted' }
    }

    default: {
      return {
        decision: 'APPROVAL',
        reason: `Unknown action type "${actionType}" — defaulting to require manager approval`,
      }
    }
  }
}

/**
 * Returns true if `now` falls within the quiet-hours window.
 * Handles overnight windows (e.g. 21:00–07:00).
 */
export function isInQuietHours(now: Date, start: string, end: string): boolean {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em

  if (startMin < endMin) {
    // Same-day window e.g. 09:00–17:00
    return nowMin >= startMin && nowMin < endMin
  } else {
    // Overnight window e.g. 21:00–07:00
    return nowMin >= startMin || nowMin < endMin
  }
}

/**
 * Merge a stored configJson (partial) over the DEFAULT_POLICY.
 */
export function mergePolicy(stored: unknown): PolicyConfig {
  if (!stored || typeof stored !== 'object') return DEFAULT_POLICY
  const s = stored as Partial<PolicyConfig>
  return {
    spend: { ...DEFAULT_POLICY.spend, ...(s.spend ?? {}) },
    workOrders: { ...DEFAULT_POLICY.workOrders, ...(s.workOrders ?? {}) },
    messaging: {
      ...DEFAULT_POLICY.messaging,
      ...(s.messaging ?? {}),
      quietHours: {
        ...DEFAULT_POLICY.messaging.quietHours,
        ...((s.messaging as PolicyConfig['messaging'])?.quietHours ?? {}),
      },
    },
    compliance: { ...DEFAULT_POLICY.compliance, ...(s.compliance ?? {}) },
    escalation: { ...DEFAULT_POLICY.escalation, ...(s.escalation ?? {}) },
  }
}
