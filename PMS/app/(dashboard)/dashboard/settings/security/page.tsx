'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Shield, ShieldCheck, ShieldOff, Copy, Check, Loader2 } from 'lucide-react'

type Step = 'idle' | 'setup' | 'verify' | 'backup' | 'disable'

export default function SecurityPage() {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<Step>('idle')

  // Setup state
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [disableCode, setDisableCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/auth/2fa/status')
      .then(r => r.json())
      .then(data => setEnabled(data.enabled ?? false))
      .finally(() => setLoading(false))
  }, [])

  async function startSetup() {
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/auth/2fa/setup', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSubmitting(false); return }
    setQrCodeUrl(data.qrCodeUrl)
    setSecret(data.secret)
    setStep('setup')
    setSubmitting(false)
  }

  async function verifySetup(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/auth/2fa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: verifyCode }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSubmitting(false); return }
    setBackupCodes(data.backupCodes)
    setEnabled(true)
    setStep('backup')
    setSubmitting(false)
  }

  async function disable2FA(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/auth/2fa/disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: disableCode }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSubmitting(false); return }
    setEnabled(false)
    setStep('idle')
    setDisableCode('')
    setSubmitting(false)
  }

  function copyBackupCodes() {
    navigator.clipboard.writeText(backupCodes.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="max-w-2xl">
      <PageHeader title="Security Settings" subtitle="Manage your account security" />

      {/* 2FA Status Card */}
      <Card className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {enabled ? (
              <div className="h-10 w-10 bg-green-100 rounded-lg flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-green-600" />
              </div>
            ) : (
              <div className="h-10 w-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <Shield className="h-5 w-5 text-gray-400" />
              </div>
            )}
            <div>
              <p className="font-medium text-gray-900">Two-Factor Authentication</p>
              <p className="text-sm text-gray-500">
                {enabled ? 'Your account is protected with 2FA' : 'Add an extra layer of security to your account'}
              </p>
            </div>
          </div>
          <Badge variant={enabled ? 'success' : 'gray'}>
            {enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>

        {step === 'idle' && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            {enabled ? (
              <button
                onClick={() => setStep('disable')}
                className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                <ShieldOff className="h-4 w-4 inline mr-1" /> Disable 2FA
              </button>
            ) : (
              <button
                onClick={startSetup}
                disabled={submitting}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin inline mr-1" /> : <Shield className="h-4 w-4 inline mr-1" />}
                Enable 2FA
              </button>
            )}
          </div>
        )}
      </Card>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Setup Step: Scan QR */}
      {step === 'setup' && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-2">Step 1: Scan QR Code</h3>
          <p className="text-sm text-gray-500 mb-4">
            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
          </p>
          {qrCodeUrl && (
            <div className="flex justify-center mb-4">
              <img src={qrCodeUrl} alt="2FA QR Code" className="w-48 h-48" />
            </div>
          )}
          <div className="bg-gray-50 rounded-lg p-3 mb-4">
            <p className="text-xs text-gray-500 mb-1">Manual entry key:</p>
            <p className="font-mono text-sm text-gray-900 break-all">{secret}</p>
          </div>

          <h3 className="font-semibold text-gray-900 mb-2">Step 2: Verify</h3>
          <form onSubmit={verifySetup}>
            <p className="text-sm text-gray-500 mb-3">Enter the 6-digit code from your authenticator app.</p>
            <input
              type="text"
              value={verifyCode}
              onChange={e => setVerifyCode(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-center font-mono tracking-widest text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
              placeholder="000000"
              maxLength={6}
              autoFocus
              required
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setStep('idle')} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {submitting ? 'Verifying…' : 'Verify & Enable'}
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Backup Codes */}
      {step === 'backup' && (
        <Card>
          <div className="text-center mb-4">
            <ShieldCheck className="h-10 w-10 text-green-600 mx-auto mb-2" />
            <h3 className="font-semibold text-gray-900">2FA Enabled Successfully!</h3>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p className="text-sm font-medium text-yellow-800 mb-2">Save Your Backup Codes</p>
            <p className="text-xs text-yellow-700 mb-3">
              Store these codes in a safe place. Each code can only be used once. You won&apos;t see these again.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((code, i) => (
                <code key={i} className="bg-white border border-yellow-300 rounded px-3 py-1.5 text-sm font-mono text-center">
                  {code}
                </code>
              ))}
            </div>
          </div>
          <div className="flex justify-between">
            <button
              onClick={copyBackupCodes}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy codes'}
            </button>
            <button
              onClick={() => { setStep('idle'); setBackupCodes([]); }}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          </div>
        </Card>
      )}

      {/* Disable 2FA */}
      {step === 'disable' && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-2">Disable Two-Factor Authentication</h3>
          <p className="text-sm text-gray-500 mb-4">
            Enter a code from your authenticator app or a backup code to confirm.
          </p>
          <form onSubmit={disable2FA}>
            <input
              type="text"
              value={disableCode}
              onChange={e => setDisableCode(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-center font-mono tracking-widest text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
              placeholder="Enter code"
              autoFocus
              required
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setStep('idle')} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                {submitting ? 'Disabling…' : 'Disable 2FA'}
              </button>
            </div>
          </form>
        </Card>
      )}
    </div>
  )
}
