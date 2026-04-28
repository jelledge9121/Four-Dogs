export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { supabaseSelect } from '../../../../lib/utils';

type CheckInRow = { customer_id: string; event_id: string; created_at: string };
type EventRow = { id: string; title?: string | null; event_date?: string | null; starts_at?: string | null; venues?: { name?: string | null } | null };
type RewardRedemptionRow = { id: string; status: string; reward_id: string; created_at: string; points_cost: number; event_id?: string | null };

export async function GET() {
  const [checkins, events, redemptions] = await Promise.all([
    supabaseSelect<CheckInRow>('check_ins', new URLSearchParams({ select: 'customer_id,event_id,created_at', order: 'created_at.desc', limit: '2500' })),
    supabaseSelect<EventRow>('events', new URLSearchParams({ select: 'id,title,event_date,starts_at,venues(name)', order: 'starts_at.desc.nullslast,event_date.desc' })),
    supabaseSelect<RewardRedemptionRow>('reward_redemptions', new URLSearchParams({ select: 'id,status,reward_id,created_at,points_cost,event_id', order: 'created_at.desc', limit: '150' })),
  ]);

  const eventIds = new Set(events.map((e) => e.id));
  const validCheckins = checkins.filter((c) => eventIds.has(c.event_id));
  const byCustomer = new Map<string, CheckInRow[]>();
  const byEvent = new Map<string, Set<string>>();
  for (const row of validCheckins) {
    if (!byCustomer.has(row.customer_id)) byCustomer.set(row.customer_id, []);
    byCustomer.get(row.customer_id)!.push(row);
    if (!byEvent.has(row.event_id)) byEvent.set(row.event_id, new Set());
    byEvent.get(row.event_id)!.add(row.customer_id);
  }

  const uniqueGuests = byCustomer.size;
  let returningGuests = 0;
  let newGuests = 0;
  for (const rows of byCustomer.values()) {
    if (rows.length > 1) returningGuests += 1;
    if (rows.length === 1) newGuests += 1;
  }

  const attendanceByVenue = new Map<string, number>();
  for (const event of events) {
    const venue = event.venues?.name?.trim() || 'Unknown Venue';
    attendanceByVenue.set(venue, (attendanceByVenue.get(venue) ?? 0) + (byEvent.get(event.id)?.size ?? 0));
  }

  const recentEventPerformance = events.slice(0, 6).map((event) => ({
    event_id: event.id,
    title: event.title || 'Untitled Event',
    venue_name: event.venues?.name || 'Unknown Venue',
    attendance: byEvent.get(event.id)?.size ?? 0,
    event_date: event.event_date || event.starts_at || null,
  }));

  const topVenue = [...attendanceByVenue.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['N/A', 0];
  return NextResponse.json({
    ok: true,
    total_checkins: validCheckins.length,
    unique_guests: uniqueGuests,
    new_guests: newGuests,
    returning_guests: returningGuests,
    repeat_rate: uniqueGuests > 0 ? returningGuests / uniqueGuests : 0,
    avg_checkins_per_event: events.length > 0 ? validCheckins.length / events.length : 0,
    attendance_by_venue: [...attendanceByVenue.entries()].map(([venue_name, checkins]) => ({ venue_name, checkins })),
    recent_event_performance: recentEventPerformance,
    pending_reward_redemptions: redemptions.filter((item) => item.status === 'pending').length,
    reward_redemption_activity: redemptions.slice(0, 10),
    venue_proof: {
      checkins: validCheckins.length,
      events: events.length,
      returning_percent: uniqueGuests > 0 ? Math.round((returningGuests / uniqueGuests) * 100) : 0,
      avg_attendance_per_event: events.length > 0 ? Math.round((validCheckins.length / events.length) * 10) / 10 : 0,
      top_venue_name: topVenue[0],
    },
  });
}
