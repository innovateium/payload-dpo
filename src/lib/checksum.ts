import crypto from 'crypto'

import { SIGNATURE_FIELDS } from './constants.js'

export function generateSignature(
  params: Record<string, string | undefined>,
  paygateKey: string,
): string {
  const hashString =
    SIGNATURE_FIELDS.map((field) => String(params[field] || '')).join('') + paygateKey

  return crypto.createHash('md5').update(hashString).digest('hex').toLowerCase()
}
