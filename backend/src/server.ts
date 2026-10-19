import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { closePool, pool } from "./lib/db.js";
import { startChatListener, stopChatListener } from "./lib/chat-bus.js";
import { emailProvider } from "./services/email/index.js";
import { loadFrontend } from "./lib/frontend.js";

const frontend = await loadFrontend();
const app = createApp({ frontend });

// Containers route traffic in on an external interface, so production binds
// every IPv4 interface; development keeps Node's default.
const host = env.HOST ?? (env.isProduction ? "0.0.0.0" : undefined);

const server = app.listen(env.PORT, host as string, () => {
  // eslint-disable-next-line no-console
  console.log(
    [
      ``,
      `  Vielinea API`,
      `  ------------`,
      `  Listening   http://localhost:${env.PORT}`,
      `  API base    http://localhost:${env.PORT}/api`,
      `  Environment ${env.NODE_ENV}`,
      `  CORS origin ${env.allowedOrigins.join(", ")}`,
      `  Storefront  ${frontend ? `served from ${env.FRONTEND_OUTPUT_DIR}` : "not served (API only)"}`,
      ``,
    ].join("\n"),
  );

  // Surface a bad database configuration at boot rather than on first request.
  pool
    .query("SELECT 1")
    .then(() => console.log("  Database    connected"))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  Database    NOT CONNECTED — ${message}`);
    });

  // State of the order-notification mailer, at boot.
  //
  // .env is read once at startup, so a key added while the server was already
  // running has no effect until it restarts. Printing the resolved state here
  // makes that stale-environment case obvious instead of silent. No secret is
  // printed — only whether a key resolved, and the public from/to addresses.
  const mailer = emailProvider();
  console.log(
    mailer.isEnabled
      ? `  Email       ${mailer.name} — new orders notify ${env.orderNotificationEmail} (from ${env.EMAIL_FROM})`
      : `  Email       DISABLED — order notifications are skipped (set EMAIL_API_KEY in backend/.env, then restart)`,
  );

  // Attaches LISTEN vielinea_chat for real-time chat delivery. Non-fatal: the
  // write path publishes inline too, so chat works while this retries.
  void startChatListener();
});

async function shutdown(signal: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`\n${signal} received — shutting down.`);
  server.close(() => {
    void stopChatListener()
      .catch(() => undefined)
      .then(() => closePool())
      .finally(() => process.exit(0));
  });
  // Don't hang forever on lingering keep-alive sockets.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  // eslint-disable-next-line no-console
  console.error("[fatal] unhandled rejection:", reason);
});
