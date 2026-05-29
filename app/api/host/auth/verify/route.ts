export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';

type VerifyBody = {
  host_key?: string;
};

export async function POST(request: Request) {
  const expected = process.env.HOST_DASHBOARD_KEY;
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'Host dashboard key is not configured.' }, { status: 500 });
  }

  let body: VerifyBody;
  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const submitted = body.host_key?.trim() ?? '';
  if (!submitted) {
    return NextResponse.json({ ok: false, error: 'Host key is required.' }, { status: 400 });
  }

  if (submitted !== expected) {
    return NextResponse.json({ ok: false, error: 'Invalid host key.' }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
