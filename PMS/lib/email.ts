// ── HTML email templates ─────────────────────────────────────────────────────

export function woStatusEmail(woTitle: string, newStatus: string, propertyName: string) {
  return `
    <div style="font-family:sans-serif;max-width:600px">
      <h2 style="color:#1d4ed8">Work Order Update</h2>
      <p>Your work order <strong>"${woTitle}"</strong> at <strong>${propertyName}</strong> has been updated.</p>
      <p>New status: <strong style="text-transform:uppercase">${newStatus.replace('_', ' ')}</strong></p>
      <hr style="border-color:#e5e7eb"/>
      <p style="color:#6b7280;font-size:12px">Property Management System</p>
    </div>
  `
}

export function leaseExpiringEmail(tenantName: string, unitNumber: string, propertyName: string, endDate: string, daysLeft: number) {
  return `
    <div style="font-family:sans-serif;max-width:600px">
      <h2 style="color:#d97706">Lease Expiration Reminder</h2>
      <p>Hi ${tenantName},</p>
      <p>Your lease for <strong>Unit ${unitNumber}</strong> at <strong>${propertyName}</strong> is expiring in <strong>${daysLeft} days</strong> on ${endDate}.</p>
      <p>Please contact your property manager to discuss renewal options.</p>
      <hr style="border-color:#e5e7eb"/>
      <p style="color:#6b7280;font-size:12px">Property Management System</p>
    </div>
  `
}

export function paymentReceiptEmail(tenantName: string, amount: number, date: string) {
  return `
    <div style="font-family:sans-serif;max-width:600px">
      <h2 style="color:#16a34a">Payment Received</h2>
      <p>Hi ${tenantName},</p>
      <p>We've received your payment of <strong>$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong> on ${date}.</p>
      <p>Thank you for your prompt payment. Your account balance has been updated.</p>
      <hr style="border-color:#e5e7eb"/>
      <p style="color:#6b7280;font-size:12px">Property Management System</p>
    </div>
  `
}

export function lateFeeEmail(tenantName: string, feeAmount: number, rentDueDate: string, unitNumber: string) {
  return `
    <div style="font-family:sans-serif;max-width:600px">
      <h2 style="color:#dc2626">Late Fee Assessed</h2>
      <p>Hi ${tenantName},</p>
      <p>A late fee of <strong>$${feeAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong> has been charged to your account for Unit ${unitNumber}.</p>
      <p>Rent was due on <strong>${rentDueDate}</strong> and was not received within the grace period.</p>
      <p>Please log in to the portal to view your balance and submit payment.</p>
      <hr style="border-color:#e5e7eb"/>
      <p style="color:#6b7280;font-size:12px">Property Management System</p>
    </div>
  `
}

export function rentChargeEmail(tenantName: string, amount: number, dueDate: string, unitNumber: string) {
  return `
    <div style="font-family:sans-serif;max-width:600px">
      <h2 style="color:#1d4ed8">Rent Payment Due</h2>
      <p>Hi ${tenantName},</p>
      <p>A rent charge of <strong>$${amount.toLocaleString()}</strong> for Unit ${unitNumber} is due on <strong>${dueDate}</strong>.</p>
      <p>Please log in to the portal to submit your payment.</p>
      <hr style="border-color:#e5e7eb"/>
      <p style="color:#6b7280;font-size:12px">Property Management System</p>
    </div>
  `
}

