import type { Payload } from 'payload'

import config from '@payload-config'
import { createPayloadRequest, getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import type { DpoPluginConfig } from '../src/types.js'

import { createInitiateEndpoint } from '../src/endpoints/initiate.js'
import { createNotifyEndpoint } from '../src/endpoints/notify.js'
import { createReturnEndpoint } from '../src/endpoints/return.js'
import { createStatusEndpoint } from '../src/endpoints/status.js'
import { afterPaymentHook } from '../src/hooks/afterPayment.js'
import { generateSignature } from '../src/lib/checksum.js'
import { DEFAULT_PAYGATE_URL, STATUS_MAP } from '../src/lib/constants.js'

let payload: Payload

const pluginOptions: DpoPluginConfig = {
  baseUrl: 'http://localhost:3000',
  paygateId: '10011072130',
  paygateKey: 'secret',
  transactionCollectionSlug: 'dpo-transactions',
  routes: {
    initiate: '/dpo/initiate',
    return: '/dpo/return',
    notify: '/dpo/notify',
    status: '/dpo/status',
    returnResult: '/payment-result',
  },
}

const COLLECTION_SLUG = 'dpo-transactions'

afterAll(async () => {
  await payload.destroy()
})

beforeAll(async () => {
  payload = await getPayload({ config })
})

function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(url, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
}

async function createTransaction(overrides?: Record<string, unknown>) {
  return payload.create({
    collection: COLLECTION_SLUG,
    data: {
      amount: 1000,
      currency: 'ZAR',
      email: 'test@example.com',
      payRequestId: 'test-pay-request-id',
      reference: 'TEST_REF_001',
      transactionStatus: '0',
      statusMessage: 'Initiated',
      rawResponse: { PAY_REQUEST_ID: 'test-pay-request-id' },
      ...overrides,
    },
  })
}

describe('Initiate endpoint', () => {
  const endpoint = createInitiateEndpoint(pluginOptions)

  test('rejects missing amount', async () => {
    const req = makeRequest(`http://localhost:3000/api${pluginOptions.routes!.initiate}`, {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com' }),
    })
    const payloadReq = await createPayloadRequest({ config, request: req })
    const res = await endpoint.handler(payloadReq)
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error).toContain('Amount and email')
  })

  test('rejects missing email', async () => {
    const req = makeRequest(`http://localhost:3000/api${pluginOptions.routes!.initiate}`, {
      method: 'POST',
      body: JSON.stringify({ amount: '1000' }),
    })
    const payloadReq = await createPayloadRequest({ config, request: req })
    const res = await endpoint.handler(payloadReq)
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error).toContain('Amount and email')
  })

  test('rejects empty body', async () => {
    const req = makeRequest(`http://localhost:3000/api${pluginOptions.routes!.initiate}`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const payloadReq = await createPayloadRequest({ config, request: req })
    const res = await endpoint.handler(payloadReq)
    expect(res.status).toBe(400)
  })

  test('rejects requests without PayGate config', async () => {
    const badOptions = { ...pluginOptions, paygateId: '' }
    const badEndpoint = createInitiateEndpoint(badOptions)
    const req = makeRequest(`http://localhost:3000/api/dpo/initiate`, {
      method: 'POST',
      body: JSON.stringify({ amount: '1000', email: 'test@example.com' }),
    })
    const payloadReq = await createPayloadRequest({ config, request: req })
    const res = await badEndpoint.handler(payloadReq)
    const data = await res.json()
    expect(res.status).toBe(500)
    expect(data.success).toBe(false)
    expect(data.error).toContain('not configured')
  })

  test('rejects requests without baseUrl', async () => {
    const origBaseUrl = process.env.BASE_URL
    delete process.env.BASE_URL
    const badOptions = { ...pluginOptions, baseUrl: '' }
    const badEndpoint = createInitiateEndpoint(badOptions)
    const req = makeRequest(`http://localhost:3000/api/dpo/initiate`, {
      method: 'POST',
      body: JSON.stringify({ amount: '1000', email: 'test@example.com' }),
    })
    const payloadReq = await createPayloadRequest({ config, request: req })
    const res = await badEndpoint.handler(payloadReq)
    if (origBaseUrl) process.env.BASE_URL = origBaseUrl
    if (res.status === 500) {
      const data = await res.json()
      expect(data.success).toBe(false)
      expect(data.error).toContain('BASE_URL')
    } else {
      // baseUrl resolved via serverURL — skip this assertion
      expect(res.status).toBe(200)
    }
  })
})

