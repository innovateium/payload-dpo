'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

export default function PaymentResultPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const payRequestId = searchParams.get('PAY_REQUEST_ID')

  const [status, setStatus] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const checkStatus = useCallback(async () => {
    if (!payRequestId) {
      setLoading(false)
      setError('Missing PAY_REQUEST_ID')
      return
    }

    try {
      const res = await fetch(`/api/dpo/status?id=${encodeURIComponent(payRequestId)}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Status check failed')
      }

      setStatus(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status check failed')
    } finally {
      setLoading(false)
    }
  }, [payRequestId])

  useEffect(() => {
    void checkStatus()
  }, [checkStatus])

  if (!payRequestId) {
    return (
      <PageShell>
        <h2 style={{ margin: '0 0 8px' }}>Invalid Request</h2>
        <p style={{ margin: 0, color: '#666' }}>No PAY_REQUEST_ID provided.</p>
        <button onClick={() => router.push('/test-payment')} style={buttonStyle}>
          Try Again
        </button>
      </PageShell>
    )
  }

  if (loading) {
    return (
      <PageShell>
        <h2 style={{ margin: '0 0 8px' }}>Checking Status...</h2>
        <p style={{ margin: 0, color: '#666' }}>Querying PayGate for transaction details.</p>
        <div
          style={{
            marginTop: '16px',
            width: '32px',
            height: '32px',
            border: '3px solid #e5e7eb',
            borderTop: '3px solid #0070f3',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </PageShell>
    )
  }

  if (error) {
    return (
      <PageShell>
        <h2 style={{ margin: '0 0 8px' }}>Error</h2>
        <p style={{ margin: 0, color: '#dc2626' }}>{error}</p>
        <button
          onClick={() => {
            setLoading(true)
            setError('')
            void checkStatus()
          }}
          style={buttonStyle}
        >
          Retry
        </button>
      </PageShell>
    )
  }

  const isSuccessful = status?.isSuccessful === true
  const statusCode = String(status?.transactionStatus ?? '')
  const statusMessage = String(status?.statusMessage ?? 'Unknown')

  return (
    <PageShell>
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
          fontSize: '28px',
          background: isSuccessful ? '#d4edda' : '#f8d7da',
          color: isSuccessful ? '#155724' : '#721c24',
        }}
      >
        {isSuccessful ? '\u2713' : '\u2717'}
      </div>

      <h2 style={{ margin: '0 0 8px' }}>{isSuccessful ? 'Payment Approved' : 'Payment Failed'}</h2>

      <div
        style={{
          display: 'inline-block',
          padding: '4px 14px',
          borderRadius: '20px',
          fontSize: '13px',
          fontWeight: 600,
          marginBottom: '16px',
          background: isSuccessful ? '#d4edda' : '#f8d7da',
          color: isSuccessful ? '#155724' : '#721c24',
        }}
      >
        {statusMessage} (code {statusCode})
      </div>

      <div style={{ fontSize: '13px', color: '#666', lineHeight: 1.8 }}>
        <div>
          <strong>PAY_REQUEST_ID:</strong> {payRequestId}
        </div>
        <div>
          <strong>Reference:</strong> {String(status?.reference ?? '')}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
        <button onClick={() => router.push('/test-payment')} style={buttonStyle}>
          New Payment
        </button>
        <button
          onClick={() => {
            window.location.href = `/admin/collections/dpo-transactions`
          }}
          style={{ ...buttonStyle, background: '#f3f4f6', color: '#374151' }}
        >
          View in Admin
        </button>
      </div>
    </PageShell>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '40px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          width: '100%',
          maxWidth: '420px',
          textAlign: 'center' as const,
        }}
      >
        {children}
      </div>
    </div>
  )
}

const buttonStyle: React.CSSProperties = {
  padding: '10px 24px',
  background: '#0070f3',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
  flex: 1,
}
