# Payload DPO — PayGate PayWeb3 Plugin

[![npm](https://img.shields.io/npm/v/@innovateium/payload-dpo)](https://www.npmjs.com/package/@innovateium/payload-dpo)
[![License](https://img.shields.io/github/license/innovateium/payload-dpo)](LICENSE)
[![Beta](https://img.shields.io/badge/status-beta-yellow)]()

> **⚠️ WARNING: This plugin is under active development.**
> The API is unstable and may change without notice between minor versions.
> Features may be incomplete, missing error handling, or contain breaking changes at any time.
> **Not recommended for production use yet.**

---

A [Payload CMS](https://payloadcms.com) v3 plugin that integrates [PayGate PayWeb3](https://www.paygate.co.za/payweb3/) (Direct Pay Online) — a payment gateway serving South African and African markets.

## Features

- **Standalone endpoints** — Initiate, redirect, notify, return, and status query routes
- **Ecommerce adapter** — Integrates with `@payloadcms/plugin-ecommerce` via `paygateAdapter`
- **PayGate status tracking** — Queries `query.trans` on confirmation, stores raw responses
- **Cart cleanup** — Clears cart and stamps `purchasedAt` on successful payment
- **Configurable** — Custom routes, currencies, transaction collection slug
- **Webhook (IPN) support** — PayGate sends async notifications to update transaction status

## Installation

```bash
pnpm add @innovateium/payload-dpo
# or
npm install @innovateium/payload-dpo
# or
yarn add @innovateium/payload-dpo
```

## Setup

### Environment variables

```bash
PAYGATE_ID=10011072130       # Your PayGate merchant ID
PAYGATE_KEY=secret           # Your PayGate secret key
BASE_URL=http://localhost:3000  # Your app's public URL
PAYLOAD_SECRET=your-secret   # Payload secret
DATABASE_URL=...             # Your database URL
```

> **Note**: `BASE_URL` must be a publicly reachable URL if you want PayGate's IPN (notify) callbacks to work. Use [ngrok](https://ngrok.com) during local development.

---

## Usage

### Option A: Standalone (without ecommerce plugin)

Register the plugin in your `payload.config.ts`:

```ts
import { dpoPlugin } from '@innovateium/payload-dpo'

export default buildConfig({
  plugins: [
    dpoPlugin({
      paygateId: process.env.PAYGATE_ID,
      paygateKey: process.env.PAYGATE_KEY,
      baseUrl: process.env.BASE_URL,
    }),
  ],
})
```

Creates a `dpo-transactions` collection visible in the admin panel under **DPO Payments**.

#### Test payment form

```tsx
const res = await fetch('/api/dpo/initiate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ amount: '1000', email: 'user@example.com', currency: 'ZAR' }),
})

const data = await res.json()

const form = document.createElement('form')
form.method = 'POST'
form.action = data.paymentUrl
form.innerHTML = `
  <input type="hidden" name="PAY_REQUEST_ID" value="${data.payRequestId}" />
  <input type="hidden" name="CHECKSUM" value="${data.checksum}" />
`
document.body.appendChild(form)
form.submit()
```

PayGate redirects back to `returnResult` (default: `/checkout/confirm-order?PAY_REQUEST_ID=xxx`).

### Option B: With `@payloadcms/plugin-ecommerce` (recommended)

Use the `paygateAdapter` to add PayGate as a payment method to the ecommerce plugin:

```ts
import { ecommercePlugin } from '@payloadcms/plugin-ecommerce'
import { dpoPlugin, paygateAdapter } from '@innovateium/payload-dpo'

export default buildConfig({
  plugins: [
    dpoPlugin({
      paygateId: process.env.PAYGATE_ID,
      paygateKey: process.env.PAYGATE_KEY,
      baseUrl: process.env.BASE_URL,
      collections: { products: true },
      registerTransactionsCollection: false, // uses ecommerce plugin's transactions collection
    }),
    ecommercePlugin({
      payments: {
        paymentMethods: [
          paygateAdapter({
            paygateId: process.env.PAYGATE_ID || '',
            paygateKey: process.env.PAYGATE_KEY || '',
            baseUrl,
            returnUrl: `${baseUrl}/api/dpo/return`,
          }),
        ],
      },
      // ... other ecommerce config
    }),
  ],
})
```

The `paygateAdapter` registers:

- **Initiate** — Called by the ecommerce plugin when the customer proceeds to payment
- **Confirm** — Creates an order and clears the cart on return from PayGate
- **Webhook endpoint** — `POST /api/payments/paygate/webhooks` for IPN

#### Client-side providers

In your client providers:

```tsx
import { paygateAdapterClient } from '@innovateium/payload-dpo'

;<EcommerceProvider
  paymentAdapterClient={paygateAdapterClient()}
  // ...
>
  {children}
</EcommerceProvider>
```

The `paygateAdapterClient` tells the ecommerce `usePayments()` hook that this adapter supports both `initiatePayment` and `confirmOrder`.

---

## Payment Flow (Ecommerce adapter)

```
User → Checkout → "Go to payment" click
                      ↓
                initiatePayment (paygateAdapter)
                      ↓
                PayGate initiate.trans
                      ↓
                { payRequestId, checksum, paymentUrl }
                      ↓
                Browser POSTs to PayGate process.trans
                      ↓
                User completes payment on PayGate hosted page
                      ↓
         ┌────────────────┴────────────────┐
         ↓                                  ↓
   POST /api/payments/paygate/webhooks     Browser redirect to RETURN_URL
   (IPN - async status update)               ↓
                                      /checkout/confirm-order?PAY_REQUEST_ID=xxx
                                                ↓
                                          confirmOrder (paygateAdapter)
                                                ↓
                                          Query PayGate query.trans
                                                ↓
                                    ┌───────────┴───────────┐
                                    ↓                       ↓
                              transactionStatus === '1'    else
                                    ↓                       ↓
                              Create order                 Redirect to
                              Clear cart                   /order-failed
                              Stamp purchasedAt
                              Redirect to success page
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

Any status other than `1` returns `orderID: ''` from `confirmOrder`, signaling a failed payment.

---

## Configuration

### `DpoPluginConfig`

| Option                           | Type                                    | Default                        | Description                                            |
| -------------------------------- | --------------------------------------- | ------------------------------ | ------------------------------------------------------ |
| `paygateId`                      | `string`                                | env `PAYGATE_ID`               | Your PayGate merchant ID                               |
| `paygateKey`                     | `string`                                | env `PAYGATE_KEY`              | Your PayGate secret key                                |
| `baseUrl`                        | `string`                                | env `BASE_URL` or `serverURL`  | Public base URL for RETURN/NOTIFY URLs                 |
| `paygateUrl`                     | `string`                                | `https://secure.paygate.co.za` | PayGate API base URL                                   |
| `disabled`                       | `boolean`                               | `false`                        | Disable the plugin (collections still register)        |
| `collections`                    | `Partial<Record<CollectionSlug, true>>` | —                              | Collections to add a DPO relationship field to         |
| `defaultCurrency`                | `'ZAR' \| 'BWP' \| 'USD'`               | `'ZAR'`                        | Default currency                                       |
| `defaultCountry`                 | `string`                                | Auto from currency             | Override the ISO country code sent to PayGate          |
| `defaultLocale`                  | `string`                                | Auto from currency             | Override the locale sent to PayGate                    |
| `transactionCollectionSlug`      | `string`                                | `'dpo-transactions'`           | Custom collection slug for transactions                |
| `registerTransactionsCollection` | `boolean`                               | `true`                         | Set `false` when using ecommerce plugin's transactions |
| `routes`                         | `DpoRoutes`                             | See below                      | Custom API endpoint paths                              |
| `onSuccess`                      | `(args) => Promise<void>`               | —                              | Callback when a transaction is approved                |

### `DpoRoutes`

| Path           | Default                   | Description                |
| -------------- | ------------------------- | -------------------------- |
| `initiate`     | `/dpo/initiate`           | Initiate endpoint          |
| `return`       | `/dpo/return`             | Return redirect endpoint   |
| `returnResult` | `/checkout/confirm-order` | Front-end result page path |
| `notify`       | `/dpo/notify`             | IPN notification endpoint  |
| `status`       | `/dpo/status`             | Status query endpoint      |

### `paygateAdapter` args

| Option             | Type     | Default                                   | Description                                  |
| ------------------ | -------- | ----------------------------------------- | -------------------------------------------- |
| `paygateId`        | `string` | env `PAYGATE_ID`                          | Your PayGate merchant ID                     |
| `paygateKey`       | `string` | env `PAYGATE_KEY`                         | Your PayGate secret key                      |
| `baseUrl`          | `string` | env `BASE_URL` or `serverURL`             | Public base URL                              |
| `returnUrl`        | `string` | `{baseUrl}/api/payments/paygate/webhooks` | Return URL for PayGate                       |
| `notifyUrl`        | `string` | `{baseUrl}/api/payments/paygate/webhooks` | Notify URL for PayGate                       |
| `paygateUrl`       | `string` | `https://secure.paygate.co.za`            | PayGate API base URL                         |
| `defaultCurrency`  | `string` | `'ZAR'`                                   | Default currency (`'BWP' \| 'USD' \| 'ZAR'`) |
| `defaultCountry`   | `string` | Auto from currency                        | ISO country code override                    |
| `defaultLocale`    | `string` | Auto from currency                        | Locale override                              |
| `label`            | `string` | `'PayGate'`                               | Payment method label                         |
| `transactionsSlug` | `string` | `'transactions'`                          | Ecommerce transactions slug                  |

### Currency auto-mapping

Country and locale are auto-resolved from the selected currency:

| Currency | Country | Locale  |
| -------- | ------- | ------- |
| `ZAR`    | `ZAF`   | `en-za` |
| `BWP`    | `BWA`   | `en-bw` |
| `USD`    | `USA`   | `en-us` |

Override with `defaultCountry` / `defaultLocale`.

---

## Collection: `dpo-transactions`

Only registered when `registerTransactionsCollection` is not `false`.

| Field               | Type                     | Description                                |
| ------------------- | ------------------------ | ------------------------------------------ |
| `payRequestId`      | `text` (unique, indexed) | Returned by PayGate on initiate            |
| `reference`         | `text` (indexed)         | Internal merchant order reference          |
| `amount`            | `number`                 | Amount in cents                            |
| `currency`          | `select`                 | ZAR / BWP / USD                            |
| `email`             | `email`                  | Customer email                             |
| `transactionStatus` | `select`                 | 0=Not Done, 1=Approved, 2=Declined, etc.   |
| `statusMessage`     | `text`                   | Human-readable status                      |
| `rawResponse`       | `json`                   | Full PayGate response for auditing         |
| `relatedCollection` | `text`                   | Slug of related collection                 |
| `relatedDoc`        | `relationship`           | Polymorphic link to a purchasable document |

---

## API Endpoints (standalone mode)

### `POST /api/dpo/initiate`

**Body**: `{ amount: string, currency: string, email: string, reference?: string, relatedCollection?: string, relatedDoc?: string }`

Returns `{ payRequestId, checksum, paymentUrl, reference, success }`.

### `GET /api/dpo/status?id={payRequestId}`

Returns `{ transactionStatus, statusMessage, isSuccessful, raw, success }`. Queries PayGate `query.trans`.

### `GET /api/dpo/return?PAY_REQUEST_ID=xxx`

Redirects to the configured `returnResult` page (default: `/checkout/confirm-order?PAY_REQUEST_ID=xxx`).

### `POST /api/dpo/notify`

Accepts PayGate IPN notifications. Updates transaction record with status.

---

## Transaction Collection Access Control

When using the ecommerce plugin, the `transactions` collection is admin read-only: admins can view transactions but **cannot create, update, or delete** them via the admin UI. Only the payment flow (initiate/confirm/webhook) creates and modifies transaction records.

Enable this by adding a `transactionsCollectionOverride` to the ecommerce plugin:

```ts
ecommercePlugin({
  transactions: {
    transactionsCollectionOverride: ({ defaultCollection }) => ({
      ...defaultCollection,
      access: {
        create: () => false,
        delete: () => false,
        read: defaultCollection.access?.read ?? (() => false),
        update: () => false,
      },
    }),
  },
})
```

---

## Development

```bash
pnpm dev
```

Opens `http://localhost:3000`. Visit `/test-payment` to test the payment flow.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

MIT — see [LICENSE](LICENSE).
