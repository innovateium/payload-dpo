export const DEFAULT_PAYGATE_URL = 'https://secure.paygate.co.za'

export const DEFAULT_ROUTES = {
  initiate: '/dpo/initiate',
  notify: '/dpo/notify',
  return: '/dpo/return',
  returnResult: '/checkout/confirm-order',
  status: '/dpo/status',
} as const

export const SIGNATURE_FIELDS = [
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

export const STATUS_MAP: Record<string, string> = {
  '0': 'Not Done',
  '1': 'Approved',
  '2': 'Declined',
  '3': 'Cancelled',
  '4': 'User Cancelled',
  '5': 'Received by PayGate',
  '7': 'Settlement Voided',
}

export const TRANSACTION_STATUS_OPTIONS = [
  { label: 'Not Done', value: '0' },
  { label: 'Approved', value: '1' },
  { label: 'Declined', value: '2' },
  { label: 'Cancelled', value: '3' },
  { label: 'User Cancelled', value: '4' },
  { label: 'Received by PayGate', value: '5' },
  { label: 'Settlement Voided', value: '7' },
]

export const CURRENCY_LOCALE_MAP: Record<string, { country: string; locale: string }> = {
  ZAR: { country: 'ZAF', locale: 'en-za' },
  BWP: { country: 'BWA', locale: 'en-bw' },
  USD: { country: 'USA', locale: 'en-us' },
}

export const CURRENCY_OPTIONS = [
  { label: 'ZAR', value: 'ZAR' },
  { label: 'BWP', value: 'BWP' },
  { label: 'USD', value: 'USD' },
]
