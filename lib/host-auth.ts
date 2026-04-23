import { NextResponse } from 'next/server';

export function assertHostRequest(request: Request): NextResponse | null {
  const expected = process.env.HOST_DASHBOARD_KEY;
  if (!expected) {
    return NextResponse.json({ error: 'Host dashboard key is not configured.' }, { status: 500 });
  }

  const header = request.headers.get('x-host-key')?.trim();
  if (!header || header !== expected) {
    return NextResponse.json({ error: 'Unauthorized host request.' }, { status: 401 });
  }

  return null;
}