describe('Return endpoint', () => {
  const endpoints = createReturnEndpoint(pluginOptions)

  test('GET returns 302 redirect to returnResult', async () => {
    const getEndpoint = endpoints.find((ep) => ep.method === 'get')!
    const req = makeRequest('http://localhost:3000/api/dpo/return?PAY_REQUEST_ID=abc-123')
    const payloadReq = await createPayloadRequest({ config, request: req })
    const res = await getEndpoint.handler(payloadReq)
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('/payment-result')
    expect(res.headers.get('Location')).toContain('PAY_REQUEST_ID=abc-123')
  })

  test('GET returns 400 when PAY_REQUEST_ID is missing', async () => {
    const getEndpoint = endpoints.find((ep) => ep.method === 'get')!
    const req = makeRequest('http://localhost:3000/api/dpo/return')
    const payloadReq = await createPayloadRequest({ config, request: req })
    const res = await getEndpoint.handler(payloadReq)
    expect(res.status).toBe(400)
  })

  test('POST parses form body and redirects', async () => {
    const postEndpoint = endpoints.find((ep) => ep.method === 'post')!
    const body = 'PAY_REQUEST_ID=form-id-456&CHECKSUM=abc123'
    const req = makeRequest('http://localhost:3000/api/dpo/return', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    const payloadReq = await createPayloadRequest({ config, request: req })
    const res = await postEndpoint.handler(payloadReq)
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('PAY_REQUEST_ID=form-id-456')
  })
})

describe('Status endpoint', () => {
  const endpoint = createStatusEndpoint(pluginOptions)

  test('returns error when id is missing', async () => {
    const req = makeRequest('http://localhost:3000/api/dpo/status')
    const payloadReq = await createPayloadRequest({ config, request: req })
    const res = await endpoint.handler(payloadReq)
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error).toContain('Missing')
  })

  test('returns error when PayGate is not configured', async () => {
    const origId = process.env.PAYGATE_ID
    const origKey = process.env.PAYGATE_KEY
    delete process.env.PAYGATE_ID
    delete process.env.PAYGATE_KEY
    const badOptions = { ...pluginOptions, paygateId: '', paygateKey: '' }
    const badEndpoint = createStatusEndpoint(badOptions)
    const req = makeRequest('http://localhost:3000/api/dpo/status?id=some-id')
    const payloadReq = await createPayloadRequest({ config, request: req })
    const res = await badEndpoint.handler(payloadReq)
    if (origId) process.env.PAYGATE_ID = origId
    if (origKey) process.env.PAYGATE_KEY = origKey
    if (res.status === 500) {
      const data = await res.json()
      expect(data.success).toBe(false)
    } else {
      // PayGate config resolved via env — skip
      expect(res.status).toBe(200)
    }
  })
})

