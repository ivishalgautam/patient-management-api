"use strict";
import { QueryTypes } from "sequelize";
import { z } from "zod";
import { sequelize } from "../../db/postgres.js";
import { getBoss } from "../../jobs/queue.js";
import { notFound } from "../../lib/app-error.js";

const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  queue: z.string().optional(),
});

// Failed background jobs (after all retries), newest first. Practice users
// only see jobs that carry their practiceId.
const listFailed = async (req, reply) => {
  const { page, limit, queue } = listQuery.parse(req.query);
  const where = [`state = 'failed'`];
  const params = { limit, offset: (page - 1) * limit };
  if (!req.ctx.isPlatformAdmin) {
    where.push(`data->>'practiceId' = :practiceId`);
    params.practiceId = req.ctx.practiceId;
  }
  if (queue) {
    where.push(`name = :queue`);
    params.queue = queue;
  }
  const rows = await sequelize.query(
    `SELECT id, name AS queue, data, output, retry_count, created_on, completed_on,
            count(*) OVER()::int AS total
       FROM pgboss.job WHERE ${where.join(" AND ")}
      ORDER BY completed_on DESC NULLS LAST LIMIT :limit OFFSET :offset`,
    { replacements: params, type: QueryTypes.SELECT },
  );
  return reply.ok(
    rows.map(({ total, ...job }) => job),
    { meta: { page, limit, total: rows[0]?.total ?? 0 } },
  );
};

const retry = async (req, reply) => {
  const id = z.string().uuid().parse(req.params.id);
  const [job] = await sequelize.query(
    `SELECT id, name, data FROM pgboss.job WHERE id = :id AND state = 'failed'`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  if (!job || (!req.ctx.isPlatformAdmin && job.data?.practiceId !== req.ctx.practiceId)) {
    throw notFound("Failed job not found.");
  }
  await getBoss().retry(job.name, job.id);
  return reply.ok({ id: job.id }, { message: "Job queued for retry." });
};

export default { listFailed, retry };
