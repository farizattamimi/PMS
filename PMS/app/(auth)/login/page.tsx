'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Building2, Loader2, ArrowLeft, ShieldCheck } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // 2FA state
  const [needs2FA, setNeeds2FA] = useState(false)
  const [totpCode, setTotpCode] = useState('')
  const [useBackupCode, setUseBackupCode] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email,
        password,
        totpCode: needs2FA ? totpCode : undefined,
        redirect: false,
      })

      if (result?.error) {
        if (result.error === '2FA_REQUIRED') {
          setNeeds2FA(true)
          setError('')
        } else if (result.error === 'This account has been deactivated') {
          setError(result.error)
        } else if (result.error === 'Invalid 2FA code') {
          setError('Invalid verification code. Please try again.')
        } else {
          setError('Invalid email or password')
        }
      } else {
        router.push('/org-select')
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  function reset2FA() {
    setNeeds2FA(false)
    setTotpCode('')
    setUseBackupCode(false)
    setError('')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 bg-blue-600 rounded-2xl mb-4">
            {needs2FA ? <ShieldCheck className="h-8 w-8 text-white" /> : <Building2 className="h-8 w-8 text-white" />}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {needs2FA ? 'Two-Factor Authentication' : 'Property Management'}
          </h1>
          <p className="text-gray-500 mt-1">
            {needs2FA
              ? (useBackupCode ? 'Enter a backup code' : 'Enter the code from your authenticator app')
              : 'Sign in to your account'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {!needs2FA ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="••••••••"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {useBackupCode ? 'Backup Code' : 'Verification Code'}
                  </label>
                  <input
                    type="text"
                    required
                    value={totpCode}
                    onChange={e => setTotpCode(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-center tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={useBackupCode ? 'e.g. a1b2c3d4' : '000000'}
                    autoFocus
                    maxLength={useBackupCode ? 8 : 6}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUseBackupCode(!useBackupCode)
                    setTotpCode('')
                  }}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {useBackupCode ? 'Use authenticator code instead' : 'Use a backup code'}
                </button>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Verifying…' : needs2FA ? 'Verify' : 'Sign in'}
            </button>

            {needs2FA && (
              <button
                type="button"
                onClick={reset2FA}
                className="w-full flex items-center justify-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="h-4 w-4" /> Back to login
              </button>
            )}
          </form>

          {/* Demo credentials */}
          {!needs2FA && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
              <p className="font-medium text-gray-600 mb-2">Demo accounts:</p>
              <p>Admin: admin@pms.dev / password123</p>
              <p>Manager: manager@pms.dev / password123</p>
              <p>Tenant: tenant@pms.dev / password123</p>
            </div>
          )}
        </div>

        {!needs2FA && (
          <p className="text-center text-sm text-gray-500 mt-6">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-blue-600 hover:underline font-medium">
              Register
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
