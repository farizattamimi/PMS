import nodemailer from 'nodemailer'

interface EmailOptions {
  to: string
  subject: string
  html: string
}

// Returns a transporter or null if SMTP is not configured
function getTransporter() {
  if (!process.env.SMTP_HOST) return null
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    } : undefined,
  })
}

export async function sendEmail({ to, subject, html }: EmailOptions) {
  const transporter = getTransporter()
  if (!transporter) {
    // SMTP not configured — log to console in dev
    console.log(`[Email stub] To: ${to} | Subject: ${subject}`)
    return
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? 'noreply@pms.app',
    to,
    subject,
    html,
  })
}

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
