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
  venue_name?: string | null;
};

type SupabaseHeaders = {
  apikey: string;
  Authorization: string;
  Prefer?: string;
};

type SupabaseEventJoinRow = {
  id: string;
  title?: string | null;
  event_date?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  status?: string | null;
  venue_id?: string | null;
  venues?: { name?: string | null } | null;
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

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error('Missing Supabase URL. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.');
  }

  return url.replace(/\/$/, '');
}

function getSupabaseKey(mode: 'read' | 'write'): string {
  if (mode === 'write') {
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRole) {
      throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY for server-side write/RPC operations.');
    }
    return serviceRole;
  }

  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (anon) return anon;

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRole) return serviceRole;

  throw new Error('Missing Supabase read key. Set NEXT_PUBLIC_SUPABASE_ANON_KEY (preferred) or SUPABASE_SERVICE_ROLE_KEY.');
}

function getSupabaseConfig(mode: 'read' | 'write'): { url: string; key: string } {
  const url = getSupabaseUrl();
  const key = getSupabaseKey(mode);

  return { url, key };
}

function buildSupabaseHeaders(mode: 'read' | 'write', prefer?: string): SupabaseHeaders {
  const { key } = getSupabaseConfig(mode);
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
  const { url } = getSupabaseConfig('read');
  const response = await fetch(`${url}/rest/v1/${table}?${params.toString()}`, {
    headers: buildSupabaseHeaders('read'),
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
  const { url } = getSupabaseConfig('write');
  const response = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      ...buildSupabaseHeaders('write', 'return=minimal'),
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
  const { url } = getSupabaseConfig('write');
  const response = await fetch(`${url}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      ...buildSupabaseHeaders('write'),
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

export async function supabaseUpdate<T extends Record<string, unknown>>(
  table: string,
  payload: T,
  filters: URLSearchParams,
): Promise<number> {
  const { url } = getSupabaseConfig('write');
  const response = await fetch(`${url}/rest/v1/${table}?${filters.toString()}`, {
    method: 'PATCH',
    headers: {
      ...buildSupabaseHeaders('write', 'return=representation'),
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!response.ok) {
    const details = await response.text();
    throw new SupabaseRequestError(`Supabase update failed (${table}).`, response.status, details);
  }

  const body = (await response.json()) as unknown[];
  return Array.isArray(body) ? body.length : 0;
}

function mapJoinedEvents(rows: SupabaseEventJoinRow[]): EventRecord[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title ?? null,
    event_date: row.event_date ?? null,
    starts_at: row.starts_at ?? null,
    ends_at: row.ends_at ?? null,
    status: row.status ?? null,
    venue_id: row.venue_id ?? null,
    venue_name: row.venues?.name ?? null,
  }));
}

export async function getEventByIdFromDatabase(eventId: string): Promise<EventRecord | null> {
  const params = new URLSearchParams({
    select: 'id,title,status,event_date,starts_at,ends_at,venue_id,venues(name)',
    id: `eq.${eventId}`,
    limit: '1',
  });

  const events = await supabaseSelect<SupabaseEventJoinRow>('events', params);
  return mapJoinedEvents(events)[0] ?? null;
}

export async function getEventsFromDatabase(): Promise<EventRecord[]> {
  const params = new URLSearchParams({
    select: 'id,title,event_date,starts_at,ends_at,status,venue_id,venues(name)',
    order: 'starts_at.asc.nullslast,event_date.asc',
  });

  const events = await supabaseSelect<SupabaseEventJoinRow>('events', params);
  return mapJoinedEvents(events);
}

export function getHostActiveEvent<T extends HostEvent>(
  events: T[],
  now: Date = new Date(),
): T | null {
  if (!Array.isArray(events) || events.length === 0) return null;

  return events.find((event) => deriveEventStatus(event, now) === 'live') ?? null;
}
