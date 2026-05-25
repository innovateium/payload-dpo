import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

const STATUS_MAP: Record<string, string> = {
  '0': 'Not Done',
  '1': 'Approved',
  '2': 'Declined',
  '3': 'Cancelled',
  '4': 'User Cancelled',
  '5': 'Received by PayGate',
  '7': 'Settlement Voided',
}

function parseForm(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const pair of text.split('&')) {
    const eqIdx = pair.indexOf('=')
    if (eqIdx === -1) continue
    result[decodeURIComponent(pair.slice(0, eqIdx))] = decodeURIComponent(pair.slice(eqIdx + 1))
  }
  return result
}

export const POST = async (req: NextRequest) => {
  const rawText = await req.text()
  const body = parseForm(rawText)

  const payRequestId = body.PAY_REQUEST_ID || body.payRequestId
  const transactionStatus = body.TRANSACTION_STATUS || body.transactionStatus

  if (!payRequestId || !transactionStatus) {
    return NextResponse.json(
      {
        error: 'Invalid notification data',
        receivedText: rawText.slice(0, 500),
      },
      { status: 400 },
    )
  }

  const payload = await getPayload({ config: configPromise })

  const existing = await payload.find({
    collection: 'dpo-transactions',
    limit: 1,
    where: { payRequestId: { equals: payRequestId } },
  })

  if (existing.docs.length > 0) {
    await payload.update({
      id: existing.docs[0].id,
      collection: 'dpo-transactions',
      data: {
        rawResponse: body,
        statusMessage: STATUS_MAP[transactionStatus] || 'Unknown',
        transactionStatus,
      },
    })
  }

  return new Response('OK', { status: 200 })
}
