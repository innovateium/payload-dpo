# Contributing

Thanks for your interest in Payload DPO! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/innovateium/payload-dpo.git
cd payload-dpo
pnpm install
cp dev/.env.example dev/.env.local
pnpm dev
```

Make sure to set your PayGate test credentials in `dev/.env.local`:

```env
PAYGATE_ID=10011072130
PAYGATE_KEY=secret
BASE_URL=http://localhost:3000
```

## Project Structure

```
src/
├── index.ts                   # Plugin entry — transforms payload config
├── types.ts                   # DpoPluginConfig type
├── collections/
│   └── DpoTransactions.ts     # Transaction storage collection
├── endpoints/
│   ├── index.ts               # Endpoint registry helper
│   ├── initiate.ts            # POST /dpo/initiate
│   ├── return.ts              # GET|POST /dpo/return
│   ├── notify.ts              # POST /dpo/notify (IPN)
│   └── status.ts              # GET /dpo/status
├── hooks/
│   └── afterPayment.ts        # On-success callback hook
└── lib/
    ├── constants.ts           # Status codes, field order, currency map
    ├── checksum.ts            # MD5 signature generation
    └── paygate.ts             # HTTP helpers for PayGate API
dev/
├── payload.config.ts          # Dev app config
├── app/
│   ├── (payload)/             # Payload admin + API routes
│   ├── api/dpo/               # Next.js fallback routes
│   ├── test-payment/          # Test payment form
│   └── payment-result/        # Payment result display
└── seed.ts                    # Dev user seeder
```

## Testing

The plugin uses PayGate's test credentials (`10011072130` / `secret`). These only process ZAR transactions in the test environment.

```bash
# Start dev server
pnpm dev

# Run unit tests
pnpm test:int

# Run e2e tests
pnpm test:e2e
```

## Code Style

- TypeScript strict mode
- No semicolons
- Single quotes
- No comments unless necessary
- Follow existing patterns in `src/`

## Pull Requests

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes (`git commit -m 'feat: add my feature'`)
4. Push to the branch (`git push origin feat/my-feature`)
5. Open a Pull Request

## Release Process

```bash
pnpm build
npm version [major|minor|patch]
git push --tags
npm publish
```
