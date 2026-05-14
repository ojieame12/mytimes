import { pathToFileURL } from "node:url";
import { closePool, getPool } from "./db.js";
import { loadEnv } from "./env.js";

export type RetentionResult = {
  enabled: boolean;
  archivedEvents: number;
  deletedArchivedEvents: number;
  scrubbedBookings: number;
  scrubbedEmailLogs: number;
  scrubbedActivityEvents: number;
  scrubbedProductEvents: number;
  scrubbedEvents: number;
  deletedRateLimitEvents: number;
  deletedIdempotencyKeys: number;
};

export async function runRetention(): Promise<RetentionResult> {
  const env = loadEnv();
  const empty = emptyResult(env.retentionEnabled);
  if (!env.retentionEnabled) {
    return empty;
  }

  const pool = getPool();
  const archivedEvents = await pool.query<{ id: string }>(
    `
      with candidates as (
        select e.id
        from slotboard.booking_events e
        join lateral (
          select max(s.ends_at) as last_slot_end
          from slotboard.time_slots s
          where s.event_id = e.id
        ) slot_bounds on true
        where e.status = 'active'
          and e.deleted_at is null
          and slot_bounds.last_slot_end is not null
          and slot_bounds.last_slot_end < now() - ($1::int * interval '1 day')
      )
      update slotboard.booking_events e
      set status = 'archived',
          archived_at = coalesce(e.archived_at, now())
      from candidates c
      where e.id = c.id
      returning e.id
    `,
    [env.retentionArchiveAfterDays],
  );

  const deletedArchivedEvents = await pool.query<{ id: string }>(
    `
      update slotboard.booking_events
      set status = 'deleted',
          deleted_at = coalesce(deleted_at, now())
      where status = 'archived'
        and archived_at is not null
        and deleted_at is null
        and archived_at < now() - ($1::int * interval '1 day')
      returning id
    `,
    [env.retentionDeleteArchivedAfterDays],
  );

  const scrubbedBookings = await pool.query<{ id: string }>(
    `
      update slotboard.bookings b
      set participant_name = 'Deleted participant',
          participant_email = 'scrubbed+' || b.id::text || '@slotboard.invalid',
          dedupe_email = null,
          notes = '',
          cancelled_reason = null,
          manage_token_hash = 'scrubbed:manage:' || b.id::text
      from slotboard.booking_events e
      where e.id = b.event_id
        and e.deleted_at is not null
        and e.deleted_at < now() - ($1::int * interval '1 day')
        and (
          b.participant_name <> 'Deleted participant'
          or b.participant_email not like 'scrubbed+%@slotboard.invalid'
          or b.dedupe_email is not null
          or b.notes <> ''
          or b.cancelled_reason is not null
          or b.manage_token_hash not like 'scrubbed:manage:%'
        )
      returning b.id
    `,
    [env.retentionPiiScrubAfterDays],
  );

  const scrubbedEmailLogs = await pool.query<{ id: string }>(
    `
      update slotboard.email_delivery_logs l
      set recipient_email = 'scrubbed+' || l.id::text || '@slotboard.invalid',
          error = case when l.error is null then null else 'scrubbed' end
      from slotboard.booking_events e
      where e.id = l.event_id
        and e.deleted_at is not null
        and e.deleted_at < now() - ($1::int * interval '1 day')
        and (
          l.recipient_email not like 'scrubbed+%@slotboard.invalid'
          or l.error is not null
        )
      returning l.id
    `,
    [env.retentionPiiScrubAfterDays],
  );

  await pool.query(
    `
      update slotboard.email_webhook_events w
      set delivery_log_id = null
      from slotboard.email_delivery_logs l
      join slotboard.booking_events e on e.id = l.event_id
      where w.delivery_log_id = l.id
        and e.deleted_at is not null
        and e.deleted_at < now() - ($1::int * interval '1 day')
    `,
    [env.retentionPiiScrubAfterDays],
  );

  const scrubbedActivityEvents = await pool.query<{ id: string }>(
    `
      update slotboard.activity_events a
      set actor_label = case when a.actor_label is null then null else 'scrubbed' end,
          metadata = '{}'::jsonb
      from slotboard.booking_events e
      where e.id = a.event_id
        and e.deleted_at is not null
        and e.deleted_at < now() - ($1::int * interval '1 day')
        and (
          a.actor_label is not null
          or a.metadata <> '{}'::jsonb
        )
      returning a.id
    `,
    [env.retentionPiiScrubAfterDays],
  );

  const scrubbedProductEvents = await pool.query<{ id: string }>(
    `
      update slotboard.product_events p
      set actor_key_hash = null,
          metadata = '{}'::jsonb
      from slotboard.booking_events e
      where e.id = p.event_id
        and e.deleted_at is not null
        and e.deleted_at < now() - ($1::int * interval '1 day')
        and (
          p.actor_key_hash is not null
          or p.metadata <> '{}'::jsonb
        )
      returning p.id
    `,
    [env.retentionPiiScrubAfterDays],
  );

  const scrubbedEvents = await pool.query<{ id: string }>(
    `
      update slotboard.booking_events
      set title = 'Deleted board',
          description = '',
          organizer_name = 'Deleted organizer',
          organizer_email = 'scrubbed+' || id::text || '@slotboard.invalid',
          availability_config = '{}'::jsonb,
          public_token_hash = 'scrubbed:public:' || id::text,
          admin_token_hash = 'scrubbed:admin:' || id::text,
          owner_user_id = null
      where deleted_at is not null
        and deleted_at < now() - ($1::int * interval '1 day')
        and (
          title <> 'Deleted board'
          or description <> ''
          or organizer_name <> 'Deleted organizer'
          or organizer_email not like 'scrubbed+%@slotboard.invalid'
          or availability_config <> '{}'::jsonb
          or public_token_hash not like 'scrubbed:public:%'
          or admin_token_hash not like 'scrubbed:admin:%'
          or owner_user_id is not null
        )
      returning id
    `,
    [env.retentionPiiScrubAfterDays],
  );

  const deletedRateLimitEvents = await pool.query<{ id: string }>(
    `
      delete from slotboard.rate_limit_events
      where created_at < now() - ($1::int * interval '1 day')
      returning id
    `,
    [env.retentionRateLimitAfterDays],
  );

  const deletedIdempotencyKeys = await pool.query<{ id: string }>(
    `
      delete from slotboard.idempotency_keys
      where created_at < now() - ($1::int * interval '1 day')
      returning id
    `,
    [env.retentionIdempotencyAfterDays],
  );

  return {
    enabled: true,
    archivedEvents: rowCount(archivedEvents),
    deletedArchivedEvents: rowCount(deletedArchivedEvents),
    scrubbedBookings: rowCount(scrubbedBookings),
    scrubbedEmailLogs: rowCount(scrubbedEmailLogs),
    scrubbedActivityEvents: rowCount(scrubbedActivityEvents),
    scrubbedProductEvents: rowCount(scrubbedProductEvents),
    scrubbedEvents: rowCount(scrubbedEvents),
    deletedRateLimitEvents: rowCount(deletedRateLimitEvents),
    deletedIdempotencyKeys: rowCount(deletedIdempotencyKeys),
  };
}

function emptyResult(enabled: boolean): RetentionResult {
  return {
    enabled,
    archivedEvents: 0,
    deletedArchivedEvents: 0,
    scrubbedBookings: 0,
    scrubbedEmailLogs: 0,
    scrubbedActivityEvents: 0,
    scrubbedProductEvents: 0,
    scrubbedEvents: 0,
    deletedRateLimitEvents: 0,
    deletedIdempotencyKeys: 0,
  };
}

function rowCount(result: { rowCount: number | null; rows: unknown[] }): number {
  return result.rowCount ?? result.rows.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}

async function main(): Promise<void> {
  try {
    const result = await runRetention();
    console.log(JSON.stringify({ event: "slotboard_retention_completed", ...result }));
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "slotboard_retention_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
