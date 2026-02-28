// ── Tenant Screening Provider ────────────────────────────────────────────────

export interface ScreeningRequest {
  applicationId: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  currentAddress?: string
  employer?: string
  monthlyIncome?: number
  desiredRent?: number
}

export interface ScreeningResult {
  creditScore: number
  creditStatus: 'CLEAR' | 'FLAG' | 'FAIL'
  creditNotes: string
  backgroundStatus: 'CLEAR' | 'FLAG' | 'FAIL'
  backgroundNotes: string
  evictionStatus: 'CLEAR' | 'FLAG' | 'FAIL'
  evictionNotes: string
  incomeVerified: boolean
  incomeRatio: number | null
  incomeStatus: 'CLEAR' | 'FLAG' | 'FAIL'
  incomeNotes: string
  overallStatus: 'CLEAR' | 'FLAG' | 'FAIL'
  providerRef: string
  rawResponse: Record<string, unknown>
}

export interface ScreeningProvider {
  runScreening(req: ScreeningRequest): Promise<ScreeningResult>
}

// ── Mock implementation ─────────────────────────────────────────────────────

function hashEmail(email: string): number {
  let hash = 0
  for (let i = 0; i < email.length; i++) {
    hash = ((hash << 5) - hash + email.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export class MockScreeningProvider implements ScreeningProvider {
  async runScreening(req: ScreeningRequest): Promise<ScreeningResult> {
    const h = hashEmail(req.email)

    // Credit score: deterministic 580–820 range based on email hash
    const creditScore = 580 + (h % 241)

    const creditStatus: 'CLEAR' | 'FLAG' | 'FAIL' =
      creditScore >= 700 ? 'CLEAR' : creditScore >= 620 ? 'FLAG' : 'FAIL'

    const creditNotes =
      creditScore >= 700
        ? 'Good credit history. No delinquencies.'
        : creditScore >= 620
          ? 'Fair credit. Minor delinquencies noted.'
          : 'Poor credit history. Multiple delinquencies and collections.'

    // Background check: derived from credit score band
    const backgroundStatus: 'CLEAR' | 'FLAG' | 'FAIL' =
      creditScore >= 650 ? 'CLEAR' : creditScore >= 600 ? 'FLAG' : 'FAIL'

    const backgroundNotes =
      backgroundStatus === 'CLEAR'
        ? 'No criminal records found.'
        : backgroundStatus === 'FLAG'
          ? 'Minor misdemeanor on record. Review recommended.'
          : 'Criminal record found. Further review required.'

    // Eviction check
    const evictionStatus: 'CLEAR' | 'FLAG' | 'FAIL' =
      creditScore >= 640 ? 'CLEAR' : creditScore >= 610 ? 'FLAG' : 'FAIL'

    const evictionNotes =
      evictionStatus === 'CLEAR'
        ? 'No eviction records found.'
        : evictionStatus === 'FLAG'
          ? 'One prior eviction filing found (dismissed).'
          : 'Prior eviction judgment on record.'

    // Income verification
    let incomeRatio: number | null = null
    let incomeStatus: 'CLEAR' | 'FLAG' | 'FAIL' = 'CLEAR'
    let incomeNotes = 'Income not provided for verification.'
    let incomeVerified = false

    if (req.monthlyIncome && req.desiredRent && req.desiredRent > 0) {
      incomeRatio = Math.round((req.desiredRent / req.monthlyIncome) * 100) / 100
      incomeVerified = true
      const pct = incomeRatio * 100
      if (pct <= 30) {
        incomeStatus = 'CLEAR'
        incomeNotes = `Rent-to-income ratio ${(pct).toFixed(0)}%. Within acceptable range.`
      } else if (pct <= 40) {
        incomeStatus = 'FLAG'
        incomeNotes = `Rent-to-income ratio ${(pct).toFixed(0)}%. Above preferred 30% threshold.`
      } else {
        incomeStatus = 'FAIL'
        incomeNotes = `Rent-to-income ratio ${(pct).toFixed(0)}%. Exceeds 40% maximum.`
      }
    }

    // Overall: FAIL if any FAIL, FLAG if any FLAG, else CLEAR
    const statuses = [creditStatus, backgroundStatus, evictionStatus, incomeStatus]
    const overallStatus: 'CLEAR' | 'FLAG' | 'FAIL' = statuses.includes('FAIL')
      ? 'FAIL'
      : statuses.includes('FLAG')
        ? 'FLAG'
        : 'CLEAR'

    const providerRef = `mock-${Date.now()}-${h.toString(36)}`

    return {
      creditScore,
      creditStatus,
      creditNotes,
      backgroundStatus,
      backgroundNotes,
      evictionStatus,
      evictionNotes,
      incomeVerified,
      incomeRatio,
      incomeStatus,
      incomeNotes,
      overallStatus,
      providerRef,
      rawResponse: {
        provider: 'mock',
        timestamp: new Date().toISOString(),
        applicant: { email: req.email, name: `${req.firstName} ${req.lastName}` },
        creditScore,
        creditStatus,
        backgroundStatus,
        evictionStatus,
        incomeRatio,
        incomeStatus,
      },
    }
  }
}

// ── Singleton ───────────────────────────────────────────────────────────────

let _provider: ScreeningProvider | null = null

export function getScreeningProvider(): ScreeningProvider {
  if (!_provider) {
    if (!process.env.SCREENING_API_KEY) {
      console.warn('[screening] SCREENING_API_KEY not set — using mock provider')
    }
    _provider = new MockScreeningProvider()
  }
  return _provider
}
