import type { Endpoint, PayloadRequest } from 'payload'
import { generateSignature } from '../lib/checksum.js'
import { CURRENCY_LOCALE_MAP, DEFAULT_PAYGATE_URL, DEFAULT_ROUTES } from '../lib/constants.js'
import { initiateTransaction } from '../lib/paygate.js'
import type { DpoPluginConfig, DpoRoutes } from '../types.js'

function buildReturnUrl(baseUrl: string, routes: DpoRoutes | undefined): string {
  return `${baseUrl}/api${routes?.return ?? DEFAULT_ROUTES.return}`
}

function buildNotifyUrl(baseUrl: string, routes: DpoRoutes | undefined): string {
  return `${baseUrl}/api${routes?.notify ?? DEFAULT_ROUTES.notify}`
}

function resolveCountry(currency: string, configDefault: string | undefined): string {
  if (configDefault) return configDefault
  return CURRENCY_LOCALE_MAP[currency]?.country ?? 'ZAF'
}

function resolveLocale(currency: string, configDefault: string | undefined): string {
  if (configDefault) return configDefault
  return CURRENCY_LOCALE_MAP[currency]?.locale ?? 'en-za'
}

export const createInitiateEndpoint = (pluginOptions: DpoPluginConfig): Endpoint => {
  const initiatePath = pluginOptions.routes?.initiate ?? DEFAULT_ROUTES.initiate
  const collectionSlug = pluginOptions.transactionCollectionSlug ?? 'dpo-transactions'

  return {
    handler: async (req: PayloadRequest) => {
      try {
        const body = (await req.json?.()) ?? {}
        const { amount, currency, email, reference, relatedCollection, relatedDoc } = body

        if (!amount || !email) {
          return Response.json(
            { error: 'Amount and email are required', success: false },
            { status: 400 },
          )
        }

        const paygateId = pluginOptions.paygateId || process.env.PAYGATE_ID || ''
        const paygateKey = pluginOptions.paygateKey || process.env.PAYGATE_KEY || ''
        const paygateUrl =
          pluginOptions.paygateUrl || process.env.PAYGATE_URL || DEFAULT_PAYGATE_URL
        const serverUrl = req.payload?.config?.serverURL || ''
        const baseUrl = pluginOptions.baseUrl || process.env.BASE_URL || serverUrl

        if (!paygateId || !paygateKey) {
          return Response.json(
            {
              error: 'PayGate is not configured — missing PAYGATE_ID or PAYGATE_KEY',
              success: false,
            },
            { status: 500 },
          )
        }

        if (!baseUrl) {
          return Response.json(
            {
              error:
                'BASE_URL is not configured. Set BASE_URL in your .env (e.g., https://www.example.com) or configure the Payload serverURL.',
              success: false,
            },
            { status: 500 },
          )
        }

        const formattedAmount = String(amount).replace(/\D/g, '')
        const txReference =
          reference || `ORDER_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
        const txCurrency = currency || pluginOptions.defaultCurrency || 'ZAR'

        const transactionData: Record<string, string> = {
          AMOUNT: formattedAmount,
          COUNTRY: resolveCountry(txCurrency, pluginOptions.defaultCountry),
          CURRENCY: txCurrency,
          EMAIL: email,
          LOCALE: resolveLocale(txCurrency, pluginOptions.defaultLocale),
          NOTIFY_URL: buildNotifyUrl(baseUrl, pluginOptions.routes),
          PAYGATE_ID: paygateId,
          REFERENCE: txReference,
          RETURN_URL: buildReturnUrl(baseUrl, pluginOptions.routes),
          TRANSACTION_DATE: new Date().toISOString().slice(0, 19).replace('T', ' '),
        }

        const checksum = generateSignature(transactionData, paygateKey)
        transactionData.CHECKSUM = checksum

        const responseParams = await initiateTransaction(paygateUrl, transactionData)

        if (responseParams.ERROR) {
          return Response.json(
            { error: `PayGate Error: ${responseParams.ERROR}`, success: false },
            { status: 400 },
          )
        }

        if (!responseParams.PAY_REQUEST_ID || !responseParams.CHECKSUM) {
          return Response.json(
            {
              error: 'Invalid PayGate response — missing PAY_REQUEST_ID or CHECKSUM',
              raw: responseParams,
              sentTo: `${paygateUrl}/payweb3/initiate.trans`,
              success: false,
            },
            { status: 500 },
          )
        }

        if (req.payload) {
          await req.payload.create({
            collection: collectionSlug,
            data: {
              amount: parseInt(formattedAmount, 10),
              currency: txCurrency,
              email,
              payRequestId: responseParams.PAY_REQUEST_ID,
              rawResponse: responseParams,
              reference: txReference,
              relatedCollection: relatedCollection || null,
              relatedDoc: relatedDoc || null,
              statusMessage: 'Initiated',
              transactionStatus: '0',
            },
          })
        }

        return Response.json({
          checksum: responseParams.CHECKSUM,
          paymentUrl: `${paygateUrl}/payweb3/process.trans`,
          payRequestId: responseParams.PAY_REQUEST_ID,
          reference: txReference,
          success: true,
        })
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return Response.json(
          {
            error: 'Payment initiation failed',
            message,
            success: false,
          },
          { status: 500 },
        )
      }
    },
    method: 'post',
    path: initiatePath,
  }
}
