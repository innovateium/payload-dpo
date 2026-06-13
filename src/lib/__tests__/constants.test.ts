import { describe, expect, test } from 'vitest'

import {
  CURRENCY_LOCALE_MAP,
  CURRENCY_OPTIONS,
  DEFAULT_PAYGATE_URL,
  DEFAULT_ROUTES,
  SIGNATURE_FIELDS,
  STATUS_MAP,
  TRANSACTION_STATUS_OPTIONS,
} from '../constants.js'

describe('constants', () => {
  test('DEFAULT_PAYGATE_URL is correct', () => {
    expect(DEFAULT_PAYGATE_URL).toBe('https://secure.paygate.co.za')
  })

  test('DEFAULT_ROUTES has all expected paths', () => {
    expect(DEFAULT_ROUTES).toEqual({
      initiate: '/dpo/initiate',
      notify: '/dpo/notify',
      return: '/dpo/return',
      returnResult: '/checkout/confirm-order',
      status: '/dpo/status',
    })
  })

  test('SIGNATURE_FIELDS has 11 fields in correct order', () => {
    expect(SIGNATURE_FIELDS).toHaveLength(11)
    expect(SIGNATURE_FIELDS[0]).toBe('PAYGATE_ID')
    expect(SIGNATURE_FIELDS[10]).toBe('NOTIFY_URL')
  })

  describe('STATUS_MAP', () => {
    test('contains all 7 PayGate status codes', () => {
      expect(Object.keys(STATUS_MAP)).toHaveLength(7)
      expect(STATUS_MAP['0']).toBe('Not Done')
      expect(STATUS_MAP['1']).toBe('Approved')
      expect(STATUS_MAP['2']).toBe('Declined')
      expect(STATUS_MAP['3']).toBe('Cancelled')
      expect(STATUS_MAP['4']).toBe('User Cancelled')
      expect(STATUS_MAP['5']).toBe('Received by PayGate')
      expect(STATUS_MAP['7']).toBe('Settlement Voided')
    })

    test('missing code returns undefined', () => {
      expect(STATUS_MAP['6']).toBeUndefined()
      expect(STATUS_MAP['99']).toBeUndefined()
    })
  })

  describe('TRANSACTION_STATUS_OPTIONS', () => {
    test('has same codes as STATUS_MAP keys', () => {
      const codes = TRANSACTION_STATUS_OPTIONS.map((o) => o.value).sort()
      const mapCodes = Object.keys(STATUS_MAP).sort()
      expect(codes).toEqual(mapCodes)
    })

    test('all options have labels', () => {
      for (const opt of TRANSACTION_STATUS_OPTIONS) {
        expect(opt.label).toBeTruthy()
        expect(typeof opt.label).toBe('string')
      }
    })
  })

  describe('CURRENCY_LOCALE_MAP', () => {
    test('contains ZAR, BWP, USD', () => {
      expect(Object.keys(CURRENCY_LOCALE_MAP).sort()).toEqual(['BWP', 'USD', 'ZAR'])
    })

    test('ZAR maps to ZAF/en-za', () => {
      expect(CURRENCY_LOCALE_MAP.ZAR).toEqual({ country: 'ZAF', locale: 'en-za' })
    })

    test('BWP maps to BWA/en-bw', () => {
      expect(CURRENCY_LOCALE_MAP.BWP).toEqual({ country: 'BWA', locale: 'en-bw' })
    })

    test('USD maps to USA/en-us', () => {
      expect(CURRENCY_LOCALE_MAP.USD).toEqual({ country: 'USA', locale: 'en-us' })
    })

    test('unknown currency returns undefined', () => {
      expect(CURRENCY_LOCALE_MAP['EUR']).toBeUndefined()
    })
  })

  describe('CURRENCY_OPTIONS', () => {
    test('has ZAR, BWP, USD', () => {
      const values = CURRENCY_OPTIONS.map((o) => o.value).sort()
      expect(values).toEqual(['BWP', 'USD', 'ZAR'])
    })

    test('labels match values', () => {
      for (const opt of CURRENCY_OPTIONS) {
        expect(opt.label).toBe(opt.value)
      }
    })
  })
})
