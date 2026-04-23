export type CustomerSessionPayload = {
  customer_id: string;
  event_id: string;
  iat: number;
  exp: number;
};

const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h

function base64UrlEncode(input: Uint8Array): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlDecodeToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

function base64UrlDecodeToString(input: string): string {
  return Buffer.from(base64UrlDecodeToBytes(input)).toString('utf8');
}

async function importHmacKey(secret: string, keyUsages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    keyUsages,
  );
}

async function signMessage(message: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return base64UrlEncode(new Uint8Array(signature));
}

async function verifyMessageSignature(message: string, signature: string, secret: string): Promise<boolean> {
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = base64UrlDecodeToBytes(signature);
  } catch {
    return false;
  }

  const key = await importHmacKey(secret, ['verify']);
  const signatureBuffer = new ArrayBuffer(signatureBytes.byteLength);
  new Uint8Array(signatureBuffer).set(signatureBytes);
  return crypto.subtle.verify('HMAC', key, signatureBuffer, new TextEncoder().encode(message));
}

function getSessionSecret(): string {
  const secret = process.env.CUSTOMER_SESSION_SECRET;
  if (!secret) {
    throw new Error('Missing CUSTOMER_SESSION_SECRET environment variable.');
  }

  return secret;
}

function isValidPayload(payload: unknown): payload is CustomerSessionPayload {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as Partial<CustomerSessionPayload>;

  if (typeof candidate.customer_id !== 'string' || candidate.customer_id.length === 0) return false;
  if (typeof candidate.event_id !== 'string' || candidate.event_id.length === 0) return false;

  if (typeof candidate.iat !== 'number' || !Number.isFinite(candidate.iat)) return false;
  if (typeof candidate.exp !== 'number' || !Number.isFinite(candidate.exp)) return false;
  if (candidate.exp <= candidate.iat) return false;

  return true;
}

export async function createCustomerSessionToken(
  customerId: string,
  eventId: string,
  now: Date = new Date(),
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + DEFAULT_SESSION_TTL_SECONDS;

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: CustomerSessionPayload = {
    customer_id: customerId,
    event_id: eventId,
    iat: issuedAt,
    exp: expiresAt,
  };

  const encodedHeader = base64UrlEncodeJson(header);
  const encodedPayload = base64UrlEncodeJson(payload);
  const message = `${encodedHeader}.${encodedPayload}`;
  const signature = await signMessage(message, getSessionSecret());

  return `${message}.${signature}`;
}

export async function verifyCustomerSessionToken(
  token: string,
  now: Date = new Date(),
): Promise<CustomerSessionPayload | null> {
  const [encodedHeader, encodedPayload, signature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !signature) return null;

  let header: unknown;
  try {
    header = JSON.parse(base64UrlDecodeToString(encodedHeader));
  } catch {
    return null;
  }

  if (
    !header ||
    typeof header !== 'object' ||
    (header as { alg?: unknown }).alg !== 'HS256' ||
    (header as { typ?: unknown }).typ !== 'JWT'
  ) {
    return null;
  }

  const message = `${encodedHeader}.${encodedPayload}`;
  const isValidSignature = await verifyMessageSignature(message, signature, getSessionSecret());
  if (!isValidSignature) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlDecodeToString(encodedPayload));
  } catch {
    return null;
  }

  if (!isValidPayload(payload)) return null;

  const nowEpochSeconds = Math.floor(now.getTime() / 1000);
  if (payload.exp <= nowEpochSeconds) return null;

  return payload;
}

export function getCustomerSessionTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim() || null;
  }

  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map((part) => part.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith('customer_session=')) {
      return cookie.slice('customer_session='.length) || null;
    }
  }

  return null;
}
