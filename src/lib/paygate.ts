export function parseResponse(responseData: string): Record<string, string> {
  if (!responseData || typeof responseData !== 'string') {
    throw new Error('Invalid response data from PayGate')
  }

  const result: Record<string, string> = {}
  for (const pair of responseData.split('&')) {
    const eqIdx = pair.indexOf('=')
    if (eqIdx === -1) {
      result[pair] = ''
    } else {
      const key = decodeURIComponent(pair.slice(0, eqIdx))
      const value = decodeURIComponent(pair.slice(eqIdx + 1))
      if (key) {
        result[key] = value
      }
    }
  }
  return result
}

async function postForm(
  url: string,
  data: Record<string, string>,
): Promise<Record<string, string>> {
  const response = await fetch(url, {
    body: new URLSearchParams(data).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    method: 'POST',
  })

  const text = await response.text()

  if (!response.ok) {
    return { ERROR: `HTTP ${response.status}: ${text.slice(0, 500)}` }
  }

  return parseResponse(text)
}

export async function initiateTransaction(
  paygateUrl: string,
  data: Record<string, string>,
): Promise<Record<string, string>> {
  return postForm(`${paygateUrl}/payweb3/initiate.trans`, data)
}

export async function queryTransaction(
  paygateUrl: string,
  data: Record<string, string>,
): Promise<Record<string, string>> {
  return postForm(`${paygateUrl}/payweb3/query.trans`, data)
}
