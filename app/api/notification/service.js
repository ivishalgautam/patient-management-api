"use strict";
import config from "../../config/index.js";
import { select, one, exec } from "../../db/sql.js";
import { notFound } from "../../lib/app-error.js";

// In-app notifications for the signed-in user: lead follow-up reminders and
// appointment events (see booking-events.js).
export async function listNotifications(ctx, { unread, page = 1, limit = 20 }) {
  const rows = await select(
    `SELECT id, type, title, body, link, lead_id, booking_id, read_at, created_at, count(*) OVER()::int AS total
       FROM user_notifications
      WHERE user_id = :userId ${unread ? "AND read_at IS NULL" : ""}
      ORDER BY created_at DESC LIMIT :limit OFFSET :offset`,
    { userId: ctx.userId, limit, offset: (page - 1) * limit },
  );
  return {
    notifications: rows.map(({ total, ...n }) => n),
    meta: { page, limit, total: rows[0]?.total ?? 0, unread: await unreadCount(ctx) },
  };
}

export async function unreadCount(ctx) {
  const { n } = await one(`SELECT count(*)::int AS n FROM user_notifications WHERE user_id = :userId AND read_at IS NULL`, {
    userId: ctx.userId,
  });
  return n;
}

export async function markRead(ctx, id) {
  const row = await one(
    `UPDATE user_notifications SET read_at = coalesce(read_at, now())
      WHERE id = :id AND user_id = :userId RETURNING id`,
    { id, userId: ctx.userId },
  );
  if (!row) throw notFound("Notification not found.");
}

export async function markAllRead(ctx) {
  await exec(`UPDATE user_notifications SET read_at = now() WHERE user_id = :userId AND read_at IS NULL`, {
    userId: ctx.userId,
  });
}

// Job: one notification per follow-up coming due within the reminder
// window, to the lead's owner (or whoever added the follow-up). Claiming
// (reminded_at) and notifying happen in one statement, so a follow-up is
// never reminded twice. Follow-ups more than a day overdue are not
// reminded (e.g. after downtime or on first deploy).
export async function sendFollowUpReminders() {
  return select(
    `WITH due AS (
       UPDATE lead_activities a SET reminded_at = now()
         FROM leads l
        WHERE l.id = a.lead_id AND l.deleted_at IS NULL AND l.status = 'open'
          AND a.type = 'follow_up' AND a.completed_at IS NULL AND a.reminded_at IS NULL
          AND a.due_at <= now() + make_interval(mins => :minutes)
          AND a.due_at > now() - interval '1 day'
        RETURNING a.id, a.practice_id, a.lead_id, a.body, a.due_at,
                  coalesce(l.owner_id, a.created_by) AS recipient_id, l.full_name
     )
     INSERT INTO user_notifications (practice_id, user_id, type, title, body, link, lead_id)
     SELECT due.practice_id, due.recipient_id, 'lead_follow_up',
            'Follow-up due: ' || due.full_name,
            due.body, '/leads/' || due.lead_id, due.lead_id
       FROM due JOIN users u ON u.id = due.recipient_id AND u.is_active AND u.deleted_at IS NULL
     RETURNING id, user_id, lead_id`,
    { minutes: config.leads.follow_up_remind_minutes },
  );
}

// Read notifications are kept 90 days.
export async function purgeNotifications() {
  await exec(`DELETE FROM user_notifications WHERE read_at IS NOT NULL AND read_at < now() - interval '90 days'`);
}
