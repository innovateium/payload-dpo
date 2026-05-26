import type { Endpoint, PayloadRequest } from 'payload'

import type { DpoPluginConfig } from '../types.js'

import { DEFAULT_ROUTES } from '../lib/constants.js'

export const createReturnEndpoint = (pluginOptions: DpoPluginConfig): Endpoint[] => {
  const returnPath = pluginOptions.routes?.return ?? DEFAULT_ROUTES.return
  const returnResultPath = pluginOptions.routes?.returnResult ?? DEFAULT_ROUTES.returnResult

  return [
    {
      handler: (req: PayloadRequest) => {
        const url = new URL(req.url || '', 'http://localhost')
        const payRequestId =
          url.searchParams.get('PAY_REQUEST_ID') || url.searchParams.get('payRequestId') || ''
        const baseUrl =
          pluginOptions.baseUrl || process.env.BASE_URL || req.payload?.config?.serverURL || ''

        if (!payRequestId) {
          return new Response('Missing PAY_REQUEST_ID', { status: 400 })
        }

        return new Response(null, {
          headers: { Location: `${baseUrl}${returnResultPath}?PAY_REQUEST_ID=${payRequestId}` },
          status: 302,
        })
      },
      method: 'get' as const,
      path: returnPath,
    },
    {
      handler: async (req: PayloadRequest) => {
        let payRequestId = ''
        try {
          const text = (await req.text?.()) ?? ''
          for (const pair of text.split('&')) {
            const [key, value] = pair.split('=').map(decodeURIComponent)
            if (key === 'PAY_REQUEST_ID') {
              payRequestId = value
            }
          }
        } catch {
          // ignore
        }

        payRequestId =
          payRequestId ||
          new URL(req.url || '', 'http://localhost').searchParams.get('PAY_REQUEST_ID') ||
          ''

        const baseUrl =
          pluginOptions.baseUrl || process.env.BASE_URL || req.payload?.config?.serverURL || ''

        if (!payRequestId) {
          return new Response('Missing PAY_REQUEST_ID', { status: 400 })
        }

        return new Response(null, {
          headers: { Location: `${baseUrl}${returnResultPath}?PAY_REQUEST_ID=${payRequestId}` },
          status: 302,
        })
      },
      method: 'post' as const,
      path: returnPath,
    },
  ]
}
