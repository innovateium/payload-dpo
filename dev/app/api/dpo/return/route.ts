import { NextRequest, NextResponse } from 'next/server'

export const GET = async (req: NextRequest) => {
  const payRequestId = req.nextUrl.searchParams.get('PAY_REQUEST_ID') || ''
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000'

  if (!payRequestId) {
    return NextResponse.json({ error: 'Missing PAY_REQUEST_ID' }, { status: 400 })
  }

  return NextResponse.redirect(`${baseUrl}/payment-result?PAY_REQUEST_ID=${payRequestId}`)
}

export const POST = async (req: NextRequest) => {
  let payRequestId = ''

  try {
    const text = await req.text()
    for (const pair of text.split('&')) {
      const [key, value] = pair.split('=').map(decodeURIComponent)
      if (key === 'PAY_REQUEST_ID') {
        payRequestId = value
      }
    }
  } catch {
    // ignore
  }

  payRequestId = payRequestId || req.nextUrl.searchParams.get('PAY_REQUEST_ID') || ''

  if (!payRequestId) {
    return NextResponse.json({ error: 'Missing PAY_REQUEST_ID' }, { status: 400 })
  }

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000'
  return NextResponse.redirect(`${baseUrl}/payment-result?PAY_REQUEST_ID=${payRequestId}`)
}
