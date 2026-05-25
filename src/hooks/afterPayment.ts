import type { CollectionAfterChangeHook } from 'payload'

import type { DpoPluginConfig } from '../types.js'

export const afterPaymentHook = (pluginOptions: DpoPluginConfig): CollectionAfterChangeHook => {
  return async (args) => {
    const { doc, operation, previousDoc } = args

    if (operation !== 'update') {
      return
    }

    const wasApproved = previousDoc.transactionStatus !== '1' && doc.transactionStatus === '1'

    if (!wasApproved || !pluginOptions.onSuccess) {
      return
    }

    await pluginOptions.onSuccess({
      payload: args.req.payload,
      transaction: doc,
    })
  }
}
