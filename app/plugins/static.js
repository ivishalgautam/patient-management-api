import fp from "fastify-plugin";
import fs from "fs";
import path from "path";
import fastifyStatic from "@fastify/static";

// Only the uploads folder is public. Stored file paths look like
// "public/images/<file>", so it is served under the /public/ prefix.
export default fp(async (app) => {
  const publicDir = path.resolve("public");
  fs.mkdirSync(publicDir, { recursive: true });
  await app.register(fastifyStatic, { root: publicDir, prefix: "/public/" });
});