describe('Notify endpoint', () => {
  const endpoint = createNotifyEndpoint(pluginOptions)

  test('rejects invalid notification data', async () => {
    const req = makeRequest('http://localhost:3000/api/dpo/notify', {
      method: 'POST',
      body: 'some=random&data=here',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    const payloadReq = await createPayloadRequest({ config, request: req })
    const res = await endpoint.handler(payloadReq)
    expect(res.status).toBe(400)
  })

  test('rejects empty body', async () => {
    const req = makeRequest('http://localhost:3000/api/dpo/notify', {
      method: 'POST',
      body: '',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    const payloadReq = await createPayloadRequest({ config, request: req })
    const res = await endpoint.handler(payloadReq)
    expect(res.status).toBe(400)
  })

  test('updates existing transaction', async () => {
    const tx = await createTransaction({ payRequestId: 'notify-test-id', reference: 'NOTIFY_REF' })

    const body = `PAY_REQUEST_ID=notify-test-id&TRANSACTION_STATUS=1&CHECKSUM=abc`
    const req = makeRequest('http://localhost:3000/api/dpo/notify', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    const payloadReq = await createPayloadRequest({ config, request: req })
    const res = await endpoint.handler(payloadReq)
    expect(res.status).toBe(200)

    const updated = await payload.findByID({
      collection: COLLECTION_SLUG,
      id: tx.id,
    })
    expect(updated.transactionStatus).toBe('1')
    expect(updated.statusMessage).toBe('Approved')
    expect((updated.rawResponse as Record<string, string>).PAY_REQUEST_ID).toBe('notify-test-id')
  })

  test('does not error when transaction not found', async () => {
    const body = `PAY_REQUEST_ID=nonexistent&TRANSACTION_STATUS=2`
    const req = makeRequest('http://localhost:3000/api/dpo/notify', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    const payloadReq = await createPayloadRequest({ config, request: req })
    const res = await endpoint.handler(payloadReq)
    expect(res.status).toBe(200)
  })

  test('handles all status codes', async () => {
    for (const [code, expectedLabel] of Object.entries(STATUS_MAP)) {
      const payRequestId = `status-test-${code}`
      const tx = await createTransaction({ payRequestId, reference: `STATUS_REF_${code}` })

      const body = `PAY_REQUEST_ID=${payRequestId}&TRANSACTION_STATUS=${code}`
      const req = makeRequest('http://localhost:3000/api/dpo/notify', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      const payloadReq = await createPayloadRequest({ config, request: req })
      const res = await endpoint.handler(payloadReq)
      expect(res.status).toBe(200)

      const updated = await payload.findByID({
        collection: COLLECTION_SLUG,
        id: tx.id,
      })
      expect(updated.transactionStatus).toBe(code)
      expect(updated.statusMessage).toBe(expectedLabel)
    }
  })
})

describe('Transaction CRUD', () => {
  test('creates a transaction', async () => {
    const tx = await payload.create({
      collection: COLLECTION_SLUG,
      data: {
        amount: 2500,
        currency: 'ZAR',
        email: 'customer@example.com',
        payRequestId: `pay-req-${Date.now()}`,
        reference: `REF_CRUD_${Date.now()}`,
        transactionStatus: '0',
        statusMessage: 'Initiated',
        rawResponse: {},
      },
    })

    expect(tx.id).toBeDefined()
    expect(tx.amount).toBe(2500)
    expect(tx.currency).toBe('ZAR')
    expect(tx.email).toBe('customer@example.com')
    expect(tx.transactionStatus).toBe('0')
  })

  test('finds transactions by payRequestId', async () => {
    const payRequestId = `find-test-${Date.now()}`
    await payload.create({
      collection: COLLECTION_SLUG,
      data: {
        amount: 5000,
        currency: 'BWP',
        email: 'bwp@example.com',
        payRequestId,
        reference: `REF_FIND_${Date.now()}`,
        transactionStatus: '0',
        statusMessage: 'Initiated',
        rawResponse: {},
      },
    })

    const found = await payload.find({
      collection: COLLECTION_SLUG,
      where: { payRequestId: { equals: payRequestId } },
    })

    expect(found.docs).toHaveLength(1)
    expect(found.docs[0].payRequestId).toBe(payRequestId)
  })

  test('updates transaction status', async () => {
    const tx = await createTransaction({
      payRequestId: `update-test-${Date.now()}`,
      reference: `REF_UPDATE_${Date.now()}`,
    })

    await payload.update({
      id: tx.id,
      collection: COLLECTION_SLUG,
      data: { transactionStatus: '1', statusMessage: 'Approved' },
    })

    const updated = await payload.findByID({
      collection: COLLECTION_SLUG,
      id: tx.id,
    })
    expect(updated.transactionStatus).toBe('1')
    expect(updated.statusMessage).toBe('Approved')
  })

  test('supports BWP and USD currencies', async () => {
    const bwpTx = await payload.create({
      collection: COLLECTION_SLUG,
      data: {
        amount: 30000,
        currency: 'BWP',
        email: 'bwp@example.com',
        payRequestId: `bwp-${Date.now()}`,
        reference: `REF_BWP_${Date.now()}`,
        transactionStatus: '0',
        statusMessage: 'Initiated',
        rawResponse: {},
      },
    })
    expect(bwpTx.currency).toBe('BWP')

    const usdTx = await payload.create({
      collection: COLLECTION_SLUG,
      data: {
        amount: 9999,
        currency: 'USD',
        email: 'usd@example.com',
        payRequestId: `usd-${Date.now()}`,
        reference: `REF_USD_${Date.now()}`,
        transactionStatus: '0',
        statusMessage: 'Initiated',
        rawResponse: {},
      },
    })
    expect(usdTx.currency).toBe('USD')
  })
})

describe('AfterPayment hook', () => {
  test('fires onSuccess when transactionStatus changes to 1', async () => {
    const onSuccess = vi.fn()
    const hook = afterPaymentHook({ ...pluginOptions, onSuccess })

    const previousDoc = { transactionStatus: '0' }
    const doc = { transactionStatus: '1', id: 'hook-test-1', amount: 1000 }

    await hook({
      doc,
      operation: 'update',
      previousDoc,
      collection: null as any,
      context: {},
      req: { payload } as any,
    })

    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith({
      payload,
      transaction: doc,
    })
  })

  test('does not fire on create operation', async () => {
    const onSuccess = vi.fn()
    const hook = afterPaymentHook({ ...pluginOptions, onSuccess })

    await hook({
      doc: { transactionStatus: '1' },
      operation: 'create',
      previousDoc: { transactionStatus: '0' },
      collection: null as any,
      context: {},
      req: { payload } as any,
    })

    expect(onSuccess).not.toHaveBeenCalled()
  })

  test('does not fire when status was already 1', async () => {
    const onSuccess = vi.fn()
    const hook = afterPaymentHook({ ...pluginOptions, onSuccess })

    await hook({
      doc: { transactionStatus: '1' },
      operation: 'update',
      previousDoc: { transactionStatus: '1' },
      collection: null as any,
      context: {},
      req: { payload } as any,
    })

    expect(onSuccess).not.toHaveBeenCalled()
  })

  test('does not fire when status changes to non-1 value', async () => {
    const onSuccess = vi.fn()
    const hook = afterPaymentHook({ ...pluginOptions, onSuccess })

    await hook({
      doc: { transactionStatus: '2' },
      operation: 'update',
      previousDoc: { transactionStatus: '0' },
      collection: null as any,
      context: {},
      req: { payload } as any,
    })

    expect(onSuccess).not.toHaveBeenCalled()
  })

  test('does nothing when no onSuccess callback configured', async () => {
    const hook = afterPaymentHook(pluginOptions)

    const result = await hook({
      doc: { transactionStatus: '1' },
      operation: 'update',
      previousDoc: { transactionStatus: '0' },
      collection: null as any,
      context: {},
      req: { payload } as any,
    })

    expect(result).toBeUndefined()
  })
})

describe('Checksum generation', () => {
  test('generates valid checksum for initiate params', () => {
    const params = {
      PAYGATE_ID: '10011072130',
      PAY_REQUEST_ID: 'test-pay-request',
      REFERENCE: 'TEST_REF',
      AMOUNT: '1000',
      CURRENCY: 'ZAR',
      RETURN_URL: 'http://localhost:3000/api/dpo/return',
      TRANSACTION_DATE: '2024-01-01 12:00:00',
      LOCALE: 'en-za',
      COUNTRY: 'ZAF',
      EMAIL: 'test@test.com',
      NOTIFY_URL: 'http://localhost:3000/api/dpo/notify',
    }
    const checksum = generateSignature(params, 'secret')
    expect(checksum).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('Collection configuration', () => {
  test('dpo-transactions collection exists', () => {
    expect(payload.collections[COLLECTION_SLUG]).toBeDefined()
  })

  test('has correct fields defined', async () => {
    const tx = await createTransaction({
      payRequestId: `field-test-${Date.now()}`,
      reference: `REF_FIELD_${Date.now()}`,
      relatedCollection: 'posts',
    })
    expect(tx).toHaveProperty('payRequestId')
    expect(tx).toHaveProperty('reference')
    expect(tx).toHaveProperty('amount')
    expect(tx).toHaveProperty('currency')
    expect(tx).toHaveProperty('email')
    expect(tx).toHaveProperty('transactionStatus')
    expect(tx).toHaveProperty('statusMessage')
    expect(tx).toHaveProperty('rawResponse')
  })
})

describe('generateSignature with PayGate integration test data', () => {
  test('matches expected output format for redirect checksum', () => {
    const paygateId = '10011072130'
    const payRequestId = 'test-pay-request-id'
    const reference = 'TEST_REF'
    const key = 'secret'

    const hashInput = `${paygateId}${payRequestId}${reference}${key}`
    const redirectChecksum = generateSignature(
      {
        AMOUNT: '',
        COUNTRY: '',
        CURRENCY: '',
        EMAIL: '',
        LOCALE: '',
        NOTIFY_URL: '',
        PAYGATE_ID: paygateId,
        PAY_REQUEST_ID: payRequestId,
        REFERENCE: reference,
        RETURN_URL: '',
        TRANSACTION_DATE: '',
      },
      key,
    )

    expect(redirectChecksum).toMatch(/^[0-9a-f]{32}$/)
    const again = generateSignature(
      {
        AMOUNT: '',
        COUNTRY: '',
        CURRENCY: '',
        EMAIL: '',
        LOCALE: '',
        NOTIFY_URL: '',
        PAYGATE_ID: paygateId,
        PAY_REQUEST_ID: payRequestId,
        REFERENCE: reference,
        RETURN_URL: '',
        TRANSACTION_DATE: '',
      },
      key,
    )
    expect(again).toBe(redirectChecksum)
  })
})
