import bodyParser from "body-parser";
import compress from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import methodOverride from "method-override";
import morgan from "morgan";

import { converter, handler, notFound } from "../api/middlewares/error";

import { config } from "./vars";

const { logs, rateLimitMaxRequests, rateLimitNumberOfProxies, rateLimitWindowMinutes } = config;
const REQUEST_BODY_LIMIT = "20mb";

/**
 * Express instance
 * @public
 */
const app = express();
app.locals.ready = false;
app.locals.routesMounted = false;
app.locals.startupStatus = "initializing";

// enable CORS - Cross Origin Resource Sharing
app.use(
  cors({
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400, // Cache preflight requests for 24 hours
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE", // Explicitly list allowed headers
    origin: [
      "https://app.vortexfinance.co",
      "https://metrics.vortexfinance.co",
      "https://monerium--vortexfi.netlify.app",
      config.env !== "production" ? "https://staging--vortexfi.netlify.app" : null,
      config.env === "development" ? "http://localhost:5173" : null,
      config.env === "development" ? "http://localhost:6006" : null
    ].filter(Boolean) as string[]
  })
);

// enable rate limiting
// Set number of expected proxies
app.set("trust proxy", Number(rateLimitNumberOfProxies));

// Define rate limiter
const limiter = rateLimit({
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  max: Number(rateLimitMaxRequests), // Limit each IP to <amount> requests per `window`
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  windowMs: Number(rateLimitWindowMinutes) * 60 * 1000
});
app.use(limiter);

// parse cookies
app.use(cookieParser());

// request logging. dev: console | production: file
app.use(morgan(logs));

// parse body params and attach them to req.body
app.use(bodyParser.json({ limit: REQUEST_BODY_LIMIT }));
app.use(bodyParser.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));

// gzip compression
app.use(compress());

// lets you use HTTP verbs such as PUT or DELETE
// in places where the client doesn't support it
app.use(methodOverride());

// secure apps by setting various HTTP headers
app.use(helmet());

// Liveness/readiness endpoints stay available while dependencies bootstrap.
app.get("/health", (_: Request, res: Response) => {
  res.json({
    ready: Boolean(app.locals.ready),
    status: app.locals.startupStatus
  });
});

app.get("/ready", (_: Request, res: Response) => {
  res.status(app.locals.ready ? 200 : 503).json({
    ready: Boolean(app.locals.ready),
    status: app.locals.startupStatus
  });
});

app.use((_: Request, res: Response, next: NextFunction) => {
  if (!app.locals.ready) {
    res.status(503).json({
      ready: false,
      status: app.locals.startupStatus
    });
    return;
  }

  next();
});

export async function mountRoutes(): Promise<void> {
  if (app.locals.routesMounted) {
    return;
  }

  const { default: routes } = await import("../api/routes/v1");

  app.use("/v1", routes);

  // if error is not an instanceOf APIError, convert it.
  app.use(converter);

  // catch 404 and forward to error handler
  app.use(notFound);

  // error handler, send stacktrace only during development
  app.use(handler);

  app.locals.routesMounted = true;
}

export function markReady(): void {
  app.locals.ready = true;
  app.locals.startupStatus = "ready";
}

export function markStartupFailed(): void {
  app.locals.ready = false;
  app.locals.startupStatus = "failed";
}

export default app;
