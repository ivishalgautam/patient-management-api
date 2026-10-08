"use strict";
import * as service from "./service.js";
import { uuidParam } from "../../validation-schema/leads-config.schema.js";
import {
  cancelInput,
  cashBookQuery,
  cashEntryInput,
  categoryInput,
  categoryUpdate,
  expenseInput,
  expenseQuery,
  expenseUpdate,
  invoiceInput,
  invoiceQuery,
  summaryQuery,
} from "../../validation-schema/accounts.schema.js";

const id = (req) => uuidParam.parse(req.params).id;

// Authenticated: /v1/accounts
export default async function routes(fastify) {
  // expense categories
  fastify.get("/expense-categories", async (req, reply) =>
    reply.ok(await service.listCategories(req.ctx, { includeArchived: req.query?.include_archived === "true" })),
  );
  fastify.post("/expense-categories", async (req, reply) =>
    reply.code(201).ok(await service.createCategory(req.ctx, categoryInput.parse(req.body)), { message: "Category added." }),
  );
  fastify.put("/expense-categories/:id", async (req, reply) =>
    reply.ok(await service.updateCategory(req.ctx, id(req), categoryUpdate.parse(req.body)), { message: "Category saved." }),
  );

  // expenses
  fastify.get("/expenses", async (req, reply) => {
    const { expenses, meta } = await service.listExpenses(req.ctx, expenseQuery.parse(req.query ?? {}));
    return reply.ok(expenses, { meta });
  });
  fastify.post("/expenses", async (req, reply) =>
    reply.code(201).ok(await service.createExpense(req.ctx, expenseInput.parse(req.body)), { message: "Expense recorded." }),
  );
  fastify.put("/expenses/:id", async (req, reply) =>
    reply.ok(await service.updateExpense(req.ctx, id(req), expenseUpdate.parse(req.body)), { message: "Expense saved." }),
  );
  fastify.delete("/expenses/:id", async (req, reply) => {
    await service.deleteExpense(req.ctx, id(req));
    return reply.ok(null, { message: "Expense deleted." });
  });

  // cash book
  fastify.get("/cash-book", async (req, reply) => reply.ok(await service.cashBook(req.ctx, cashBookQuery.parse(req.query ?? {}))));
  fastify.post("/cash-entries", async (req, reply) =>
    reply.code(201).ok(await service.createCashEntry(req.ctx, cashEntryInput.parse(req.body)), { message: "Cash entry recorded." }),
  );
  fastify.delete("/cash-entries/:id", async (req, reply) => {
    await service.deleteCashEntry(req.ctx, id(req));
    return reply.ok(null, { message: "Cash entry deleted." });
  });

  // invoices
  fastify.get("/invoices", async (req, reply) => {
    const { invoices, meta } = await service.listInvoices(req.ctx, invoiceQuery.parse(req.query ?? {}));
    return reply.ok(invoices, { meta });
  });
  fastify.post("/invoices", async (req, reply) =>
    reply.code(201).ok(await service.createInvoice(req.ctx, invoiceInput.parse(req.body)), { message: "Invoice issued." }),
  );
  fastify.get("/invoices/:id", async (req, reply) => reply.ok(await service.getInvoice(req.ctx, id(req))));
  fastify.post("/invoices/:id/cancel", async (req, reply) =>
    reply.ok(await service.cancelInvoice(req.ctx, id(req), cancelInput.parse(req.body)), { message: "Invoice cancelled." }),
  );
  fastify.get("/treatments/:id/invoice-draft", async (req, reply) => reply.ok(await service.invoiceDraftForTreatment(req.ctx, id(req))));

  // income & expenditure
  fastify.get("/summary", async (req, reply) => reply.ok(await service.summary(req.ctx, summaryQuery.parse(req.query ?? {}))));
}
