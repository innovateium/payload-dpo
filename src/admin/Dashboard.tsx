'use client'

import { useCallback, useEffect, useState } from 'react'

import { STATUS_MAP } from '../lib/constants.js'

type TransactionData = {
  amount: number
  currency: string
  email: string
  id: string
  payRequestId: string
  reference: string
  statusMessage: string
  transactionStatus: string
  updatedAt: string
}

type Stats = {
  byStatus: Record<string, number>
  recent: TransactionData[]
  total: number
  totalByCurrency: Record<string, number>
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  BWP: 'P',
  USD: '$',
  ZAR: 'R',
}

const STATUS_COLORS: Record<string, string> = {
  '0': '#6b7280',
  '1': '#16a34a',
  '2': '#dc2626',
  '3': '#f59e0b',
  '4': '#f59e0b',
  '5': '#3b82f6',
  '7': '#6b7280',
}

function formatAmount(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] || currency
  const value = (amount / 100).toFixed(2)
  return `${symbol} ${value}`
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-ZA', {
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

export default function DpoDashboard() {
  const [stats, setStats] = useState<null | Stats>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<null | string>(null)

  const slug = 'dpo-transactions'

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/${slug}?limit=50&depth=0&sort=-updatedAt`)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const data = await res.json()

      const byStatus: Record<string, number> = {}
      const totalByCurrency: Record<string, number> = {}

      for (const tx of data.docs as TransactionData[]) {
        byStatus[tx.transactionStatus] = (byStatus[tx.transactionStatus] || 0) + 1
        const currency = tx.currency || 'ZAR'
        totalByCurrency[currency] = (totalByCurrency[currency] || 0) + (tx.amount || 0)
      }

      setStats({
        byStatus,
        recent: (data.docs as TransactionData[]).slice(0, 10),
        total: data.totalDocs || 0,
        totalByCurrency,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    void fetchStats()
  }, [fetchStats])

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '20px 24px',
  }

  const valueStyle: React.CSSProperties = {
    color: '#111',
    fontSize: '28px',
    fontWeight: 700,
    lineHeight: 1.2,
  }

  const labelStyle: React.CSSProperties = {
    color: '#6b7280',
    fontSize: '13px',
    fontWeight: 500,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  }

  const sectionTitleStyle: React.CSSProperties = {
    color: '#111',
    fontSize: '18px',
    fontWeight: 600,
    margin: '0 0 16px',
  }

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    gap: '24px',
    padding: '24px 0',
  }

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ color: '#6b7280', fontSize: '14px' }}>Loading transaction data...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#991b1b',
            fontSize: '14px',
            padding: '12px 16px',
          }}
        >
          Failed to load DPO transaction data: {error}
        </div>
      </div>
    )
  }

  if (!stats || stats.total === 0) {
    return (
      <div style={containerStyle}>
        <div
          style={{
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            color: '#6b7280',
            fontSize: '14px',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          No DPO transactions yet. Complete a test payment to see data here.
        </div>
      </div>
    )
  }

  const totalRevenue = Object.entries(stats.totalByCurrency)
    .map(([currency, amount]) => formatAmount(amount, currency))
    .join('  |  ')

  const successfulCount = stats.byStatus['1'] || 0
  const failedCount =
    (stats.byStatus['2'] || 0) + (stats.byStatus['3'] || 0) + (stats.byStatus['4'] || 0)
  const pendingCount = (stats.byStatus['0'] || 0) + (stats.byStatus['5'] || 0)

  return (
    <div style={containerStyle}>
      {/* Summary cards */}
      <div
        style={{
          display: 'grid',
          gap: '12px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        }}
      >
        <div style={cardStyle}>
          <span style={labelStyle}>Total Transactions</span>
          <span style={valueStyle}>{stats.total}</span>
        </div>
        <div style={cardStyle}>
          <span style={labelStyle}>Total Revenue</span>
          <span style={{ ...valueStyle, fontSize: '20px' }}>{totalRevenue || '—'}</span>
        </div>
        <div style={{ ...cardStyle, borderLeft: '3px solid #16a34a' }}>
          <span style={labelStyle}>Approved</span>
          <span style={{ ...valueStyle, color: '#16a34a' }}>{successfulCount}</span>
        </div>
        <div style={{ ...cardStyle, borderLeft: '3px solid #dc2626' }}>
          <span style={labelStyle}>Failed</span>
          <span style={{ ...valueStyle, color: '#dc2626' }}>{failedCount}</span>
        </div>
        <div style={{ ...cardStyle, borderLeft: '3px solid #f59e0b' }}>
          <span style={labelStyle}>Pending</span>
          <span style={{ ...valueStyle, color: '#f59e0b' }}>{pendingCount}</span>
        </div>
      </div>

      {/* Status breakdown */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '20px 24px',
        }}
      >
        <h3 style={sectionTitleStyle}>Status Breakdown</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {Object.entries(stats.byStatus)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([code, count]) => {
              const pct = stats.total > 0 ? ((count / stats.total) * 100).toFixed(1) : '0'
              return (
                <div key={code} style={{ alignItems: 'center', display: 'flex', gap: '12px' }}>
                  <div
                    style={{
                      background: STATUS_COLORS[code] || '#6b7280',
                      borderRadius: '50%',
                      flexShrink: 0,
                      height: '10px',
                      width: '10px',
                    }}
                  />
                  <span style={{ color: '#374151', flex: 1, fontSize: '14px' }}>
                    {STATUS_MAP[code] || `Unknown (${code})`}
                  </span>
                  <span
                    style={{
                      color: '#111',
                      fontSize: '14px',
                      fontWeight: 600,
                      minWidth: '40px',
                      textAlign: 'right',
                    }}
                  >
                    {count}
                  </span>
                  <span
                    style={{
                      color: '#9ca3af',
                      fontSize: '13px',
                      minWidth: '48px',
                      textAlign: 'right',
                    }}
                  >
                    {pct}%
                  </span>
                </div>
              )
            })}
        </div>
      </div>

      {/* Recent transactions */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <div style={{ borderBottom: '1px solid #e5e7eb', padding: '20px 24px' }}>
          <h3 style={sectionTitleStyle}>Recent Transactions</h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '13px', width: '100%' }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                <th style={thStyle}>Reference</th>
                <th style={thStyle}>Amount</th>
                <th style={thStyle}>Currency</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Date</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent.map((tx) => (
                <tr key={tx.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={tdStyle}>
                    <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                      {tx.reference}
                    </span>
                  </td>
                  <td style={tdStyle}>{formatAmount(tx.amount, tx.currency)}</td>
                  <td style={tdStyle}>{tx.currency}</td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        background:
                          tx.transactionStatus === '1'
                            ? '#dcfce7'
                            : tx.transactionStatus === '0' || tx.transactionStatus === '5'
                              ? '#dbeafe'
                              : '#fef2f2',
                        borderRadius: '9999px',
                        color:
                          tx.transactionStatus === '1'
                            ? '#166534'
                            : tx.transactionStatus === '0' || tx.transactionStatus === '5'
                              ? '#1e40af'
                              : '#991b1b',
                        display: 'inline-block',
                        fontSize: '12px',
                        fontWeight: 600,
                        padding: '2px 8px',
                      }}
                    >
                      {tx.statusMessage || STATUS_MAP[tx.transactionStatus] || 'Unknown'}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: '#6b7280' }}>{tx.email}</td>
                  <td style={{ ...tdStyle, color: '#6b7280', whiteSpace: 'nowrap' }}>
                    {formatDate(tx.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  borderBottom: '2px solid #e5e7eb',
  color: '#374151',
  fontWeight: 600,
  padding: '10px 16px',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  color: '#111',
  padding: '10px 16px',
}
