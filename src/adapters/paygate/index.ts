import type { Endpoint, Field, GroupField } from 'payload'

import { confirmOrder } from './confirmOrder.js'
import { initiatePayment } from './initiatePayment.js'
import { webhookHandler } from './webhooks.js'

export type PaygateAdapterArgs = {
  baseUrl?: string
  defaultCountry?: string
  defaultCurrency?: 'BWP' | 'USD' | 'ZAR'
  defaultLocale?: string
  label?: string
  notifyUrl?: string
  paygateId: string
  paygateKey: string
  paygateUrl?: string
  returnUrl?: string
  transactionsSlug?: string
}

export type PaygateAdapterClient = {
  confirmOrder: boolean
  initiatePayment: boolean
  label: string
  name: string
}

export type InitiatePaymentReturnType = {
  checksum: string
  message: string
  paymentUrl: string
  payRequestId: string
  reference: string
}

export type ConfirmOrderReturnType = {
  message: string
  orderID: string
  transactionID: string
}

export const paygateAdapter = (props: PaygateAdapterArgs) => {
  const baseFields: Field[] = [
    { name: 'payRequestId', type: 'text', label: 'PayGate Request ID' },
    { name: 'reference', type: 'text', label: 'PayGate Reference' },
  ]

  const groupField: GroupField = {
    name: 'paygate',
    type: 'group',
    admin: {
      condition: (data: Record<string, unknown>) => data?.paymentMethod === 'paygate',
    },
    fields: baseFields,
  }

  const ep: Endpoint = {
    handler: (req: any) => webhookHandler(props)(req),
    method: 'post',
    path: '/webhooks',
  }

  return {
    name: 'paygate',
    confirmOrder: (args: any) => confirmOrder(props)(args),
    endpoints: [ep],
    group: groupField,
    initiatePayment: (args: any) => initiatePayment(props)(args),
    label: props.label || 'PayGate',
  }
}

export const paygateAdapterClient = (): PaygateAdapterClient => ({
  name: 'paygate',
  confirmOrder: true,
  initiatePayment: true,
  label: 'PayGate',
})
