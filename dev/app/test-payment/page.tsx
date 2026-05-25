'use client'

import { useCallback, useState } from 'react'

const CURRENCY_SYMBOLS: Record<string, string> = {
  BWP: 'P',
  USD: '$',
  ZAR: 'R',
}

export default function TestPaymentPage() {
  const [amount, setAmount] = useState('9.99')
  const [email, setEmail] = useState('test@example.com')
  const [currency, setCurrency] = useState('ZAR')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Record<string, unknown> | null>(null)

  const toCents = (value: string) => {
    const num = parseFloat(value)
    return isNaN(num) ? '' : String(Math.round(num * 100))
  }

  const handlePay = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setLoading(true)
      setError('')
      setResult(null)

      const amountInCents = toCents(amount)
      if (!amountInCents) {
        setError('Please enter a valid amount')
        setLoading(false)
        return
      }

      try {
        const res = await fetch('/api/dpo/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: amountInCents, email, currency }),
        })

        const data = await res.json()

        if (!res.ok || !data.success) {
          throw new Error(data.error || data.message || 'Payment initiation failed')
        }

        setResult(data)

        const form = document.createElement('form')
        form.method = 'POST'
        form.action = data.paymentUrl as string
        form.style.display = 'none'

        const fields: Record<string, string> = {
          PAY_REQUEST_ID: data.payRequestId as string,
          CHECKSUM: data.checksum as string,
        }

        for (const [key, value] of Object.entries(fields)) {
          const input = document.createElement('input')
          input.type = 'hidden'
          input.name = key
          input.value = value
          form.appendChild(input)
        }

        document.body.appendChild(form)
        form.submit()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Payment failed')
        setLoading(false)
      }
    },
    [amount, email, currency],
  )

  const symbol = CURRENCY_SYMBOLS[currency] || 'R'

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
        }}
      >
        <h1 style={{ margin: '0 0 8px', fontSize: '24px', color: '#111' }}>Test Payment</h1>
        <p style={{ margin: '0 0 24px', color: '#666', fontSize: '14px' }}>
          Test the PayGate PayWeb3 integration
        </p>

        <form onSubmit={handlePay}>
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="email"
              style={{
                display: 'block',
                marginBottom: '6px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#333',
              }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="currency"
              style={{
                display: 'block',
                marginBottom: '6px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#333',
              }}
            >
              Currency
            </label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box',
                background: 'white',
              }}
            >
              <option value="ZAR">ZAR (R)</option>
              <option value="BWP">BWP (P)</option>
              <option value="USD">USD ($)</option>
            </select>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label
              htmlFor="amount"
              style={{
                display: 'block',
                marginBottom: '6px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#333',
              }}
            >
              Amount ({currency})
            </label>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#666',
                  fontSize: '14px',
                }}
              >
                {symbol}
              </span>
              <input
                id="amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  const val = e.target.value
                  if (/^\d*\.?\d{0,2}$/.test(val) || val === '') {
                    setAmount(val)
                  }
                }}
                placeholder="0.00"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 28px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {error && (
            <div
              style={{
                padding: '10px 14px',
                background: '#fef2f2',
                color: '#991b1b',
                borderRadius: '6px',
                fontSize: '14px',
                marginBottom: '16px',
              }}
            >
              {error}
            </div>
          )}

          {result && (
            <div
              style={{
                padding: '12px 14px',
                background: '#f0fdf4',
                color: '#166534',
                borderRadius: '6px',
                fontSize: '13px',
                marginBottom: '16px',
                wordBreak: 'break-all',
              }}
            >
              <div>
                <strong>PAY_REQUEST_ID:</strong> {String(result.payRequestId)}
              </div>
              <div>
                <strong>Reference:</strong> {String(result.reference)}
              </div>
              <div>
                <strong>Redirecting to PayGate...</strong>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: loading ? '#9ca3af' : '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '16px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Processing...' : 'Pay Now'}
          </button>
        </form>

        <p
          style={{
            marginTop: '20px',
            fontSize: '12px',
            color: '#999',
            textAlign: 'center',
          }}
        >
          Uses PayGate PayWeb3 test credentials.
          <br />
          <a href="/api/dpo/status" style={{ color: '#0070f3' }}>
            Check transaction status
          </a>
        </p>
      </div>
    </div>
  )
}
