# Payload DPO — PayGate PayWeb3 Plugin

[![npm](https://img.shields.io/npm/v/@innovateium/payload-dpo)](https://www.npmjs.com/package/@innovateium/payload-dpo)
[![License](https://img.shields.io/github/license/innovateium/payload-dpo)](LICENSE)

A [Payload CMS](https://payloadcms.com) v3 plugin that integrates [PayGate PayWeb3](https://www.paygate.co.za/payweb3/) (Direct Pay Online) — a payment gateway serving South African and African markets.

## Features

- **Initiate** — POST to `/api/dpo/initiate` initiates a transaction with PayGate, returns the redirect URL
- **Redirect** — Front-end submits `PAY_REQUEST_ID` + `CHECKSUM` to PayGate's hosted payment page
- **Notify** — PayGate sends an IPN to `/api/dpo/notify` — the plugin updates the transaction record
- **Return** — PayGate redirects the user back; the plugin redirects to your front-end result page
- **Status** — `GET /api/dpo/status?id=xxx` queries PayGate's `query.trans` for the latest status

## Installation

```bash
pnpm add @innovateium/payload-dpo
# or
npm install @innovateium/payload-dpo
# or
yarn add @innovateium/payload-dpo
```

## Usage

### 1. Register the plugin

In your `payload.config.ts`:

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

### 2. Set environment variables

```bash
PAYGATE_ID=10011072130       # Your PayGate merchant ID
PAYGATE_KEY=secret           # Your PayGate secret key
BASE_URL=http://localhost:3000  # Your app's public URL
PAYLOAD_SECRET=your-secret   # Payload secret
DATABASE_URL=...             # Your database URL
```

> **Note**: `BASE_URL` must be a publicly reachable URL if you want PayGate's IPN (notify) callbacks to work. Use [ngrok](https://ngrok.com) during local development.

### 3. Create the test front-end

The plugin registers a `dpo-transactions` collection visible in the admin panel under **DPO Payments**.

For testing, create a payment form that calls the initiate endpoint:

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

## Configuration

### `DpoPluginConfig`

| Option                      | Type                                    | Default                        | Description                                     |
| --------------------------- | --------------------------------------- | ------------------------------ | ----------------------------------------------- |
| `paygateId`                 | `string`                                | env `PAYGATE_ID`               | Your PayGate merchant ID                        |
| `paygateKey`                | `string`                                | env `PAYGATE_KEY`              | Your PayGate secret key                         |
| `baseUrl`                   | `string`                                | env `BASE_URL` or `serverURL`  | Public base URL for RETURN/NOTIFY URLs          |
| `paygateUrl`                | `string`                                | `https://secure.paygate.co.za` | PayGate API base URL                            |
| `disabled`                  | `boolean`                               | `false`                        | Disable the plugin (collections still register) |
| `collections`               | `Partial<Record<CollectionSlug, true>>` | —                              | Collections to add a DPO relationship field to  |
| `defaultCurrency`           | `'ZAR' \| 'BWP' \| 'USD'`               | `'ZAR'`                        | Default currency                                |
| `defaultCountry`            | `string`                                | Auto from currency             | Override the ISO country code sent to PayGate   |
| `defaultLocale`             | `string`                                | Auto from currency             | Override the locale sent to PayGate             |
| `transactionCollectionSlug` | `string`                                | `'dpo-transactions'`           | Custom collection slug for transactions         |
| `routes`                    | `DpoRoutes`                             | See below                      | Custom API endpoint paths                       |
| `onSuccess`                 | `(args) => Promise<void>`               | —                              | Callback when a transaction is approved         |

### `DpoRoutes`

| Path       | Default         | Description               |
| ---------- | --------------- | ------------------------- |
| `initiate` | `/dpo/initiate` | Initiate endpoint         |
| `return`   | `/dpo/return`   | Return redirect endpoint  |
| `notify`   | `/dpo/notify`   | IPN notification endpoint |
| `status`   | `/dpo/status`   | Status query endpoint     |

### Currency auto-mapping

Country and locale are auto-resolved from the selected currency:

| Currency | Country | Locale  |
| -------- | ------- | ------- |
| `ZAR`    | `ZAF`   | `en-za` |
| `BWP`    | `BWA`   | `en-bw` |
| `USD`    | `USA`   | `en-us` |

Override with `defaultCountry` / `defaultLocale`.

## Collection: `dpo-transactions`

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

## Payment Flow

```
User → Payment Form → POST /api/dpo/initiate
                          ↓
                    PayGate initiate.trans
                          ↓
                    { payRequestId, checksum, paymentUrl }
                          ↓
                    Browser auto-submits to PayGate process.trans
                          ↓
                    User completes payment on PayGate's hosted page
                          ↓
         ┌────────────────┴────────────────┐
         ↓                                  ↓
   POST /api/dpo/notify (IPN)         Browser redirect to RETURN_URL
   (updates transaction status)            ↓
                                    /payment-result page
                                          ↓
                                    GET /api/dpo/status
                                    (queries PayGate query.trans)
```

## Development

```bash
pnpm dev
```

Opens `http://localhost:3000`. Visit `/test-payment` to test the payment flow.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

MIT — see [LICENSE](LICENSE).
