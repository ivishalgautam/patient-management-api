import fp from "fastify-plugin";
import { releaseOpenTransactions } from "../db/transaction.js";

// Echo the request id so clients and logs can be correlated, and give every
// handler reply.ok() for the standard success envelope.
export default fp(async (app) => {
  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  app.addHook("onResponse", async (request) => releaseOpenTransactions(request));

  app.decorateReply("ok", function ok(data, extra = {}) {
    return this.send({ status: true, data, ...extra });
  });
});
