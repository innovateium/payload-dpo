import type { CollectionConfig } from 'payload'

import type { DpoPluginConfig } from '../types.js'

import { createDpoTransactionsCollection } from './DpoTransactions.js'

export const getCollections = (pluginOptions: DpoPluginConfig): CollectionConfig[] => {
  const collections: CollectionConfig[] = [createDpoTransactionsCollection(pluginOptions)]

  return collections
}
