import { afterAll, vi } from "vitest";
import axios from "axios";
import { applyTestEnv } from "./test-env.js";

applyTestEnv();

// No real WhatsApp messages from tests. Tests inspect these spies.
export const waflyRequest = vi
  .spyOn(axios, "request")
  .mockResolvedValue({ data: { ApiMessage: "stubbed" } });
export const waflyGet = vi
  .spyOn(axios, "get")
  .mockResolvedValue({ data: { ApiMessage: "stubbed" } });

afterAll(async () => {
  const { sequelize } = await import("../../app/db/postgres.js");
  // Legacy controllers can leak open transactions (early return without
  // rollback), which makes close() wait forever. Don't let that hang the run.
  await Promise.race([
    sequelize.close(),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
});
