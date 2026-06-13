import crypto from 'crypto'
import { describe, expect, test } from 'vitest'

import { generateSignature } from '../checksum.js'
import { SIGNATURE_FIELDS } from '../constants.js'

describe('generateSignature', () => {
  const mockKey = 'test-key-123'

  test('generates consistent MD5 checksum', () => {
    const params: Record<string, string> = {
      AMOUNT: '1000',
      COUNTRY: 'ZAF',
      CURRENCY: 'ZAR',
      EMAIL: 'test@example.com',
      LOCALE: 'en-za',
      NOTIFY_URL: 'https://example.com/api/dpo/notify',
      PAY_REQUEST_ID: 'd3b8c2a1-1234',
      PAYGATE_ID: '10011072130',
      REFERENCE: 'ORDER_12345',
      RETURN_URL: 'https://example.com/api/dpo/return',
      TRANSACTION_DATE: '2024-01-15 14:30:00',
    }

    const sig1 = generateSignature(params, mockKey)
    const sig2 = generateSignature(params, mockKey)
    expect(sig1).toBe(sig2)
  })

  test('produces 32-char lowercase hex string', () => {
    const params: Record<string, string> = {
      AMOUNT: '500',
      COUNTRY: 'BWA',
      CURRENCY: 'BWP',
      EMAIL: 'user@example.com',
      LOCALE: 'en-bw',
      NOTIFY_URL: 'https://example.com/notify',
      PAY_REQUEST_ID: 'test-id',
      PAYGATE_ID: '10011072130',
      REFERENCE: 'REF_001',
      RETURN_URL: 'https://example.com/return',
      TRANSACTION_DATE: '2024-06-01 10:00:00',
    }

    const sig = generateSignature(params, mockKey)
    expect(sig).toMatch(/^[0-9a-f]{32}$/)
  })

  test('different keys produce different signatures', () => {
    const params: Record<string, string> = {
      AMOUNT: '500',
      COUNTRY: 'ZAF',
      CURRENCY: 'ZAR',
      EMAIL: 'user@example.com',
      LOCALE: 'en-za',
      NOTIFY_URL: 'https://example.com/notify',
      PAY_REQUEST_ID: 'test-id',
      PAYGATE_ID: '10011072130',
      REFERENCE: 'REF_001',
      RETURN_URL: 'https://example.com/return',
      TRANSACTION_DATE: '2024-06-01 10:00:00',
    }

    const sig1 = generateSignature(params, 'key-a')
    const sig2 = generateSignature(params, 'key-b')
    expect(sig1).not.toBe(sig2)
  })

  test('different amounts produce different signatures', () => {
    const base: Record<string, string> = {
      AMOUNT: '500',
      COUNTRY: 'ZAF',
      CURRENCY: 'ZAR',
      EMAIL: 'user@example.com',
      LOCALE: 'en-za',
      NOTIFY_URL: 'https://example.com/notify',
      PAY_REQUEST_ID: 'test-id',
      PAYGATE_ID: '10011072130',
      REFERENCE: 'REF_001',
      RETURN_URL: 'https://example.com/return',
      TRANSACTION_DATE: '2024-06-01 10:00:00',
    }

    const sig500 = generateSignature({ ...base, AMOUNT: '500' }, mockKey)
    const sig1000 = generateSignature({ ...base, AMOUNT: '1000' }, mockKey)
    expect(sig500).not.toBe(sig1000)
  })

  test('fields are concatenated in SIGNATURE_FIELDS order', () => {
    const params: Record<string, string> = {
      AMOUNT: 'D',
      COUNTRY: 'I',
      CURRENCY: 'E',
      EMAIL: 'J',
      LOCALE: 'H',
      NOTIFY_URL: 'K',
      PAY_REQUEST_ID: 'B',
      PAYGATE_ID: 'A',
      REFERENCE: 'C',
      RETURN_URL: 'F',
      TRANSACTION_DATE: 'G',
    }

    const sig = generateSignature(params, 'KEY')
    const expected = crypto.createHash('md5').update('ABCDEFGHIJKKEY').digest('hex').toLowerCase()
    expect(sig).toBe(expected)
  })

  test('handles undefined fields as empty strings', () => {
    const params: Record<string, string | undefined> = {
      AMOUNT: '100',
      COUNTRY: '',
      CURRENCY: 'ZAR',
      EMAIL: 'test@example.com',
      LOCALE: '',
      NOTIFY_URL: '',
      PAY_REQUEST_ID: 'test-id',
      PAYGATE_ID: '10011072130',
      REFERENCE: 'REF',
      RETURN_URL: '',
      TRANSACTION_DATE: '',
    }

    const sig = generateSignature(params, mockKey)
    expect(sig).toMatch(/^[0-9a-f]{32}$/)
  })

  test('all SIGNATURE_FIELDS are accounted for', () => {
    expect(SIGNATURE_FIELDS).toHaveLength(11)
    expect(SIGNATURE_FIELDS).toContain('PAYGATE_ID')
    expect(SIGNATURE_FIELDS).toContain('PAY_REQUEST_ID')
    expect(SIGNATURE_FIELDS).toContain('REFERENCE')
    expect(SIGNATURE_FIELDS).toContain('AMOUNT')
    expect(SIGNATURE_FIELDS).toContain('CURRENCY')
    expect(SIGNATURE_FIELDS).toContain('RETURN_URL')
    expect(SIGNATURE_FIELDS).toContain('TRANSACTION_DATE')
    expect(SIGNATURE_FIELDS).toContain('LOCALE')
    expect(SIGNATURE_FIELDS).toContain('COUNTRY')
    expect(SIGNATURE_FIELDS).toContain('EMAIL')
    expect(SIGNATURE_FIELDS).toContain('NOTIFY_URL')
  })
})
