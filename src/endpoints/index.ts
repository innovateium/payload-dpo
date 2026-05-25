import type { Endpoint } from 'payload'

import type { DpoPluginConfig } from '../types.js'

import { createInitiateEndpoint } from './initiate.js'
import { createNotifyEndpoint } from './notify.js'
import { createReturnEndpoint } from './return.js'
import { createStatusEndpoint } from './status.js'

export const getEndpoints = (pluginOptions: DpoPluginConfig): Endpoint[] => [
  createInitiateEndpoint(pluginOptions),
  createNotifyEndpoint(pluginOptions),
  ...createReturnEndpoint(pluginOptions),
  createStatusEndpoint(pluginOptions),
]
