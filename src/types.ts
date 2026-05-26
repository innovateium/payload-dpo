import type { CollectionSlug, Payload } from 'payload'

export type DpoRoutes = {
  initiate?: string
  notify?: string
  return?: string
  returnResult?: string
  status?: string
}

export type DpoPluginConfig = {
  baseUrl?: string
  collections?: Partial<Record<CollectionSlug, true>>
  defaultCountry?: string
  defaultCurrency?: 'BWP' | 'USD' | 'ZAR'
  defaultLocale?: string
  disabled?: boolean
  onSuccess?: (args: { payload: Payload; transaction: Record<string, unknown> }) => Promise<void>
  registerTransactionsCollection?: boolean
  paygateId?: string
  paygateKey?: string
  paygateUrl?: string
  routes?: DpoRoutes
  transactionCollectionSlug?: string
}

export type PayGateStatus = '0' | '1' | '2' | '3' | '4' | '5' | '7'

export type PayGateStatusLabel =
  | 'Approved'
  | 'Cancelled'
  | 'Declined'
  | 'Not Done'
  | 'Received by PayGate'
  | 'Settlement Voided'
  | 'User Cancelled'
