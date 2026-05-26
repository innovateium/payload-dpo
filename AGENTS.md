# Payload DPO (PayGate PayWeb3) Plugin

## Purpose

Integrate the [PayGate PayWeb3](https://www.paygate.co.za) payment gateway into Payload CMS as a first-class plugin. Merchants manage orders/transactions inside Payload Admin while the plugin handles the full PayWeb3 lifecycle: initiate, redirect, notify/return, and query.

---

## PayGate PayWeb3 Flow (3-step)

1. **Initiate** — Server POSTs transaction details (`PAYGATE_ID`, `REFERENCE`, `AMOUNT`, `CURRENCY`, `RETURN_URL`, etc.) to `https://secure.paygate.co.za/payweb3/initiate.trans`. PayGate returns `PAY_REQUEST_ID` + `CHECKSUM`.
2. **Redirect** — Front-end POSTs `PAY_REQUEST_ID` + `CHECKSUM` to `https://secure.paygate.co.za/payweb3/process.trans`. User completes payment on PayGate's hosted page.
3. **Notify / Return** — PayGate sends an IPN (`NOTIFY_URL`) and redirects the user back (`RETURN_URL`). Server verifies via `query.trans` and updates the transaction record.

### Signature

MD5 hash of the concatenated values of these fields (in order) + the `PAYGATE_KEY`:
`PAYGATE_ID`, `PAY_REQUEST_ID`, `REFERENCE`, `AMOUNT`, `CURRENCY`, `RETURN_URL`, `TRANSACTION_DATE`, `LOCALE`, `COUNTRY`, `EMAIL`, `NOTIFY_URL`

---

## Plugin Architecture

```
src/
├── index.ts                      # Plugin entry — exports dpoPlugin + paygateAdapter + paygateAdapterClient
├── types.ts                      # DpoPluginConfig + DpoRoutes types
├── adapters/
│   ├── index.ts                  # Re-exports adapter
│   └── paygate/
│       ├── index.ts              # paygateAdapter / paygateAdapterClient factory functions
│       ├── initiatePayment.ts    # e-commerce adapter initiate implementation
│       ├── confirmOrder.ts       # e-commerce adapter confirm implementation
│       └── webhooks.ts           # e-commerce adapter webhook/IPN handler
├── collections/
│   ├── DpoTransactions.ts        # Transaction collection — stores every payment attempt
│   └── index.ts                  # Collection registry helper
├── endpoints/
│   ├── index.ts                  # Endpoint registry helper
│   ├── initiate.ts               # POST /dpo/initiate       → calls initiate.trans
│   ├── return.ts                 # GET|POST /dpo/return     → handles PayGate return redirect
│   ├── notify.ts                 # POST /dpo/notify         → IPN handler (via Payload config endpoint)
│   └── status.ts                 # GET /dpo/status?id=xxx   → queries query.trans
├── hooks/
│   └── afterPayment.ts           # AfterChange hook (fires onSuccess callback on status → Approved)
├── lib/
│   ├── checksum.ts               # generateSignature(params, key) — MD5 signing
│   ├── paygate.ts                # HTTP helpers: initiateTransaction(), queryTransaction(), parseResponse()
│   └── constants.ts              # SIGNATURE_FIELDS, STATUS_MAP, CURRENCY_LOCALE_MAP, DEFAULT_ROUTES, DEFAULT_PAYGATE_URL
└── exports/
    ├── client.ts                 # Re-exports paygateAdapterClient for client-side usage
    └── rsc.ts                    # Re-export server components (empty — no admin components now)
dev/
├── app/
│   ├── (payload)/api/[...slug]/route.ts    # Payload REST API catch-all
│   ├── api/dpo/return/route.ts             # Next.js fallback route for return (GET|POST)
│   ├── api/dpo/notify/route.ts             # Next.js fallback route for notify (POST, uses getPayload)
│   ├── test-payment/page.tsx               # Test payment form (client component)
│   ├── payment-result/page.tsx             # Payment result page (client component)
│   └── layout.tsx                          # Root layout with html/body tags
├── payload.config.ts                       # Dev config wired with dpoPlugin
└── .env.example                            # Env template with PAYGATE_ID, PAYGATE_KEY, BASE_URL
```

### 1. Plugin Options (`src/types.ts`)

```ts
export type DpoRoutes = {
  initiate?: string // default: '/dpo/initiate'
  notify?: string // default: '/dpo/notify'
  return?: string // default: '/dpo/return'
  status?: string // default: '/dpo/status'
}

export type DpoPluginConfig = {
  disabled?: boolean
  collections?: Partial<Record<CollectionSlug, true>>
  paygateId?: string
  paygateKey?: string
  paygateUrl?: string // default: https://secure.paygate.co.za
  baseUrl?: string // falls back to serverURL
  defaultCurrency?: 'ZAR' | 'BWP' | 'USD' // default: 'ZAR'
  defaultCountry?: string // auto-resolved from currency if not set
  defaultLocale?: string // auto-resolved from currency if not set
  transactionCollectionSlug?: string // default: 'dpo-transactions'
  routes?: DpoRoutes
  onSuccess?: (args: { payload: Payload; transaction: Record<string, unknown> }) => Promise<void>
}
```

### 2. Transactions Collection (`src/collections/DpoTransactions.ts`)

| Field               | Type                   | Description                                                                                                   |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `payRequestId`      | text (unique, indexed) | Returned by PayGate on initiate                                                                               |
| `reference`         | text (indexed)         | Internal merchant order ref                                                                                   |
| `amount`            | number                 | Amount in cents                                                                                               |
| `currency`          | select                 | ZAR / BWP / USD                                                                                               |
| `email`             | email                  | Customer email                                                                                                |
| `transactionStatus` | select                 | 0=Not Done, 1=Approved, 2=Declined, 3=Cancelled, 4=User Cancelled, 5=Received by PayGate, 7=Settlement Voided |
| `statusMessage`     | text                   | Human-readable status                                                                                         |
| `rawResponse`       | json                   | Full PayGate response for auditing                                                                            |
| `relatedCollection` | text                   | Slug of related collection                                                                                    |
| `relatedDoc`        | relationship           | Polymorphic link to purchasable doc                                                                           |

Access: any logged-in admin user. Transactions are created programmatically by the initiate endpoint (bypasses access control).

### 3. Endpoints

All registered as Payload REST API endpoints via `config.endpoints`. Paths are configurable via `routes` option:

| Endpoint            | Method   | Purpose                                                                                                          |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `/api/dpo/initiate` | POST     | Validate input, create tx doc, call `initiate.trans`, return `{ payRequestId, checksum, paymentUrl, reference }` |
| `/api/dpo/return`   | GET/POST | Handle user redirect from PayGate, 302 to `/payment-result?PAY_REQUEST_ID=xxx`                                   |
| `/api/dpo/notify`   | POST     | Receive IPN from PayGate, update tx `transactionStatus`                                                          |
| `/api/dpo/status`   | GET      | Query `query.trans`, return latest status JSON                                                                   |

**Gotcha**: PayGate IPN sends `application/x-www-form-urlencoded` body. Payload's REST handler consumes the body before custom endpoint handlers run, so `req.text()` in the plugin's notify endpoint returns empty. A standalone Next.js route at `dev/app/api/dpo/notify/route.ts` bypasses Payload's body consumption by reading the body directly with `req.text()` before Payload processes it.

### 4. Route priority

Next.js route priority (most specific wins):

1. `dev/app/api/dpo/return/route.ts` — handles GET|POST `/api/dpo/return`
2. `dev/app/api/dpo/notify/route.ts` — handles POST `/api/dpo/notify`
3. `dev/app/(payload)/api/[...slug]/route.ts` — Payload REST API catch-all (handles initiate, status + all other Payload API routes)

The return and notify Next.js routes are dev-only fallbacks. In production, the Payload config endpoints should handle the routes directly (provided the body consumption issue is addressed upstream).

### 5. E-commerce Plugin Payment Adapter

The plugin doubles as a `PaymentAdapter` for `@payloadcms/plugin-ecommerce`. Use it inside the e-commerce plugin's `payments.paymentMethods` array:

```ts
import { ecommercePlugin } from '@payloadcms/plugin-ecommerce'
import { paygateAdapter } from '@innovateium/payload-dpo'

export default buildConfig({
  plugins: [
    ecommercePlugin({
      access: {
        /* ... */
      },
      customers: { slug: 'users' },
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
    }),
  ],
})
```

The adapter auto-registers endpoints under `/api/payments/paygate/`:

| Endpoint                                   | Purpose                                              |
| ------------------------------------------ | ---------------------------------------------------- |
| `POST /api/payments/paygate/initiate`      | Calls `initiate.trans`, creates tx, returns redirect |
| `POST /api/payments/paygate/confirm-order` | Queries `query.trans`, creates Order if Approved     |
| `POST /api/payments/paygate/webhooks`      | Receives PayGate IPN, updates transaction status     |

Client-side adapter available at `@innovateium/payload-dpo/client`:

```ts
import { paygateAdapterClient } from '@innovateium/payload-dpo/client'
```

**Note**: Use `dpoPlugin()` standalone OR `paygateAdapter` inside the e-commerce plugin — not both. The standalone plugin provides its own transaction collection (`dpo-transactions`) and endpoints at `/api/dpo/*`, while the adapter reuses the e-commerce plugin's `transactions` collection.

### 6. Hooks

- **After Change** on DpoTransactions: fires `pluginOptions.onSuccess` callback when `transactionStatus` changes to `"1"` (Approved) — useful for sending confirmation emails, updating related order statuses, etc.

### 7. Library (`src/lib/`)

- `constants.ts` — `SIGNATURE_FIELDS`, `STATUS_MAP`, `CURRENCY_LOCALE_MAP` (currency → {country, locale}), `DEFAULT_ROUTES`, `DEFAULT_PAYGATE_URL`, `TRANSACTION_STATUS_OPTIONS`, `CURRENCY_OPTIONS`
- `checksum.ts` — `generateSignature(params, paygateKey)` — maps `SIGNATURE_FIELDS` to param values, concatenates with `paygateKey`, returns MD5 hash
- `paygate.ts` — `initiateTransaction(url, data)` and `queryTransaction(url, data)` — native `fetch` + `URLSearchParams` postForm wrapper, returns parsed `Record<string, string>`; `parseResponse(responseData)` for URL-encoded response parsing

### 8. Currency → Country/Locale auto-resolution

When a currency is selected, the plugin auto-resolves COUNTRY and LOCALE:

| Currency | Country | Locale | Notes         |
| -------- | ------- | ------ | ------------- |
| ZAR      | ZAF     | en-za  | Default       |
| BWP      | BWA     | en-bw  | Botswana Pula |
| USD      | USA     | en-us  | US Dollar     |

Override with `defaultCountry` / `defaultLocale` in plugin config.

### 9. Known issues

- **PayGate IPN body consumed by Payload REST handler**: The `@payloadcms/next` REST handler calls `req.json()` for POST requests, consuming the body stream. When the custom endpoint handler then calls `req.text()`, it returns empty. Fixed via standalone Next.js route for notify.
- **Test credentials only process ZAR**: PayGate test credentials `10011072130`/`secret` only support ZAR transactions. BWP and USD work with production credentials.
- **BASE_URL validation**: The initiate endpoint requires `baseUrl` (from config, env, or serverURL) to construct RETURN_URL and NOTIFY_URL. Returns a clear error if unset.

---

## Implementation Status

| Step                       | Status     | Notes                                                 |
| -------------------------- | ---------- | ----------------------------------------------------- |
| 1. Scaffold structure      | Done       | src/ layout, types.ts, index.ts                       |
| 2. Library layer           | Done       | checksum.ts, paygate.ts, constants.ts                 |
| 3. Transactions collection | Done       | DpoTransactions.ts with configurable slug             |
| 4. Endpoints               | Done       | initiate, return, notify, status — paths configurable |
| 5. E-commerce adapter      | Done       | paygateAdapter conforming to PaymentAdapter interface |
| 6. Hooks                   | Done       | afterPayment.ts with onSuccess callback               |
| 7. Admin UI                | Not needed | No dashboard components wanted                        |
| 8. Plugin wiring           | Done       | index.ts registers collections + endpoints            |
| 9. Dev environment         | Done       | payload.config.ts with test credentials               |
| 10. Testing                | Pending    | Unit/int/e2e tests not yet written                    |

---

## References

- PayGate PayWeb3 docs: https://www.paygate.co.za/payweb3/
- Payload plugin docs: https://payloadcms.com/docs/plugins/overview
- Live demo repo: https://github.com/innovateium/paygate-js-demo
