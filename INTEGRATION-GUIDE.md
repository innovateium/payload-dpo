# Payload DPO — Integration Guide

> **Audience**: Human developers and LLM-based coding assistants
> **Plugin**: `@innovateium/payload-dpo` — PayGate PayWeb3 for Payload CMS v3

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [PayGate PayWeb3 Flow](#3-paygate-payweb3-flow)
4. [Integration Paths](#4-integration-paths)
5. [Standalone Integration](#5-standalone-integration)
6. [E-commerce Adapter Integration](#6-e-commerce-adapter-integration)
7. [Dev Environment Setup](#7-dev-environment-setup)
8. [Route Priority & the IPN Gotcha](#8-route-priority--the-ipn-gotcha)
9. [Signature / Checksum Mechanics](#9-signature--checksum-mechanics)
10. [End-to-End Transaction Flow](#10-end-to-end-transaction-flow)
11. [Transaction Collection Reference](#11-transaction-collection-reference)
12. [Configuration Reference](#12-configuration-reference)
13. [Troubleshooting](#13-troubleshooting)
14. [Production Checklist](#14-production-checklist)

---

## 1. Overview

`@innovateium/payload-dpo` is a Payload CMS v3 plugin that integrates **PayGate PayWeb3** (Direct Pay Online) — the primary payment gateway serving South Africa, Botswana, and broader African markets. It supports two modes:

- **Standalone**: Use the built-in `dpo-transactions` collection and Payload config endpoints for a self-contained payment flow.
- **E-commerce adapter**: A drop-in `PaymentAdapter` for `@payloadcms/plugin-ecommerce` that handles order creation and cart cleanup automatically.

Both modes use the same underlying PayGate API: `initiate.trans`, `process.trans`, `query.trans`, and IPN callbacks.

---

## 2. Prerequisites

- **Node.js** `^18.20.2 || >=20.9.0`
- **pnpm** `^9 || ^10 || ^11` (or npm/yarn)
- **Payload CMS** `^3.84.1`
- **PayGate merchant account** with [PayGate](https://www.paygate.co.za)
- **Publicly accessible URL** for IPN callbacks (use ngrok for local dev)

### Test credentials

```
PAYGATE_ID=10011072130
PAYGATE_KEY=secret
```

> **Important**: Test credentials only process **ZAR** transactions. BWP and USD require production credentials.

---

## 3. PayGate PayWeb3 Flow

PayGate PayWeb3 uses a 3-step flow:

```
Step 1: Initiate
  Your Server ──POST initiate.trans──> PayGate
  PayGate ──{ PAY_REQUEST_ID, CHECKSUM }──> Your Server

Step 2: Redirect
  Browser ──POST process.trans──> PayGate (hosted payment page)
  User enters card details on PayGate's page

Step 3: Notify & Return (parallel)
  PayGate ──POST /dpo/notify──> Your Server (IPN - async)
  PayGate ──302 Redirect──> Browser ──GET /dpo/return──> Your Server
```

### Key concepts

| Term                 | Meaning                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `PAYGATE_ID`         | Merchant ID assigned by PayGate                                                                                             |
| `PAYGATE_KEY`        | Secret key for signing requests                                                                                             |
| `PAY_REQUEST_ID`     | Unique transaction ID returned by PayGate on initiate                                                                       |
| `REFERENCE`          | Your internal order reference                                                                                               |
| `CHECKSUM`           | MD5 hash used to verify request/response integrity                                                                          |
| `initiate.trans`     | Initial API call to create a payment request                                                                                |
| `process.trans`      | Hosted payment page URL (user redirected here)                                                                              |
| `query.trans`        | API call to check transaction status                                                                                        |
| `TRANSACTION_STATUS` | `0`=Not Done, `1`=Approved, `2`=Declined, `3`=Cancelled, `4`=User Cancelled, `5`=Received by PayGate, `7`=Settlement Voided |

---

## 4. Integration Paths

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Payload CMS App                      │
│                                                             │
│  ┌─────────────────────┐    ┌────────────────────────────┐  │
│  │  Standalone Mode    │    │  E-commerce Adapter Mode   │  │
│  │                     │    │                            │  │
│  │  dpoPlugin({...})   │    │  ecommercePlugin({         │  │
│  │                     │    │    payments: {             │  │
│  │  - Own collection   │    │      paymentMethods: [     │  │
│  │  - Own endpoints    │    │        paygateAdapter()    │  │
│  │  - Simple setup     │    │      ]                     │  │
│  │                     │    │    }                       │  │
│  │  Best for:          │    │  })                        │  │
│  │  • Custom payment   │    │                            │  │
│  │    flows            │    │  - Uses ecommerce tx coll  │  │
│  │  • Simple shops     │    │  - Auto order creation     │  │
│  │  • No ecommerce     │    │  - Auto cart cleanup       │  │
│  │    plugin             │    │                            │  │
│  └─────────────────────┘    └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Do not use both modes simultaneously.** Choose one.

---

## 5. Standalone Integration

### 5.1 Install

```bash
pnpm add @innovateium/payload-dpo
```

### 5.2 Configure `payload.config.ts`

```ts
import { buildConfig } from 'payload'
import { dpoPlugin } from '@innovateium/payload-dpo'

export default buildConfig({
  plugins: [
    dpoPlugin({
      paygateId: process.env.PAYGATE_ID,
      paygateKey: process.env.PAYGATE_KEY,
      baseUrl: process.env.BASE_URL,

      // Optional: add a polymorphic relationship to your collections
      collections: { products: true, subscriptions: true },

      // Optional: custom routes
      routes: {
        initiate: '/dpo/initiate',
        return: '/dpo/return',
        notify: '/dpo/notify',
        status: '/dpo/status',
        returnResult: '/payment-result',
      },

      // Optional: callback on successful payment
      onSuccess: async ({ payload, transaction }) => {
        await payload.sendEmail({
          to: transaction.email as string,
          subject: 'Payment received!',
        })
      },
    }),
  ],
})
```

### 5.3 Environment variables

```env
PAYGATE_ID=10011072130
PAYGATE_KEY=secret
BASE_URL=http://localhost:3000
```

### 5.4 What gets registered

| Resource   | Details                                                       |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| Collection | `dpo-transactions` (admin group: "DPO Payments")              |
| Endpoint   | `POST /api/dpo/initiate` — creates transaction, calls PayGate |
| Endpoint   | `GET                                                          | POST /api/dpo/return` — handles user redirect, 302s to result page |
| Endpoint   | `POST /api/dpo/notify` — processes IPN from PayGate           |
| Endpoint   | `GET /api/dpo/status` — queries `query.trans` for status      |

### 5.5 Front-end: initiate a payment

```tsx
// Client component (e.g., /checkout/page.tsx)
'use client'

async function handlePay() {
  const res = await fetch('/api/dpo/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: '1000', // R10.00 in cents
      email: 'customer@example.com',
      currency: 'ZAR',
    }),
  })

  const data = await res.json()
  if (!data.success) throw new Error(data.error)

  // Redirect user to PayGate's hosted page
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = data.paymentUrl
  form.innerHTML = `
    <input type="hidden" name="PAY_REQUEST_ID" value="${data.payRequestId}" />
    <input type="hidden" name="CHECKSUM" value="${data.checksum}" />
  `
  document.body.appendChild(form)
  form.submit()
}
```

### 5.6 Front-end: handle return

When PayGate redirects the user back, they land on `/payment-result?PAY_REQUEST_ID=xxx` (or your configured `returnResult` path). Query the status:

```tsx
// payment-result/page.tsx
'use client'

import { useSearchParams } from 'next/navigation'

export default function PaymentResult() {
  const searchParams = useSearchParams()
  const payRequestId = searchParams.get('PAY_REQUEST_ID')

  useEffect(() => {
    if (!payRequestId) return
    fetch(`/api/dpo/status?id=${encodeURIComponent(payRequestId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.isSuccessful) {
          // Payment approved!
        } else {
          // Payment declined/failed
        }
      })
  }, [payRequestId])

  // ... render UI
}
```

---

## 6. E-commerce Adapter Integration

### 6.1 Install

```bash
pnpm add @innovateium/payload-dpo @payloadcms/plugin-ecommerce
```

### 6.2 Configure `payload.config.ts`

```ts
import { buildConfig } from 'payload'
import { ecommercePlugin } from '@payloadcms/plugin-ecommerce'
import { paygateAdapter, paygateAdapterClient } from '@innovateium/payload-dpo'
import type { PaymentAdapterClient } from '@innovateium/payload-dpo'

export default buildConfig({
  plugins: [
    ecommercePlugin({
      payments: {
        paymentAdapters: [paygateAdapter],
        paymentMethodClients: [paygateAdapterClient()],
        paymentMethods: [
          paygateAdapter({
            paygateId: process.env.PAYGATE_ID!,
            paygateKey: process.env.PAYGATE_KEY!,
            baseUrl: process.env.BASE_URL,
            defaultCurrency: 'ZAR',
            label: 'PayGate',
          }),
        ],
      },
      // ... other ecommerce config
    }),
  ],
})
```

### 6.3 What gets registered

| Resource    | Details                                                                        |
| ----------- | ------------------------------------------------------------------------------ |
| Endpoint    | `POST /api/payments/paygate/initiate` — initiates payment with PayGate         |
| Endpoint    | `POST /api/payments/paygate/confirm-order` — confirms, creates Order           |
| Endpoint    | `POST /api/payments/paygate/webhooks` — IPN handler                            |
| Field group | `paygate` group on the `transactions` collection (`payRequestId`, `reference`) |

### 6.4 How the adapter flow works

1. **User clicks "Pay"** → e-commerce plugin calls `initiatePayment`
2. **Adapter calculates cart total** from `cart.items[].product.pricePayload[CURRENCY]`
3. **Adapter calls `initiate.trans`** and creates a transaction record
4. **Browser redirects** to PayGate
5. **PayGate redirects back** → e-commerce plugin calls `confirmOrder`
6. **Adapter queries `query.trans`** → if status is `1` (Approved), creates Order, clears cart, stamps `purchasedAt`

---

## 7. Dev Environment Setup

The repository includes a `dev/` directory with a fully functional Next.js app for testing.

```bash
git clone https://github.com/innovateium/payload-dpo.git
cd payload-dpo
pnpm install
cp dev/.env.example dev/.env.local
pnpm dev
```

Visit `http://localhost:3000/test-payment` to test the payment flow.

### Dev app structure

```
dev/
├── (payload)/api/[...slug]/route.ts     # Payload REST (initiate, status, admin)
├── api/dpo/return/route.ts              # Standalone return handler (GET|POST)
├── api/dpo/notify/route.ts              # Standalone IPN handler (POST)
├── test-payment/page.tsx                # Test payment form
├── payment-result/page.tsx              # Result display page
├── layout.tsx                           # Root layout
├── payload.config.ts                    # Plugin config with test credentials
├── seed.ts                              # Seeds admin user
├── int.spec.ts                          # Integration tests (vitest)
├── e2e.spec.ts                          # E2E tests (Playwright)
├── helpers/testEmailAdapter.ts          # Test email adapter
└── .env.example                         # Env template
```

### Available scripts

```bash
pnpm dev          # Start dev server (next dev)
pnpm build        # Build plugin (SWC + types)
pnpm test:int     # Run integration tests
pnpm test:e2e     # Run Playwright E2E tests
pnpm lint         # ESLint
```

---

## 8. Route Priority & the IPN Gotcha

### Route resolution order

Next.js resolves routes by specificity (most specific path wins):

```
Priority 1: dev/app/api/dpo/return/route.ts     (exact: /api/dpo/return)
Priority 2: dev/app/api/dpo/notify/route.ts     (exact: /api/dpo/notify)
Priority 3: dev/app/(payload)/api/[...slug]/route.ts  (catch-all: /api/dpo/*)
```

The `return` and `notify` standalone routes take precedence over the Payload REST catch-all.

### The IPN body consumption problem

PayGate sends IPN notifications as `application/x-www-form-urlencoded` POST bodies.

**Problem**: Payload's REST handler (`@payloadcms/next`) calls `req.json()` on all POST requests, which reads and consumes the body stream. When the plugin's notify endpoint later calls `req.text()`, it gets an empty string because the stream is already consumed.

**Solution in the dev example**: A standalone Next.js route at `api/dpo/notify/route.ts` reads `req.text()` directly, parses the form data, and updates the transaction. This runs **before** Payload's REST handler gets a chance to consume the body.

**Pattern for production**: You need a similar standalone route or middleware that handles the IPN before Payload processes the request. The same approach is needed for the `return` endpoint if PayGate sends form-encoded POST data.

```ts
// api/dpo/notify/route.ts (standalone Next.js route)
import { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

export const POST = async (req: NextRequest) => {
  const rawText = await req.text() // Read before Payload consumes it
  const body = parseForm(rawText)

  const payRequestId = body.PAY_REQUEST_ID
  const transactionStatus = body.TRANSACTION_STATUS

  const payload = await getPayload({ config: configPromise })

  const existing = await payload.find({
    collection: 'dpo-transactions',
    where: { payRequestId: { equals: payRequestId } },
  })

  if (existing.docs.length > 0) {
    await payload.update({
      id: existing.docs[0].id,
      collection: 'dpo-transactions',
      data: {
        transactionStatus,
        rawResponse: body,
        statusMessage: STATUS_MAP[transactionStatus] || 'Unknown',
      },
    })
  }

  return new Response('OK', { status: 200 })
}
```

---

## 9. Signature / Checksum Mechanics

PayGate uses MD5 checksums to verify the integrity of requests and responses.

### Signature generation

The checksum is an MD5 hash of concatenated field values (in strict order) + the `PAYGATE_KEY`:

```
checksum = MD5(
  PAYGATE_ID +
  PAY_REQUEST_ID +
  REFERENCE +
  AMOUNT +
  CURRENCY +
  RETURN_URL +
  TRANSACTION_DATE +
  LOCALE +
  COUNTRY +
  EMAIL +
  NOTIFY_URL +
  PAYGATE_KEY
).toLowerCase()
```

### When signatures are used

| Direction           | Fields signed (same order)                                                             |
| ------------------- | -------------------------------------------------------------------------------------- |
| Initiate request    | All 11 fields above (signed by plugin)                                                 |
| Initiate response   | Signed by PayGate (you verify with `generateSignature()`)                              |
| Redirect to PayGate | Simplified: `MD5(PAYGATE_ID + PAY_REQUEST_ID + REFERENCE + PAYGATE_KEY).toLowerCase()` |
| Query request       | `MD5(PAYGATE_ID + PAY_REQUEST_ID + REFERENCE + PAYGATE_KEY).toLowerCase()`             |

### The `generateSignature` function

```ts
// src/lib/checksum.ts
import crypto from 'crypto'
import { SIGNATURE_FIELDS } from './constants.js'

export function generateSignature(
  params: Record<string, string | undefined>,
  paygateKey: string,
): string {
  const hashString =
    SIGNATURE_FIELDS.map((field) => String(params[field] || '')).join('') + paygateKey

  return crypto.createHash('md5').update(hashString).digest('hex').toLowerCase()
}
```

### `SIGNATURE_FIELDS` order (must not change)

```ts
const SIGNATURE_FIELDS = [
  'PAYGATE_ID',
  'PAY_REQUEST_ID',
  'REFERENCE',
  'AMOUNT',
  'CURRENCY',
  'RETURN_URL',
  'TRANSACTION_DATE',
  'LOCALE',
  'COUNTRY',
  'EMAIL',
  'NOTIFY_URL',
] as const
```

---

## 10. End-to-End Transaction Flow

### Standalone mode sequence diagram

```
Browser                 Your Server               PayGate
   │                         │                       │
   │  POST /api/dpo/initiate │                       │
   │  {amount, email, curr}  │                       │
   │────────────────────────>│                       │
   │                         │  Create dpo-tx doc    │
   │                         │  POST initiate.trans  │
   │                         │──────────────────────>│
   │                         │  {PAY_REQUEST_ID,     │
   │                         │   CHECKSUM}           │
   │                         │<──────────────────────│
   │  {payRequestId,         │                       │
   │   checksum, paymentUrl} │                       │
   │<────────────────────────│                       │
   │                         │                       │
   │  POST process.trans     │                       │
   │  (auto-submit form)     │                       │
   │────────────────────────────────────────────────>│
   │                         │                       │
   │  [User pays on PayGate page]                    │
   │                         │                       │
   │  ┌─ IPN ───────────────┐│                       │
   │  │ POST /api/dpo/notify ││                       │
   │  │ PAY_REQUEST_ID +     ││                       │
   │  │ TRANSACTION_STATUS   ││                       │
   │  │<─────────────────────││───────────────────────│
   │  │ Update tx status     ││                       │
   │  └──────────────────────┘│                       │
   │                         │                       │
   │  ┌─ Return ────────────┐│                       │
   │  │ GET /api/dpo/return  ││                       │
   │  │ ?PAY_REQUEST_ID=xxx  ││                       │
   │  │<─────────────────────││───────────────────────│
   │  │ 302 → /payment-result││                       │
   │  │──────────────────────││                       │
   │  └──────────────────────┘│                       │
   │                         │                       │
   │  GET /api/dpo/status    │                       │
   │  ?id=PAY_REQUEST_ID     │                       │
   │────────────────────────>│                       │
   │                         │  POST query.trans     │
   │                         │──────────────────────>│
   │                         │  {TRANSACTION_STATUS} │
   │                         │<──────────────────────│
   │  {isSuccessful: true,   │                       │
   │   transactionStatus: 1} │                       │
   │<────────────────────────│                       │
```

### What the plugin does at each stage

| Stage    | Plugin action                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| Initiate | Validates input → creates `dpo-transactions` doc (status: `0`) → calls `initiate.trans` → returns redirect data |
| Return   | Extracts `PAY_REQUEST_ID` → 302 redirects to `returnResult` page                                                |
| Notify   | Parses form body → looks up tx by `payRequestId` → updates `transactionStatus`, `rawResponse`, `statusMessage`  |
| Status   | Queries `query.trans` → returns `{ isSuccessful, transactionStatus, statusMessage, raw }`                       |

### When `onSuccess` fires

The `afterPayment` hook on the `dpo-transactions` collection fires when:

- The operation is an **update**
- `transactionStatus` changes **from** anything except `"1"` **to** `"1"` (Approved)

This is triggered by both the notify endpoint (IPN) and the status endpoint.

---

## 11. Transaction Collection Reference

### Standalone: `dpo-transactions`

| Field               | Type                   | Admin     | Description                                |
| ------------------- | ---------------------- | --------- | ------------------------------------------ |
| `payRequestId`      | `text` (unique, index) | Read-only | Returned by PayGate on initiate            |
| `reference`         | `text` (index)         | Read-only | Internal merchant reference                |
| `amount`            | `number`               | Read-only | Amount in cents                            |
| `currency`          | `select` (ZAR/BWP/USD) | Read-only | Transaction currency                       |
| `email`             | `email`                | Read-only | Customer email                             |
| `transactionStatus` | `select` (0-7)         | Read-only | Current PayGate status code                |
| `statusMessage`     | `text`                 | Read-only | Human-readable status                      |
| `rawResponse`       | `json`                 | Read-only | Full PayGate API response                  |
| `relatedCollection` | `text`                 | Read-only | Slug of related collection                 |
| `relatedDoc`        | `relationship`         | Read-only | Polymorphic link to a purchasable document |

Admin group: **DPO Payments**
Default columns in list view: `reference`, `amount`, `currency`, `transactionStatus`, `email`, `updatedAt`

### E-commerce adapter: `transactions` (from `@payloadcms/plugin-ecommerce`)

The adapter adds a `paygate` group field:

```
transactions/
├── paygate/
│   ├── payRequestId (text)
│   └── reference (text)
├── amount
├── currency
├── status
├── rawResponse (json - set by webhooks handler)
├── transactionStatus (text - set by webhooks handler)
└── ...
```

---

## 12. Configuration Reference

### `DpoPluginConfig` (standalone mode)

| Property                         | Default                        | Description                                             |
| -------------------------------- | ------------------------------ | ------------------------------------------------------- |
| `paygateId`                      | `process.env.PAYGATE_ID`       | PayGate merchant ID                                     |
| `paygateKey`                     | `process.env.PAYGATE_KEY`      | PayGate secret key                                      |
| `baseUrl`                        | `process.env.BASE_URL`         | Public URL (for RETURN/NOTIFY callbacks)                |
| `paygateUrl`                     | `https://secure.paygate.co.za` | PayGate API endpoint                                    |
| `disabled`                       | `false`                        | Skip endpoint registration (collection still registers) |
| `collections`                    | `undefined`                    | `{ slug: true }` — adds polymorphic relationship field  |
| `defaultCurrency`                | `'ZAR'`                        | Default currency (`'BWP'`, `'USD'`, `'ZAR'`)            |
| `defaultCountry`                 | Auto from currency             | ISO 3166-1 alpha-3 country code                         |
| `defaultLocale`                  | Auto from currency             | Locale string (e.g. `'en-za'`)                          |
| `transactionCollectionSlug`      | `'dpo-transactions'`           | Collection slug for transaction records                 |
| `registerTransactionsCollection` | `true`                         | Set `false` when using e-commerce plugin                |
| `routes`                         | See below                      | Custom API endpoint path overrides                      |
| `onSuccess`                      | `undefined`                    | `({ payload, transaction }) => Promise<void>` callback  |

### `DpoRoutes`

| Path           | Default                   | Description                                |
| -------------- | ------------------------- | ------------------------------------------ |
| `initiate`     | `/dpo/initiate`           | POST — start a payment                     |
| `return`       | `/dpo/return`             | GET/POST — PayGate redirect handler        |
| `returnResult` | `/checkout/confirm-order` | Front-end page shown after return redirect |
| `notify`       | `/dpo/notify`             | POST — IPN/webhook handler                 |
| `status`       | `/dpo/status`             | GET — query transaction status             |

### `paygateAdapter` args (e-commerce mode)

| Property           | Default                                   | Description                             |
| ------------------ | ----------------------------------------- | --------------------------------------- |
| `paygateId`        | `process.env.PAYGATE_ID`                  | PayGate merchant ID                     |
| `paygateKey`       | `process.env.PAYGATE_KEY`                 | PayGate secret key                      |
| `baseUrl`          | `process.env.BASE_URL`                    | Public URL                              |
| `returnUrl`        | `{baseUrl}/api/payments/paygate/webhooks` | Where PayGate redirects after payment   |
| `notifyUrl`        | `{baseUrl}/api/payments/paygate/webhooks` | Where PayGate sends IPN                 |
| `paygateUrl`       | `https://secure.paygate.co.za`            | PayGate API base                        |
| `defaultCurrency`  | `'ZAR'`                                   | Default currency                        |
| `defaultCountry`   | Auto from currency                        | ISO country code override               |
| `defaultLocale`    | Auto from currency                        | Locale override                         |
| `label`            | `'PayGate'`                               | Payment method label shown in UI        |
| `transactionsSlug` | `'transactions'`                          | E-commerce transactions collection slug |

### Currency auto-resolution

```ts
CURRENCY_LOCALE_MAP = {
  ZAR: { country: 'ZAF', locale: 'en-za' },
  BWP: { country: 'BWA', locale: 'en-bw' },
  USD: { country: 'USA', locale: 'en-us' },
}
```

---

## 13. Troubleshooting

### "BASE_URL is not configured"

The initiate endpoint needs a public URL to construct `RETURN_URL` and `NOTIFY_URL`. Set one of:

1. `baseUrl` in plugin config
2. `BASE_URL` in `.env`
3. `serverURL` in Payload config

```ts
// Option 1
dpoPlugin({ baseUrl: 'https://mysite.com' })

// Option 2 (.env)
BASE_URL=https://mysite.com

// Option 3 (payload.config.ts)
buildConfig({ serverURL: 'https://mysite.com' })
```

### IPN not updating transaction status

Symptom: Transaction status stays at `0` (Not Done) even after successful payment.

**Root cause**: Payload's REST handler consumes the POST body before the plugin's notify endpoint reads it. The `req.text()` call returns empty.

**Fix**: Add a standalone Next.js route for `/api/dpo/notify` that reads `req.text()` first. See the dev example at `dev/app/api/dpo/notify/route.ts`.

### "PayGate Error:" returned from initiate

Possible causes:

- Invalid `PAYGATE_ID` or `PAYGATE_KEY`
- Test credentials used with BWP/USD currency (tests only support ZAR)
- Incorrect `AMOUNT` format (should be numeric, in cents)
- Network issues reaching `https://secure.paygate.co.za`

### Transaction approved but no order created (e-commerce mode)

- Check that `confirmOrder` receives the correct `payRequestId`
- Verify the transaction exists in the `transactions` collection
- Check the `query.trans` response — if `TRANSACTION_STATUS` is not `"1"`, the adapter returns `orderID: ''`

### `amount` field issues

PayGate requires amounts in cents (integer). The plugin accepts strings and strips non-digits:

- `"10.50"` → `"1050"` is **wrong** (should be `"1050"` already)
- `"1000"` → `"1000"` is correct for R10.00
- The e-commerce adapter calculates from `pricePayload` automatically (prices should already be in cents)

### Test credentials only work with ZAR

PayGate's test account (`10011072130` / `secret`) rejects BWP and USD. For testing other currencies, you need production credentials.

---

## 14. Production Checklist

- [ ] Replace test credentials with production `PAYGATE_ID` and `PAYGATE_KEY`
- [ ] Set `BASE_URL` to your production domain (must be HTTPS)
- [ ] Verify PayGate IPN is reaching your server (check server logs for POSTs to `/api/dpo/notify`)
- [ ] Set up the standalone notify route if using Payload config endpoints (body consumption workaround)
- [ ] Test the full flow: initiate → PayGate → return → status check
- [ ] Test the IPN flow: initiate → PayGate → verify transaction status updates asynchronously
- [ ] Review `onSuccess` callback for side effects (emails, inventory updates, etc.)
- [ ] Configure transaction access control for admin UI (recommended: read-only for admin users)
- [ ] Enable HTTPS on your production server (PayGate requires valid SSL)

---

## References

- [PayGate PayWeb3 Documentation](https://www.paygate.co.za/payweb3/)
- [Payload CMS Plugin Docs](https://payloadcms.com/docs/plugins/overview)
- [@payloadcms/plugin-ecommerce](https://www.npmjs.com/package/@payloadcms/plugin-ecommerce)
- [PayGate JS Demo](https://github.com/innovateium/paygate-js-demo)
