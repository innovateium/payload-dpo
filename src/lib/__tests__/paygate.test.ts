import { describe, expect, test } from 'vitest'

import { parseResponse } from '../paygate.js'

describe('parseResponse', () => {
  test('parses URL-encoded response', () => {
    const result = parseResponse('PAY_REQUEST_ID=abc123&CHECKSUM=def456&TRANSACTION_STATUS=1')
    expect(result).toEqual({
      CHECKSUM: 'def456',
      PAY_REQUEST_ID: 'abc123',
      TRANSACTION_STATUS: '1',
    })
  })

  test('decodes URI-encoded values', () => {
    const result = parseResponse('STATUS_MESSAGE=Payment+Approved&REFERENCE=REF%23001')
    expect(result).toEqual({
      REFERENCE: 'REF#001',
      STATUS_MESSAGE: 'Payment Approved',
    })
  })

  test('handles empty string', () => {
    expect(() => parseResponse('')).toThrow('Invalid response data from PayGate')
  })

  test('handles single key-value pair', () => {
    const result = parseResponse('KEY=value')
    expect(result).toEqual({ KEY: 'value' })
  })

  test('handles values with equals signs', () => {
    const result = parseResponse('DATA=a%3Db%3Dc')
    expect(result).toEqual({ DATA: 'a=b=c' })
  })

  test('handles keys without values', () => {
    const result = parseResponse('KEY1=val1&KEY2=&KEY3=val3')
    expect(result).toEqual({ KEY1: 'val1', KEY2: '', KEY3: 'val3' })
  })

  test('handles malformed pairs (no equals sign)', () => {
    const result = parseResponse('KEY1=val1&KEY2&KEY3=val3')
    expect(result).toEqual({ KEY1: 'val1', KEY2: '', KEY3: 'val3' })
  })

  test('handles non-string input', () => {
    expect(() => parseResponse(null as unknown as string)).toThrow(
      'Invalid response data from PayGate',
    )
    expect(() => parseResponse(undefined as unknown as string)).toThrow(
      'Invalid response data from PayGate',
    )
    expect(() => parseResponse(123 as unknown as string)).toThrow(
      'Invalid response data from PayGate',
    )
  })

  test('handles error response from PayGate', () => {
    const result = parseResponse('ERROR=Invalid+merchant+ID')
    expect(result).toEqual({ ERROR: 'Invalid merchant ID' })
  })
})