export function screeningCompleteEmail(applicantName: string, propertyName: string, overallStatus: string, creditScore: number | null) {
  const statusColor = overallStatus === 'CLEAR' ? '#16a34a' : overallStatus === 'FLAG' ? '#d97706' : '#dc2626'
  const statusLabel = overallStatus === 'CLEAR' ? 'Passed' : overallStatus === 'FLAG' ? 'Flagged' : 'Failed'
  return `
    <div style="font-family:sans-serif;max-width:600px">
      <h2 style="color:#1d4ed8">Screening Report Complete</h2>
      <p>The tenant screening for <strong>${applicantName}</strong> at <strong>${propertyName}</strong> has been completed.</p>
      <p>Overall result: <strong style="color:${statusColor}">${statusLabel}</strong></p>
      ${creditScore != null ? `<p>Credit score: <strong>${creditScore}</strong></p>` : ''}
      <p>Log in to the portal to review the full report and take action.</p>
      <hr style="border-color:#e5e7eb"/>
      <p style="color:#6b7280;font-size:12px">Property Management System</p>
    </div>
  `
}

export function renewalOfferEmail(
  tenantName: string,
  unitNumber: string,
  propertyName: string,
  currentRent: number,
  offeredRent: number,
  termMonths: number,
  expiryDate: string,
) {
  const fmtCur = currentRent.toLocaleString('en-US', { minimumFractionDigits: 2 })
  const fmtNew = offeredRent.toLocaleString('en-US', { minimumFractionDigits: 2 })
  return `
    <div style="font-family:sans-serif;max-width:600px">
      <h2 style="color:#7c3aed">Lease Renewal Offer</h2>
      <p>Hi ${tenantName},</p>
      <p>We'd like to offer you a lease renewal for <strong>Unit ${unitNumber}</strong> at <strong>${propertyName}</strong>.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600">Current Rent</td><td style="padding:8px 12px;border:1px solid #e5e7eb">$${fmtCur}/mo</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600">Offered Rent</td><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#7c3aed;font-weight:600">$${fmtNew}/mo</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600">New Term</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${termMonths} months</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600">Offer Expires</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${expiryDate}</td></tr>
      </table>
      <p>Log in to your tenant portal to accept or decline this offer.</p>
      <hr style="border-color:#e5e7eb"/>
      <p style="color:#6b7280;font-size:12px">Property Management System</p>
    </div>
  `
}

export function welcomeEmail(tenantName: string, propertyName: string, unitNumber: string) {
  return `
    <div style="font-family:sans-serif;max-width:600px">
      <h2 style="color:#16a34a">Welcome to ${propertyName}!</h2>
      <p>Hi ${tenantName},</p>
      <p>Welcome to your new home at <strong>Unit ${unitNumber}</strong>, <strong>${propertyName}</strong>.</p>
      <p>Your tenant account has been created. Please log in to your portal to complete your move-in checklist, which includes:</p>
      <ul>
        <li>Uploading renter's insurance</li>
        <li>Signing your lease agreement</li>
        <li>Setting up your payment method</li>
        <li>Scheduling your move-in inspection</li>
      </ul>
      <p>If you have any questions, don't hesitate to reach out to your property manager.</p>
      <hr style="border-color:#e5e7eb"/>
      <p style="color:#6b7280;font-size:12px">Property Management System</p>
    </div>
  `
}

export function onboardingReminderEmail(tenantName: string, propertyName: string, completedCount: number, totalCount: number) {
  const remaining = totalCount - completedCount
  return `
    <div style="font-family:sans-serif;max-width:600px">
      <h2 style="color:#d97706">Move-In Checklist Reminder</h2>
      <p>Hi ${tenantName},</p>
      <p>You have <strong>${remaining} task${remaining !== 1 ? 's' : ''}</strong> remaining on your move-in checklist for <strong>${propertyName}</strong>.</p>
      <p>Progress: <strong>${completedCount} of ${totalCount}</strong> tasks completed.</p>
      <p>Please log in to your tenant portal to complete the remaining items.</p>
      <hr style="border-color:#e5e7eb"/>
      <p style="color:#6b7280;font-size:12px">Property Management System</p>
    </div>
  `
}

