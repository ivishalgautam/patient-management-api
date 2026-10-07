import fp from "fastify-plugin";
import cookie from "@fastify/cookie";

// The dashboard authenticates with an httpOnly "token" cookie (set by its
// Next.js route handlers); other clients send Authorization: Bearer.
export default fp(async (app) => {
  await app.register(cookie);
});
