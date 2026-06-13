import type { Config } from 'payload'

import type { DpoPluginConfig } from './types.js'

import DpoDashboard from './admin/Dashboard.js'
import { getCollections } from './collections/index.js'
import { getEndpoints } from './endpoints/index.js'

export { paygateAdapter, paygateAdapterClient } from './adapters/index.js'
export type {
  ConfirmOrderReturnType,
  InitiatePaymentReturnType,
  PaygateAdapterArgs,
  PaygateAdapterClient,
} from './adapters/index.js'

export const dpoPlugin =
  (pluginOptions: DpoPluginConfig) =>
  (config: Config): Config => {
    const enabledCollections = getCollections(pluginOptions)
    const enabledEndpoints = getEndpoints(pluginOptions)

    config.collections = [...(config.collections || []), ...enabledCollections]

    if (pluginOptions.disabled) {
      return config
    }

    config.endpoints = [...(config.endpoints || []), ...enabledEndpoints]

    if (pluginOptions.adminDashboard) {
      config.admin = {
        ...config.admin,
        components: {
          ...config.admin?.components,
          afterDashboard: [
            ...((config.admin?.components as any)?.afterDashboard || []),
            DpoDashboard,
          ],
        },
      }
    }

    const incomingOnInit = config.onInit

    config.onInit = async (payload) => {
      if (incomingOnInit) {
        await incomingOnInit(payload)
      }
    }

    return config
  }
