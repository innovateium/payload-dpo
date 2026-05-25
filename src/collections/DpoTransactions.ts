import type { CollectionConfig } from 'payload'

import type { DpoPluginConfig } from '../types.js'

import { afterPaymentHook } from '../hooks/afterPayment.js'
import { CURRENCY_OPTIONS, TRANSACTION_STATUS_OPTIONS } from '../lib/constants.js'

export const createDpoTransactionsCollection = (
  pluginOptions: DpoPluginConfig,
): CollectionConfig => ({
  slug: pluginOptions.transactionCollectionSlug ?? 'dpo-transactions',
  access: {
    create: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
    read: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
  },
  admin: {
    defaultColumns: ['reference', 'amount', 'currency', 'transactionStatus', 'email', 'updatedAt'],
    group: 'DPO Payments',
    listSearchableFields: ['reference', 'payRequestId', 'email'],
    useAsTitle: 'reference',
  },
  fields: [
    {
      name: 'payRequestId',
      type: 'text',
      admin: {
        readOnly: true,
      },
      required: false,
      unique: true,
    },
    {
      name: 'reference',
      type: 'text',
      admin: {
        readOnly: true,
      },
      index: true,
      required: true,
      unique: true,
    },
    {
      name: 'amount',
      type: 'number',
      admin: {
        readOnly: true,
      },
      required: true,
    },
    {
      name: 'currency',
      type: 'select',
      admin: {
        readOnly: true,
      },
      options: CURRENCY_OPTIONS,
      required: true,
    },
    {
      name: 'email',
      type: 'email',
      admin: {
        readOnly: true,
      },
      required: true,
    },
    {
      name: 'transactionStatus',
      type: 'select',
      admin: {
        readOnly: true,
      },
      defaultValue: '0',
      options: TRANSACTION_STATUS_OPTIONS,
      required: true,
    },
    {
      name: 'statusMessage',
      type: 'text',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'rawResponse',
      type: 'json',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'relatedCollection',
      type: 'text',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'relatedDoc',
      type: 'relationship',
      admin: {
        readOnly: true,
      },
      hasMany: false,
      relationTo: pluginOptions.collections ? Object.keys(pluginOptions.collections) : [],
    },
  ],
  hooks: {
    afterChange: [afterPaymentHook(pluginOptions)],
  },
})
