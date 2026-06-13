import type { PayloadRequest } from 'payload'

import type { PaygateAdapterArgs } from './index.js'

export const webhookHandler =
  (props: PaygateAdapterArgs) =>
  async (req: PayloadRequest): Promise<Response> => {
    try {
      let rawText = ''
      try {
        rawText = (await req.text?.()) ?? ''
      } catch {
        // body not available
      }

      const body: Record<string, string> = {}
      for (const pair of rawText.split('&')) {
        const eqIdx = pair.indexOf('=')
        if (eqIdx === -1) {
          continue
        }
        body[decodeURIComponent(pair.slice(0, eqIdx))] = decodeURIComponent(pair.slice(eqIdx + 1))
      }

      const payRequestId = body.PAY_REQUEST_ID || body.payRequestId
      const transactionStatus = body.TRANSACTION_STATUS || body.transactionStatus

      if (!payRequestId || !transactionStatus) {
        return Response.json({ error: 'Invalid notification data' }, { status: 400 })
      }

      if (req.payload) {
        const slug = props.transactionsSlug || 'transactions'

        const existing = await req.payload.find({
          collection: slug,
          limit: 1,
          where: { 'paygate.payRequestId': { equals: payRequestId } },
        })

        if (existing.docs.length > 0) {
          await req.payload.update({
            id: existing.docs[0].id,
            collection: slug,
            data: {
              rawResponse: body,
              status: transactionStatus === '1' ? 'succeeded' : 'pending',
              transactionStatus,
            },
          })
        }
      }

      return new Response('OK', { status: 200 })
    } catch {
      return new Response('Error processing notification', { status: 400 })
    }
  }
