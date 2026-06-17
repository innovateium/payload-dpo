import { clearCart } from '@payloadcms/plugin-ecommerce'

import type { ConfirmOrderReturnType, PaygateAdapterArgs } from './index.js'

import { generateSignature } from '../../lib/checksum.js'
import { DEFAULT_PAYGATE_URL } from '../../lib/constants.js'
import { queryTransaction } from '../../lib/paygate.js'

export const confirmOrder =
  (props: PaygateAdapterArgs) =>
  async (args: {
    cartsSlug?: string
    data: Record<string, unknown>
    ordersSlug?: string
    req: any
    transactionsSlug?: string
  }): Promise<ConfirmOrderReturnType> => {
    const { data, ordersSlug = 'orders', req, transactionsSlug = 'transactions' } = args
    const payload = req.payload

    const paygateId = props.paygateId
    const paygateKey = props.paygateKey
    const paygateUrl = props.paygateUrl || DEFAULT_PAYGATE_URL
    const payRequestId = data.payRequestId as string | undefined

    if (!paygateId || !paygateKey) {
      throw new Error('PayGate is not configured — missing paygateId or paygateKey')
    }

    if (!payRequestId) {
      throw new Error('Missing payRequestId')
    }

    const existing = await payload.find({
      collection: transactionsSlug,
      limit: 1,
      where: { 'paygate.payRequestId': { equals: payRequestId } },
    })

    if (existing.docs.length === 0) {
      throw new Error(`Transaction not found for PAY_REQUEST_ID: ${payRequestId}`)
    }

    const transaction = existing.docs[0]
    const paygateGroup = transaction.paygate as Record<string, unknown> | undefined
    const reference = (transaction.reference as string) || (paygateGroup?.reference as string) || ''

    const queryData: Record<string, string> = {
      PAY_REQUEST_ID: payRequestId,
      PAYGATE_ID: paygateId,
      REFERENCE: reference,
    }

    const checksum = generateSignature(queryData, paygateKey)
    queryData.CHECKSUM = checksum

    const queryResult = await queryTransaction(paygateUrl, queryData)
    const transactionStatus = queryResult.TRANSACTION_STATUS || '0'

    await payload.update({
      id: transaction.id,
      collection: transactionsSlug,
      data: {
        rawResponse: queryResult,
        status: transactionStatus === '1' ? 'succeeded' : 'failed',
        transactionStatus,
      },
    })

    if (transactionStatus !== '1') {
      return {
        message: 'Payment not completed',
        orderID: '',
        transactionID: transaction.id,
      }
    }

    const order = await payload.create({
      collection: ordersSlug,
      data: {
        amount: transaction.amount as number,
        currency: transaction.currency as string,
        ...(data.customerEmail ? { customerEmail: data.customerEmail } : {}),
        customer: req.user?.id,
        status: 'processing',
        transactions: [transaction.id],
        ...((transaction as Record<string, unknown>).billingAddress
          ? { billingAddress: (transaction as Record<string, unknown>).billingAddress }
          : {}),
        ...((transaction as Record<string, unknown>).shippingAddress
          ? { shippingAddress: (transaction as Record<string, unknown>).shippingAddress }
          : {}),
        ...((transaction as Record<string, unknown>).items
          ? { items: (transaction as Record<string, unknown>).items }
          : {}),
      },
      req,
    })

    const rawCart = (transaction as Record<string, unknown>).cart
    const cartId =
      rawCart && typeof rawCart === 'object'
        ? ((rawCart as Record<string, unknown>).id as string)
        : (rawCart as string | undefined)
    if (cartId && args.cartsSlug) {
      try {
        await clearCart({
          cartID: cartId,
          cartsSlug: args.cartsSlug,
          payload,
          req,
          secret: data.secret as string | undefined,
        })
        await payload.update({
          id: cartId,
          collection: args.cartsSlug,
          data: { purchasedAt: new Date().toISOString() },
          req,
          overrideAccess: true,
        })
      } catch {
        await payload.update({
          id: cartId,
          collection: args.cartsSlug,
          data: {
            items: [],
            purchasedAt: new Date().toISOString(),
          },
          req,
          overrideAccess: true,
        })
      }
    }

    return {
      message: 'Order confirmed',
      orderID: order.id,
      transactionID: transaction.id,
    }
  }
