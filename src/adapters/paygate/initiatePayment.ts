import crypto from 'crypto'

import type { InitiatePaymentReturnType, PaygateAdapterArgs } from './index.js'

import { generateSignature } from '../../lib/checksum.js'
import { CURRENCY_LOCALE_MAP, DEFAULT_PAYGATE_URL } from '../../lib/constants.js'
import { initiateTransaction } from '../../lib/paygate.js'

function resolveCountry(currency: string, configDefault: string | undefined): string {
  if (configDefault) {
    return configDefault
  }
  return CURRENCY_LOCALE_MAP[currency]?.country ?? 'ZAF'
}

function resolveLocale(currency: string, configDefault: string | undefined): string {
  if (configDefault) {
    return configDefault
  }
  return CURRENCY_LOCALE_MAP[currency]?.locale ?? 'en-za'
}

export const initiatePayment =
  (props: PaygateAdapterArgs) =>
  async (args: {
    data: {
      billingAddress?: Record<string, unknown>
      cart: Record<string, unknown>
      currency: string
      customerEmail: string
      shippingAddress?: Record<string, unknown>
    }
    req: any
    transactionsSlug: string
  }): Promise<InitiatePaymentReturnType> => {
    const { data, req, transactionsSlug } = args
    const {
      billingAddress: dataBillingAddress,
      cart,
      currency,
      customerEmail,
      shippingAddress: dataShippingAddress,
    } = data
    const payload = req.payload

    const paygateId = props.paygateId
    const paygateKey = props.paygateKey
    const paygateUrl = props.paygateUrl || DEFAULT_PAYGATE_URL
    const baseUrl =
      props.baseUrl ||
      (typeof process !== 'undefined' ? process.env?.BASE_URL : undefined) ||
      req.payload?.config?.serverURL ||
      ''
    const txCurrency = currency || props.defaultCurrency || 'ZAR'
    const notifyUrl = props.notifyUrl || `${baseUrl}/api/payments/paygate/webhooks`
    const returnUrl = props.returnUrl || `${baseUrl}/api/payments/paygate/webhooks`

    if (!paygateId || !paygateKey) {
      throw new Error('PayGate is not configured — missing paygateId or paygateKey')
    }

    if (!baseUrl) {
      throw new Error(
        'BASE_URL is not configured. Set baseUrl in the adapter config, BASE_URL in your .env, or configure the Payload serverURL.',
      )
    }

    const cartItems = (cart?.items as Array<Record<string, unknown>>) || []
    const amount = cartItems.reduce((acc: number, item: Record<string, unknown>) => {
      const product = item.product as Record<string, unknown> | undefined
      const variant = item.variant as Record<string, unknown> | undefined
      const pricePayload = product?.pricePayload as Record<string, unknown> | undefined
      const price = pricePayload?.[txCurrency] as Record<string, unknown> | undefined
      let unitAmount = (price?.amount as number) || (product?.price as number) || 0
      if (!unitAmount) {
        const priceField = (product as Record<string, unknown>)?.[`priceIn${txCurrency}`]
        unitAmount =
          typeof priceField === 'object'
            ? ((priceField as Record<string, unknown>)?.amount as number) || 0
            : (priceField as number) || 0
      }
      if (variant) {
        const variantPriceField = variant?.[`priceIn${txCurrency}`]
        const variantPrice =
          typeof variantPriceField === 'object'
            ? ((variantPriceField as Record<string, unknown>)?.amount as number) || 0
            : (variantPriceField as number) || 0
        unitAmount = variantPrice || (variant?.price as number) || unitAmount
      }
      const qty = (item.quantity as number) || 1
      return acc + unitAmount * qty
    }, 0)

    if (amount <= 0) {
      throw new Error('Cart total must be greater than zero')
    }

    const reference = `ECOMM_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    const transactionData: Record<string, string> = {
      AMOUNT: String(Math.round(amount)),
      COUNTRY: resolveCountry(txCurrency, props.defaultCountry),
      CURRENCY: txCurrency,
      EMAIL: customerEmail,
      LOCALE: resolveLocale(txCurrency, props.defaultLocale),
      NOTIFY_URL: notifyUrl,
      PAYGATE_ID: paygateId,
      REFERENCE: reference,
      RETURN_URL: returnUrl,
      TRANSACTION_DATE: new Date().toISOString().slice(0, 19).replace('T', ' '),
    }

    const checksum = generateSignature(transactionData, paygateKey)
    transactionData.CHECKSUM = checksum

    const responseParams = await initiateTransaction(paygateUrl, transactionData)

    if (responseParams.ERROR) {
      throw new Error(`PayGate Error: ${responseParams.ERROR}`)
    }

    if (!responseParams.PAY_REQUEST_ID) {
      throw new Error('Invalid PayGate response — missing PAY_REQUEST_ID')
    }

    const billingAddress =
      dataBillingAddress || (cart.billingAddress as Record<string, unknown>) || undefined
    const shippingAddress =
      dataShippingAddress || (cart.shippingAddress as Record<string, unknown>) || undefined

    await payload.create({
      collection: transactionsSlug,
      data: {
        amount: Math.round(amount),
        ...(billingAddress ? { billingAddress } : {}),
        ...(shippingAddress ? { shippingAddress } : {}),
        cart: cart.id,
        currency: txCurrency,
        customer: req.user?.id,
        customerEmail,
        items: (cart.items as Array<Record<string, unknown>>).map((item) => ({
          product:
            typeof item.product === 'object'
              ? (item.product as Record<string, unknown>).id
              : item.product,
          quantity: item.quantity,
          variant: item.variant
            ? typeof item.variant === 'object'
              ? (item.variant as Record<string, unknown>).id
              : item.variant
            : null,
        })),
        paygate: {
          payRequestId: responseParams.PAY_REQUEST_ID,
          reference,
        },
        paymentMethod: 'paygate',
        rawResponse: responseParams,
        reference,
        status: 'pending',
      },
    })

    const redirectChecksum = crypto
      .createHash('md5')
      .update(`${paygateId}${responseParams.PAY_REQUEST_ID}${reference}${paygateKey}`)
      .digest('hex')
      .toLowerCase()

    return {
      checksum: redirectChecksum,
      message: 'Payment initiated',
      paymentUrl: `${paygateUrl}/payweb3/process.trans`,
      payRequestId: responseParams.PAY_REQUEST_ID,
      reference,
    }
  }
