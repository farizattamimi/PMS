import Stripe from 'stripe'

const globalForStripe = globalThis as unknown as { stripe: Stripe | undefined }

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('[stripe] STRIPE_SECRET_KEY is not set — Stripe payments will fail')
}

export const stripe =
  globalForStripe.stripe ??
  new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
    apiVersion: '2026-02-25.clover',
  })

if (process.env.NODE_ENV !== 'production') globalForStripe.stripe = stripe
