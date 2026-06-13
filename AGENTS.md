# Payload DPO (PayGate PayWeb3) Plugin

## Purpose

Integrate [PayGate PayWeb3](https://www.paygate.co.za) into Payload CMS v3 as a plugin. Merchants manage orders/transactions inside Payload Admin while the plugin handles the full PayWeb3 lifecycle: initiate, redirect, notify/return, and query.

---

## Deployment Mode

This repository is an **npm package** (`@innovateium/payload-dpo`). The `dist/` is published. The `dev/` directory is a standalone Next.js app used for local development and testing. Do not confuse `dev/` with the plugin source.

---

## PayGate PayWeb3 Flow (3-step)

1. **Initiate** — Server POSTs transaction details to `https://secure.paygate.co.za/payweb3/initiate.trans`. PayGate returns `PAY_REQUEST_ID` + `CHECKSUM`.
2. **Redirect** — Front-end POSTs `PAY_REQUEST_ID` + `CHECKSUM` to `https://secure.paygate.co.za/payweb3/process.trans`. User pays on PayGate's hosted page.
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
├── admin/
│   └── Dashboard.tsx             # Optional admin dashboard (afterDashboard) — stats, recent txs
├── adapters/
│   ├── index.ts                  # Re-exports adapter
│   └── paygate/
│       ├── index.ts              # paygateAdapter / paygateAdapterClient factory functions
│       ├── initiatePayment.ts    # e-commerce adapter initiate — calculates cart total, calls initiate.trans
│       ├── confirmOrder.ts       # e-commerce adapter confirm — queries query.trans, creates Order, clears cart
│       └── webhooks.ts           # e-commerce adapter IPN/webhook handler
├── collections/
│   ├── DpoTransactions.ts        # Transaction collection — stores every payment attempt
│   └── index.ts                  # Collection registry helper
├── endpoints/
│   ├── index.ts                  # Endpoint registry helper
│   ├── initiate.ts               # POST /dpo/initiate       — validate input, create tx, call initiate.trans
│   ├── return.ts                 # GET|POST /dpo/return     — handle PayGate redirect, 302 to result page
│   ├── notify.ts                 # POST /dpo/notify         — IPN handler (updates tx status)
│   └── status.ts                 # GET /dpo/status?id=xxx   — query PayGate query.trans
├── hooks/
│   └── afterPayment.ts           # AfterChange hook — fires onSuccess when status → Approved
├── lib/
│   ├── __tests__/                # Unit tests (checksum, paygate, constants)
│   │   ├── checksum.test.ts
│   │   ├── paygate.test.ts
│   │   └── constants.test.ts
│   ├── checksum.ts               # generateSignature(params, key) — MD5 signing
│   ├── paygate.ts                # HTTP helpers: initiateTransaction(), queryTransaction(), parseResponse()
│   └── constants.ts              # SIGNATURE_FIELDS, STATUS_MAP, CURRENCY_LOCALE_MAP, DEFAULT_ROUTES, etc.
└── exports/
    ├── client.ts                 # Re-exports paygateAdapterClient for client-side usage
    └── rsc.ts                    # Exports DpoDashboard component
```

### Dev example (`dev/`)

```
dev/
├── (payload)/api/[...slug]/route.ts    # Payload REST catch-all
├── api/dpo/return/route.ts             # Next.js route for return (GET|POST) — bypasses Payload
├── api/dpo/notify/route.ts             # Next.js route for notify (POST) — reads body before Payload
├── test-payment/page.tsx               # Test payment form (client component)
├── payment-result/page.tsx             # Payment result page (client component)
├── layout.tsx                          # Root layout
├── payload.config.ts                   # Dev config with dpoPlugin, mongoose, seed
├── seed.ts                             # Seeds a dev admin user
├── helpers/testEmailAdapter.ts         # Test email adapter
├── int.spec.ts                         # Integration tests (vitest)
├── e2e.spec.ts                         # E2E tests (Playwright)
└── .env.example                        # PAYGATE_ID, PAYGATE_KEY, BASE_URL, DATABASE_URL
```

### Route priority (Next.js most-specific-first)

1. `dev/app/api/dpo/return/route.ts` — handles GET|POST `/api/dpo/return`
2. `dev/app/api/dpo/notify/route.ts` — handles POST `/api/dpo/notify`
3. `dev/app/(payload)/api/[...slug]/route.ts` — Payload REST API catch-all (initiate, status, admin)

**Gotcha**: PayGate IPN sends `application/x-www-form-urlencoded`. Payload's REST handler calls `req.json()` for POST requests, consuming the body stream. When the plugin's notify endpoint calls `req.text()`, it returns empty. A standalone Next.js route at `dev/app/api/dpo/notify/route.ts` bypasses this by reading `req.text()` directly before Payload processes it.

---

## Exports

| Import path                       | Exports                                               |
| --------------------------------- | ----------------------------------------------------- |
| `@innovateium/payload-dpo`        | `dpoPlugin`, `paygateAdapter`, `paygateAdapterClient` |
| `@innovateium/payload-dpo/client` | `paygateAdapterClient`                                |
| `@innovateium/payload-dpo/rsc`    | `DpoDashboard`                                        |

---

## Two Usage Modes

### 1. Standalone (`dpoPlugin()`)

Registers the `dpo-transactions` collection and 4 Payload config endpoints at `/api/dpo/*`.

```ts
import { dpoPlugin } from '@innovateium/payload-dpo'

buildConfig({
  plugins: [dpoPlugin({ paygateId, paygateKey, baseUrl })],
})
```

| Endpoint            | Method   | Purpose                                                                                                      |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `/api/dpo/initiate` | POST     | Validate input, create tx, call `initiate.trans`, return `{ payRequestId, checksum, paymentUrl, reference }` |
| `/api/dpo/return`   | GET/POST | Handle user redirect from PayGate, 302 to `returnResult` page                                                |
| `/api/dpo/notify`   | POST     | Receive IPN, update tx `transactionStatus`                                                                   |
| `/api/dpo/status`   | GET      | Query `query.trans`, return `{ transactionStatus, isSuccessful, raw }`                                       |

### 2. E-commerce adapter (`paygateAdapter()`)

Conforms to `@payloadcms/plugin-ecommerce`'s `PaymentAdapter` interface. Registers endpoints under `/api/payments/paygate/` and reuses the e-commerce plugin's `transactions` collection.

```ts
import { paygateAdapter } from '@innovateium/payload-dpo'

ecommercePlugin({
  payments: {
    paymentMethods: [paygateAdapter({ paygateId, paygateKey, baseUrl })],
  },
})
```

| Endpoint                                   | Purpose                                              |
| ------------------------------------------ | ---------------------------------------------------- |
| `POST /api/payments/paygate/initiate`      | Calls `initiate.trans`, creates tx, returns redirect |
| `POST /api/payments/paygate/confirm-order` | Queries `query.trans`, creates Order if Approved     |
| `POST /api/payments/paygate/webhooks`      | Receives PayGate IPN, updates transaction status     |

**Note**: Use `dpoPlugin()` standalone OR `paygateAdapter` inside the e-commerce plugin — not both.

---

## Transaction Collection

### Standalone: `dpo-transactions`

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

Access: any logged-in admin user. Transactions are created programmatically (bypasses access control). All fields read-only in admin UI.

### E-commerce adapter: uses the `transactions` collection from `@payloadcms/plugin-ecommerce`

Stores `paygate` group field with `payRequestId` and `reference` sub-fields.

---

## Hooks

- **After Change** on DpoTransactions: fires `pluginOptions.onSuccess` callback when `transactionStatus` changes to `"1"` (Approved). Useful for confirmation emails, order status updates, etc.

---

## Admin Dashboard

When `adminDashboard: true` is set in `DpoPluginConfig`, a stats dashboard is added to the Payload admin home page (via `afterDashboard`). Shows:

- **Summary cards**: Total transactions, total revenue (by currency), approved/failed/pending counts
- **Status breakdown**: Bar chart showing distribution across all 7 PayGate status codes
- **Recent transactions**: Table of the 10 most recent transactions with reference, amount, currency, status badge, email, and date

The component is a client component that fetches data from the `dpo-transactions` REST API endpoint. Also exportable as `DpoDashboard` from `@innovateium/payload-dpo/rsc` for manual placement in custom admin views.

---

## Testing

### Unit tests (vitest, no Payload needed)

Location: `src/lib/__tests__/`

Run: `pnpm test:int` (runs vitest on `dev/int.spec.ts` and `src/lib/__tests__/*.test.ts`)

| File                | Tests                                                                |
| ------------------- | -------------------------------------------------------------------- |
| `checksum.test.ts`  | Signature generation, field ordering, key variance, edge cases       |
| `paygate.test.ts`   | `parseResponse` — URL-encoded parsing, error handling, edge cases    |
| `constants.test.ts` | All constant values match expected, currency/locale maps are correct |

### Integration tests (vitest, with in-memory MongoDB)

Location: `dev/int.spec.ts`

Requires `NODE_ENV=test` (handled in vitest config). Spins up an in-memory MongoDB replSet. Tests:

- **Initiate endpoint**: Validation (missing amount, email, baseUrl, PayGate config)
- **Return endpoint**: GET 302 redirect, POST form-body parsing, missing PAY_REQUEST_ID
- **Notify endpoint**: Invalid data, empty body, transaction update, all status codes, nonexistent tx
- **Status endpoint**: Missing id, missing PayGate config
- **Transaction CRUD**: Create, find by payRequestId, update status, BWP/USD support
- **AfterPayment hook**: onSuccess firing conditions (status → 1, create vs update, same status)
- **Collection config**: Existence and field shape

### E2E tests (Playwright)

Location: `dev/e2e.spec.ts`

Run: `pnpm test:e2e` (requires dev server running). Tests:

- **Admin panel**: Login, navigation to DPO transactions, list view render
- **Test payment page**: Form renders with email/currency/amount fields, status link
- **Payment result page**: Error state, loading state

---

## Library (`src/lib/`)

- `constants.ts` — `SIGNATURE_FIELDS`, `STATUS_MAP`, `CURRENCY_LOCALE_MAP`, `DEFAULT_ROUTES`, `DEFAULT_PAYGATE_URL`, `TRANSACTION_STATUS_OPTIONS`, `CURRENCY_OPTIONS`
- `checksum.ts` — `generateSignature(params, paygateKey)` — maps `SIGNATURE_FIELDS` to param values, concatenates with `paygateKey`, returns MD5 hash
- `paygate.ts` — `initiateTransaction(url, data)` and `queryTransaction(url, data)` — native `fetch` + `URLSearchParams` POST wrapper, returns parsed `Record<string, string>`; `parseResponse(responseData)` for URL-encoded response parsing

---

## Known Issues

- **PayGate IPN body consumed by Payload REST handler**: The `@payloadcms/next` REST handler calls `req.json()` for POST, consuming the body stream. The plugin's notify endpoint cannot read the body. Fixed via a standalone Next.js route in `dev/` that reads `req.text()` first.
- **Test credentials only process ZAR**: PayGate test credentials `10011072130`/`secret` only support ZAR. BWP and USD work with production credentials.
- **BASE_URL required**: The initiate endpoint requires `baseUrl` (from config, env, or serverURL). Returns a clear error if unset.

---

## References

- PayGate PayWeb3 docs: https://www.paygate.co.za/payweb3/
- Payload plugin docs: https://payloadcms.com/docs/plugins/overview
- PayGate JS demo: https://github.com/innovateium/paygate-js-demo
