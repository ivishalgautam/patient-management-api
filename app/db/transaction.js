"use strict";
import { sequelize } from "./postgres.js";

// Starts a transaction tied to the request. If the handler returns without
// committing or rolling back (e.g. an early `return res.code(404)...`), the
// request-context plugin rolls it back when the response is sent, so pooled
// connections are never leaked.
export async function beginTransaction(req) {
  const transaction = await sequelize.transaction();
  (req.openTransactions ??= []).push(transaction);
  return transaction;
}

export async function releaseOpenTransactions(req) {
  for (const transaction of req.openTransactions ?? []) {
    if (!transaction.finished) {
      req.log.warn({ route: req.routeOptions?.url }, "rolled back an unfinished transaction");
      await transaction.rollback().catch(() => {});
    }
  }
}
