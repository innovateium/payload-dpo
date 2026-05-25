import type { Endpoint, PayloadRequest } from 'payload'

import type { DpoPluginConfig } from '../types.js'

import { DEFAULT_ROUTES, STATUS_MAP } from '../lib/constants.js'

export const createNotifyEndpoint = (pluginOptions: DpoPluginConfig): Endpoint => {
  const notifyPath = pluginOptions.routes?.notify ?? DEFAULT_ROUTES.notify
  const collectionSlug = pluginOptions.transactionCollectionSlug ?? 'dpo-transactions'

  return {
    handler: async (req: PayloadRequest) => {
      try {
        const rawText = (await req.text?.()) ?? ''

        const body: Record<string, string> = {}
        for (const pair of rawText.split('&')) {
          const eqIdx = pair.indexOf('=')
          if (eqIdx === -1) continue
          body[decodeURIComponent(pair.slice(0, eqIdx))] = decodeURIComponent(pair.slice(eqIdx + 1))
        }

        const payRequestId = body.PAY_REQUEST_ID || body.payRequestId
        const transactionStatus = body.TRANSACTION_STATUS || body.transactionStatus

        if (!payRequestId || !transactionStatus) {
          return Response.json(
            {
              error: 'Invalid notification data',
              receivedText: rawText.slice(0, 500),
              receivedKeys: Object.keys(body),
            },
            { status: 400 },
          )
        }

        if (req.payload) {
          const existing = await req.payload.find({
            collection: collectionSlug,
            limit: 1,
            where: { payRequestId: { equals: payRequestId } },
          })

          if (existing.docs.length > 0) {
            await req.payload.update({
              id: existing.docs[0].id,
              collection: collectionSlug,
              data: {
                rawResponse: body,
                statusMessage: STATUS_MAP[transactionStatus] || 'Unknown',
                transactionStatus,
              },
            })
          }
        }

        return new Response('OK', { status: 200 })
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return new Response(`Error processing notification: ${message}`, {
          status: 400,
        })
      }
    },
    method: 'post',
    path: notifyPath,
  }
}
