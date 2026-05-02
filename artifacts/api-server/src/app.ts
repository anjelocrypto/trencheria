import express, { type Express } from "express";
import cors, { type CorsOptions } from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// ===== CORS =====
// In production: only origins listed in ALLOWED_ORIGINS (comma-separated) may call us.
// In development: localhost ports + Replit preview domains are allowed by default
//   so the trencheria web artifact (proxied by Replit) can talk to the api-server.
const isProd = process.env.NODE_ENV === "production";
const allowedFromEnv = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const devOriginPatterns: RegExp[] = [
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
  // Replit preview domains (used to embed the artifact iframe)
  /^https?:\/\/[a-z0-9-]+\.(?:repl\.co|replit\.dev|replit\.app|picard\.replit\.dev|riker\.replit\.dev|kirk\.replit\.dev|janeway\.replit\.dev)$/i,
];

// Per-request CORS so we can safely allow same-origin in production even when
// `ALLOWED_ORIGINS` is unset (the api-server and the trencheria web artifact
// share the same Replit-proxied origin under path-based routing).
const corsMiddleware = cors((req, callback) => {
  const headers = req.headers ?? {};
  const originHeader = headers["origin"];
  const hostHeader = headers["host"];
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;

  const opts: CorsOptions = { credentials: true, origin: false };

  if (!origin) {
    // Same-origin GETs, curl, server-to-server: no Origin header — allow.
    opts.origin = true;
  } else if (allowedFromEnv.includes(origin)) {
    opts.origin = true;
  } else if (
    host &&
    (origin === `https://${host}` || origin === `http://${host}`)
  ) {
    // Same-origin fallback (Origin matches Host). Critical for production
    // deployments where the frontend calls /api on the same domain — works
    // even if ALLOWED_ORIGINS is misconfigured.
    opts.origin = true;
  } else if (!isProd && devOriginPatterns.some((re) => re.test(origin))) {
    opts.origin = true;
  } else {
    logger.warn({ origin }, "CORS rejected origin");
  }

  callback(null, opts);
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
