import type { Endpoint, PayloadRequest } from 'payload'

import type { DpoPluginConfig } from '../types.js'

import { generateSignature } from '../lib/checksum.js'
import { DEFAULT_PAYGATE_URL, DEFAULT_ROUTES, STATUS_MAP } from '../lib/constants.js'
import { queryTransaction } from '../lib/paygate.js'

export const createStatusEndpoint = (pluginOptions: DpoPluginConfig): Endpoint => {
  const statusPath = pluginOptions.routes?.status ?? DEFAULT_ROUTES.status
  const collectionSlug = pluginOptions.transactionCollectionSlug ?? 'dpo-transactions'

  return {
    handler: async (req: PayloadRequest) => {
      try {
        const url = new URL(req.url || '', 'http://localhost')
        const id = url.searchParams.get('id')

        if (!id) {
          return Response.json({ error: 'Missing PAY_REQUEST_ID', success: false }, { status: 400 })
        }

        const paygateId = pluginOptions.paygateId || process.env.PAYGATE_ID || ''
        const paygateKey = pluginOptions.paygateKey || process.env.PAYGATE_KEY || ''
        const paygateUrl =
          pluginOptions.paygateUrl || process.env.PAYGATE_URL || DEFAULT_PAYGATE_URL

        let reference = ''

        if (req.payload) {
          const existing = await req.payload.find({
            collection: collectionSlug,
            limit: 1,
            where: { payRequestId: { equals: id } },
          })

          if (existing.docs.length > 0) {
            reference = existing.docs[0].reference as string
          }
        }

        const queryData: Record<string, string> = {
          PAY_REQUEST_ID: id,
          PAYGATE_ID: paygateId,
          REFERENCE: reference,
        }

        const checksum = generateSignature(queryData, paygateKey)
        queryData.CHECKSUM = checksum

        const queryResult = await queryTransaction(paygateUrl, queryData)

        const transactionStatus = queryResult.TRANSACTION_STATUS || '0'
        const statusLabel = STATUS_MAP[transactionStatus] || 'Unknown'
        const isSuccessful = transactionStatus === '1'

        return Response.json({
          isSuccessful,
          payRequestId: queryResult.PAY_REQUEST_ID,
          raw: queryResult,
          reference: queryResult.REFERENCE,
          statusMessage: statusLabel,
          success: true,
          transactionStatus,
        })
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return Response.json(
          {
            error: 'Status check failed',
            message,
            success: false,
          },
          { status: 500 },
        )
      }
    },
    method: 'get',
    path: statusPath,
  }
}
