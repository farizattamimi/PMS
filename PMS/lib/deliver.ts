import { prisma } from './prisma'
import { resolvePreferences } from './preferences'
import { getResend, EMAIL_FROM } from './resend'
import { getTwilio, SMS_FROM } from './twilio'

interface DeliverOptions {
  userId: string
  title: string
  body?: string
  type: string
  entityType?: string
  entityId?: string
  emailSubject?: string
  emailHtml?: string
  smsBody?: string
}

/**
 * Central delivery orchestrator.
 * Resolves user preferences, then delivers via IN_APP / EMAIL / SMS as enabled.
 * Never throws — errors are caught and logged.
 */
export async function deliverNotification(opts: DeliverOptions) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: opts.userId },
      select: { id: true, email: true, phone: true, isActive: true },
    })
    if (!user || !user.isActive) return

    const prefs = await resolvePreferences(opts.userId, opts.type)

    // ── IN_APP ──
    if (prefs.IN_APP) {
      await prisma.notification.create({
        data: {
          userId: opts.userId,
          title: opts.title,
          body: opts.body,
          type: opts.type,
          entityType: opts.entityType,
          entityId: opts.entityId,
        },
      })
    }

    // ── EMAIL ──
    if (prefs.EMAIL && opts.emailHtml && user.email) {
      const resend = getResend()
      const subject = opts.emailSubject ?? opts.title
      if (resend) {
        try {
          const result = await resend.emails.send({
            from: EMAIL_FROM,
            to: user.email,
            subject,
            html: opts.emailHtml,
          })
          await prisma.deliveryLog.create({
            data: {
              userId: opts.userId,
              channel: 'EMAIL',
              recipient: user.email,
              status: 'SENT',
              externalId: result.data?.id,
            },
          })
        } catch (err: any) {
          console.error('[deliver] Email failed:', err.message)
          await prisma.deliveryLog.create({
            data: {
              userId: opts.userId,
              channel: 'EMAIL',
              recipient: user.email,
              status: 'FAILED',
              error: err.message?.slice(0, 500),
            },
          })
        }
      } else {
        console.log(`[Email stub] To: ${user.email} | Subject: ${subject}`)
      }
    }

    // ── SMS ──
    if (prefs.SMS && opts.smsBody && user.phone) {
      const tw = getTwilio()
      if (tw && SMS_FROM) {
        try {
          const msg = await tw.messages.create({
            to: user.phone,
            from: SMS_FROM,
            body: opts.smsBody,
          })
          await prisma.deliveryLog.create({
            data: {
              userId: opts.userId,
              channel: 'SMS',
              recipient: user.phone,
              status: 'SENT',
              externalId: msg.sid,
            },
          })
        } catch (err: any) {
          console.error('[deliver] SMS failed:', err.message)
          await prisma.deliveryLog.create({
            data: {
              userId: opts.userId,
              channel: 'SMS',
              recipient: user.phone,
              status: 'FAILED',
              error: err.message?.slice(0, 500),
            },
          })
        }
      } else {
        console.log(`[SMS stub] To: ${user.phone} | Body: ${opts.smsBody.slice(0, 80)}`)
      }
    }
  } catch (err: any) {
    console.error('[deliver] Unexpected error:', err.message)
  }
}