export function distributionNoticeEmail(
  ownerName: string,
  propertyName: string,
  period: string,
  grossIncome: number,
  expenses: number,
  managementFee: number,
  netDistribution: number,
) {
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 })
  return `
    <div style="font-family:sans-serif;max-width:600px">
      <h2 style="color:#1d4ed8">Distribution Statement</h2>
      <p>Hi ${ownerName},</p>
      <p>Your distribution statement for <strong>${propertyName}</strong> (${period}) is ready.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600">Gross Income</td><td style="padding:8px 12px;border:1px solid #e5e7eb">$${fmt(grossIncome)}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600">Expenses</td><td style="padding:8px 12px;border:1px solid #e5e7eb">($${fmt(expenses)})</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600">Management Fee</td><td style="padding:8px 12px;border:1px solid #e5e7eb">($${fmt(managementFee)})</td></tr>
        <tr style="background:#f0f9ff"><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:700">Net Distribution</td><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:700;color:#1d4ed8">$${fmt(netDistribution)}</td></tr>
      </table>
      <p>Log in to the owner portal to view the full statement.</p>
      <hr style="border-color:#e5e7eb"/>
      <p style="color:#6b7280;font-size:12px">Property Management System</p>
    </div>
  `
}

// ── SMS text helpers ─────────────────────────────────────────────────────────

export function woStatusSms(woTitle: string, newStatus: string, propertyName: string) {
  return `PMS: Work order "${woTitle}" at ${propertyName} updated to ${newStatus.replace('_', ' ')}.`
}

export function leaseExpiringSms(tenantName: string, unitNumber: string, propertyName: string, endDate: string, daysLeft: number) {
  return `PMS: Hi ${tenantName}, your lease for Unit ${unitNumber} at ${propertyName} expires in ${daysLeft} days (${endDate}). Contact your property manager about renewal.`
}

export function paymentReceiptSms(tenantName: string, amount: number, date: string) {
  return `PMS: Hi ${tenantName}, your payment of $${amount.toFixed(2)} on ${date} has been received. Thank you!`
}

export function lateFeeSms(tenantName: string, feeAmount: number, rentDueDate: string, unitNumber: string) {
  return `PMS: Hi ${tenantName}, a late fee of $${feeAmount.toFixed(2)} was charged for Unit ${unitNumber}. Rent was due ${rentDueDate}. Log in to make a payment.`
}

export function rentChargeSms(tenantName: string, amount: number, dueDate: string, unitNumber: string) {
  return `PMS: Hi ${tenantName}, rent of $${amount.toLocaleString()} for Unit ${unitNumber} is due on ${dueDate}. Log in to submit payment.`
}

export function screeningCompleteSms(applicantName: string, propertyName: string, overallStatus: string) {
  const label = overallStatus === 'CLEAR' ? 'PASSED' : overallStatus === 'FLAG' ? 'FLAGGED' : 'FAILED'
  return `PMS: Screening for ${applicantName} at ${propertyName} is complete — ${label}. Log in to review.`
}

export function renewalOfferSms(tenantName: string, propertyName: string, offeredRent: number, termMonths: number, expiryDate: string) {
  return `PMS: Hi ${tenantName}, renewal offer at ${propertyName}: $${offeredRent.toFixed(2)}/mo for ${termMonths}mo. Expires ${expiryDate}. Log in to respond.`
}

export function welcomeSms(tenantName: string, propertyName: string) {
  return `PMS: Welcome ${tenantName}! Your tenant account at ${propertyName} is ready. Log in to complete your move-in checklist.`
}

export function onboardingReminderSms(tenantName: string, propertyName: string, remaining: number) {
  return `PMS: Hi ${tenantName}, you have ${remaining} task${remaining !== 1 ? 's' : ''} left on your ${propertyName} move-in checklist. Log in to complete them.`
}

export function distributionNoticeSms(ownerName: string, propertyName: string, period: string, netAmount: number) {
  return `PMS: Hi ${ownerName}, your ${period} distribution for ${propertyName}: $${netAmount.toFixed(2)} net. Log in to view details.`
}
