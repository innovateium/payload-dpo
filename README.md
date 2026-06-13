# Payload DPO — PayGate PayWeb3 Plugin

[![npm](https://img.shields.io/npm/v/@innovateium/payload-dpo)](https://www.npmjs.com/package/@innovateium/payload-dpo)
[![License](https://img.shields.io/github/license/innovateium/payload-dpo)](LICENSE)
[![Beta](https://img.shields.io/badge/status-beta-yellow)]()

> **⚠️ WARNING: This plugin is under active development.**
> The API is unstable and may change without notice between minor versions.
> **Not recommended for production use yet.**

---

A [Payload CMS](https://payloadcms.com) v3 plugin integrating [PayGate PayWeb3](https://www.paygate.co.za/payweb3/) (Direct Pay Online) — a payment gateway serving South African and African markets. Supports both **standalone** usage and as a payment adapter for `@payloadcms/plugin-ecommerce`.

## Features

- **Standalone mode** — Initiate payments, handle redirects, process IPN notifications, and query transaction status — all via Payload config endpoints
- **E-commerce adapter** — Drop-in `paygateAdapter` for `@payloadcms/plugin-ecommerce` with automatic order creation and cart cleanup
- **PayGate status tracking** — Queries `query.trans` on confirmation, stores raw responses
- **IPN (webhook) support** — PayGate sends async notifications to update transaction status
- **Configurable** — Custom routes, currencies (ZAR/BWP/USD), transaction collection slug, `onSuccess` callbacks
- **Currency auto-resolution** — Country and locale auto-mapped from currency (ZAF, BWA, USA)

## Installation

```bash
pnpm add @innovateium/payload-dpo
# or
npm install @innovateium/payload-dpo
# or
yarn add @innovateium/payload-dpo
```

## Quick Start

### Environment variables

```bash
PAYGATE_ID=10011072130       # PayGate merchant ID (test: 10011072130)
PAYGATE_KEY=secret           # PayGate secret key (test: secret)
BASE_URL=http://localhost:3000  # Public URL for RETURN/NOTIFY callbacks
```

> **Note**: `BASE_URL` must be publicly reachable for PayGate IPN callbacks. Use [ngrok](https://ngrok.com) during local development.

## Usage

### Option A: Standalone (without e-commerce plugin)

Register the plugin in your `payload.config.ts`:

```ts
import { dpoPlugin } from '@innovateium/payload-dpo'

export default buildConfig({
  plugins: [
    dpoPlugin({
      paygateId: process.env.PAYGATE_ID,
      paygateKey: process.env.PAYGATE_KEY,
      baseUrl: process.env.BASE_URL,
      collections: { products: true }, // optional: adds relationship field
    }),
  ],
})
```

This registers:

- A **`dpo-transactions`** collection (admin: DPO Payments group)
- **4 API endpoints** at `/api/dpo/initiate`, `/api/dpo/return`, `/api/dpo/notify`, `/api/dpo/status`

### Option B: With `@payloadcms/plugin-ecommerce`

Use the `paygateAdapter` as a payment method:

```ts
import { buildConfig } from 'payload'
import { ecommercePlugin } from '@payloadcms/plugin-ecommerce'
import { paygateAdapter } from '@innovateium/payload-dpo'

export default buildConfig({
  plugins: [
    ecommercePlugin({
      payments: {
        paymentMethods: [
          paygateAdapter({
            paygateId: process.env.PAYGATE_ID!,
            paygateKey: process.env.PAYGATE_KEY!,
            baseUrl: process.env.BASE_URL,
            defaultCurrency: 'ZAR',
          }),
        ],
      },
      // ... other ecommerce config
    }),
  ],
})
```

The adapter registers endpoints under `/api/payments/paygate/` and manages transactions on the e-commerce plugin's `transactions` collection.

#### Client-side

```tsx
import { paygateAdapterClient } from '@innovateium/payload-dpo/client'
;<EcommerceProvider paymentAdapterClient={paygateAdapterClient()}>{children}</EcommerceProvider>
```

## Payment Flow

```
User → Checkout → "Pay" click
       ↓
  initiatePayment /api/dpo/initiate
       ↓
  POST to PayGate initiate.trans
       ↓
  { payRequestId, checksum, paymentUrl }
       ↓
  Browser POSTs to PayGate process.trans
       ↓
  User pays on PayGate hosted page
       ↓
  ┌──────────────────────────────────────┐
  │                                      │
  IPN (async)                       Return redirect
  POST /api/dpo/notify              GET /api/dpo/return
       ↓                                      ↓
  Update tx status                   Redirect to /payment-result
                                              ↓
                                        Query /api/dpo/status
                                              ↓
                                     Show success/failure UI
```

### Transaction Status Codes

| Code | Meaning             |
| ---- | ------------------- |
| `0`  | Not Done            |
| `1`  | Approved            |
| `2`  | Declined            |
| `3`  | Cancelled           |
| `4`  | User Cancelled      |
| `5`  | Received by PayGate |
| `7`  | Settlement Voided   |

## Configuration

### `DpoPluginConfig`

| Option                           | Type                                    | Default                        | Description                                             |
| -------------------------------- | --------------------------------------- | ------------------------------ | ------------------------------------------------------- |
| `paygateId`                      | `string`                                | `process.env.PAYGATE_ID`       | Your PayGate merchant ID                                |
| `paygateKey`                     | `string`                                | `process.env.PAYGATE_KEY`      | Your PayGate secret key                                 |
| `baseUrl`                        | `string`                                | `process.env.BASE_URL`         | Public base URL for RETURN/NOTIFY URLs                  |
| `paygateUrl`                     | `string`                                | `https://secure.paygate.co.za` | PayGate API base URL                                    |
| `disabled`                       | `boolean`                               | `false`                        | Disable endpoints (collections still register)          |
| `collections`                    | `Partial<Record<CollectionSlug, true>>` | —                              | Collections to add a DPO relationship field to          |
| `defaultCurrency`                | `'ZAR' \| 'BWP' \| 'USD'`               | `'ZAR'`                        | Default currency                                        |
| `defaultCountry`                 | `string`                                | Auto from currency             | Override ISO country code sent to PayGate               |
| `defaultLocale`                  | `string`                                | Auto from currency             | Override locale sent to PayGate                         |
| `transactionCollectionSlug`      | `string`                                | `'dpo-transactions'`           | Custom collection slug for transactions                 |
| `registerTransactionsCollection` | `boolean`                               | `true`                         | Set `false` when using e-commerce plugin's transactions |
| `routes`                         | `DpoRoutes`                             | See below                      | Custom API endpoint paths                               |
| `onSuccess`                      | `(args) => Promise<void>`               | —                              | Callback when transaction status becomes Approved       |

### `DpoRoutes`

| Path           | Default                   | Description                           |
| -------------- | ------------------------- | ------------------------------------- |
| `initiate`     | `/dpo/initiate`           | POST — initiate a payment             |
| `return`       | `/dpo/return`             | GET/POST — handle PayGate redirect    |
| `notify`       | `/dpo/notify`             | POST — IPN notification handler       |
| `status`       | `/dpo/status`             | GET — query transaction status        |
| `returnResult` | `/checkout/confirm-order` | Front-end result page path (redirect) |

### `paygateAdapter` args

| Option             | Type     | Default                                   | Description                  |
| ------------------ | -------- | ----------------------------------------- | ---------------------------- |
| `paygateId`        | `string` | `process.env.PAYGATE_ID`                  | Your PayGate merchant ID     |
| `paygateKey`       | `string` | `process.env.PAYGATE_KEY`                 | Your PayGate secret key      |
| `baseUrl`          | `string` | `process.env.BASE_URL`                    | Public base URL              |
| `returnUrl`        | `string` | `{baseUrl}/api/payments/paygate/webhooks` | Return URL for PayGate       |
| `notifyUrl`        | `string` | `{baseUrl}/api/payments/paygate/webhooks` | Notify URL for PayGate       |
| `paygateUrl`       | `string` | `https://secure.paygate.co.za`            | PayGate API base URL         |
| `defaultCurrency`  | `string` | `'ZAR'`                                   | Default currency             |
| `defaultCountry`   | `string` | Auto from currency                        | ISO country code override    |
| `defaultLocale`    | `string` | Auto from currency                        | Locale override              |
| `label`            | `string` | `'PayGate'`                               | Payment method label         |
| `transactionsSlug` | `string` | `'transactions'`                          | E-commerce transactions slug |

### Currency auto-mapping

| Currency | Country | Locale  |
| -------- | ------- | ------- |
| `ZAR`    | `ZAF`   | `en-za` |
| `BWP`    | `BWA`   | `en-bw` |
| `USD`    | `USA`   | `en-us` |

Override with `defaultCountry` / `defaultLocale`.

## Collection: `dpo-transactions`

| Field               | Type            | Description                                |
| ------------------- | --------------- | ------------------------------------------ |
| `payRequestId`      | `text` (unique) | Returned by PayGate on initiate            |
| `reference`         | `text` (index)  | Internal merchant order reference          |
| `amount`            | `number`        | Amount in cents                            |
| `currency`          | `select`        | ZAR / BWP / USD                            |
| `email`             | `email`         | Customer email                             |
| `transactionStatus` | `select`        | 0=Not Done, 1=Approved, 2=Declined, etc.   |
| `statusMessage`     | `text`          | Human-readable status                      |
| `rawResponse`       | `json`          | Full PayGate response for auditing         |
| `relatedCollection` | `text`          | Slug of related collection                 |
| `relatedDoc`        | `relationship`  | Polymorphic link to a purchasable document |

Access: any logged-in admin user. All fields are read-only in the admin UI (transactions are created/modified programmatically).

## API Endpoints (standalone mode)

### `POST /api/dpo/initiate`

Initiate a payment with PayGate.

**Body:**

```json
{
  "amount": "1000",
  "email": "customer@example.com",
  "currency": "ZAR"
}
```

- `amount` is in cents (e.g. `"1000"` = R10.00)
- Optional: `reference`, `relatedCollection`, `relatedDoc`

**Returns:**

```json
{
  "payRequestId": "string",
  "checksum": "string",
  "paymentUrl": "string",
  "reference": "string",
  "success": true
}
```

### `GET /api/dpo/status?id={payRequestId}`

Query PayGate for the latest transaction status.

**Returns:**

```json
{
  "transactionStatus": "string",
  "statusMessage": "string",
  "isSuccessful": false,
  "raw": {},
  "success": true
}
```

### `GET/POST /api/dpo/return`

Handles the user redirect from PayGate after payment. Extracts `PAY_REQUEST_ID` from query params (GET) or URL-encoded body (POST) and redirects to `returnResult` page.

### `POST /api/dpo/notify`

IPN handler — receives PayGate's async notification and updates the transaction record's status.

## Development

```bash
git clone https://github.com/innovateium/payload-dpo.git
cd payload-dpo
pnpm install
cp dev/.env.example dev/.env.local
pnpm dev
```

Opens `http://localhost:3000`. Visit `/test-payment` to test the payment flow.

### Dev example structure

```
dev/
├── (payload)/api/[...slug]/route.ts    # Payload REST catch-all (initiate, status, admin)
├── api/dpo/return/route.ts             # Standalone Next.js route — handles return redirect
├── api/dpo/notify/route.ts             # Standalone Next.js route — handles IPN (body workaround)
├── test-payment/page.tsx               # Client test form — email, currency, amount
├── payment-result/page.tsx             # Client result page — status check + display
├── payload.config.ts                   # Wired with dpoPlugin, mongoose, seed
└── .env.example                        # Test credentials template
```

**Route priority** (Next.js most-specific-first):

1. `api/dpo/return` — standalone route (GET|POST)
2. `api/dpo/notify` — standalone route (POST, reads body directly to bypass Payload body consumption)
3. `(payload)/api/[...slug]` — Payload REST API catch-all

The standalone `notify` route exists because Payload's REST handler consumes the POST body (`req.json()`) before custom endpoint handlers run, making `req.text()` empty for the IPN (which sends `application/x-www-form-urlencoded`). The Next.js route reads the body first.

### Test credentials

PayGate test credentials (`10011072130`/`secret`) only process ZAR transactions. BWP and USD require production credentials.

## Known Issues

- **IPN body consumed by Payload REST handler**: Payload's REST handler calls `req.json()` for POSTs, consuming the stream. The plugin's notify endpoint cannot read the body. Fixed via a standalone Next.js route that reads `req.text()` before Payload processes it. See the dev example for the pattern.
- **Test credentials: ZAR only**: Test credentials only support ZAR. Use production credentials for BWP/USD.
- **BASE_URL required**: The initiate endpoint requires `baseUrl` (from config, env, or serverURL). Returns a clear error if unset.

## License

MIT — see [LICENSE](LICENSE).
