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

const corsOptions: CorsOptions = {
  origin(origin, cb) {
    // Same-origin / curl / server-to-server requests have no Origin header — allow them.
    if (!origin) return cb(null, true);

    if (allowedFromEnv.includes(origin)) return cb(null, true);

    if (!isProd && devOriginPatterns.some((re) => re.test(origin))) {
      return cb(null, true);
    }

    logger.warn({ origin }, "CORS rejected origin");
    return cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
};

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
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
