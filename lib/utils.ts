import { deriveEventStatus, type EventStatusInput } from './event-status';

export type HostEvent = EventStatusInput & {
  id: string;
};

export type EventRecord = HostEvent & {
  title?: string | null;
  event_date?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  venue_id?: string | null;
  status?: string | null;
};

type SupabaseHeaders = {
  apikey: string;
  Authorization: string;
  Prefer?: string;
};

export class SupabaseRequestError extends Error {
  status: number;
  details: string;

  constructor(message: string, status: number, details: string) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function getSupabaseConfig(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase configuration. Required: SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY.',
    );
  }

  return { url: url.replace(/\/$/, ''), key };
}

function buildSupabaseHeaders(prefer?: string): SupabaseHeaders {
  const { key } = getSupabaseConfig();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

export async function supabaseSelect<T>(
  table: string,
  params: URLSearchParams,
): Promise<T[]> {
  const { url } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${table}?${params.toString()}`, {
    headers: buildSupabaseHeaders(),
    cache: 'no-store',
  });

  if (!response.ok) {
    const details = await response.text();
    throw new SupabaseRequestError(`Supabase select failed (${table}).`, response.status, details);
  }

  return (await response.json()) as T[];
}

export async function supabaseInsert<T extends Record<string, unknown>>(
  table: string,
  payload: T,
): Promise<void> {
  const { url } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      ...buildSupabaseHeaders('return=minimal'),
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!response.ok) {
    const details = await response.text();
    throw new SupabaseRequestError(`Supabase insert failed (${table}).`, response.status, details);
  }
}

export async function supabaseRpc<T>(fnName: string, payload: Record<string, unknown>): Promise<T> {
  const { url } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      ...buildSupabaseHeaders(),
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!response.ok) {
    const details = await response.text();
    throw new SupabaseRequestError(`Supabase RPC failed (${fnName}).`, response.status, details);
  }

  return (await response.json()) as T;
}

export async function getEventByIdFromDatabase(eventId: string): Promise<EventRecord | null> {
  const params = new URLSearchParams({
    select: 'id,title,status,event_date,starts_at,ends_at,venue_id',
    id: `eq.${eventId}`,
    limit: '1',
  });

  const events = await supabaseSelect<EventRecord>('events', params);
  return events[0] ?? null;
}

export async function getEventsFromDatabase(): Promise<EventRecord[]> {
  const params = new URLSearchParams({
    select: 'id,title,status,event_date,starts_at,ends_at,venue_id',
    order: 'event_date.asc',
  });

  return supabaseSelect<EventRecord>('events', params);
}

export function getHostActiveEvent<T extends HostEvent>(
  events: T[],
  now: Date = new Date(),
): T | null {
  if (!Array.isArray(events) || events.length === 0) return null;

  return events.find((event) => deriveEventStatus(event, now) === 'live') ?? null;
}
