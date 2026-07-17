import bodyParser from "body-parser";
import compress from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import methodOverride from "method-override";
import morgan from "morgan";

import { converter, handler, notFound } from "../api/middlewares/error";
import { requestContext } from "../api/observability/requestContext";
import routes from "../api/routes/v1";

import { config } from "./vars";

const { logs, rateLimitMaxRequests, rateLimitNumberOfProxies, rateLimitWindowMinutes } = config;
const REQUEST_BODY_LIMIT = "20mb";

/**
 * Express instance
 * @public
 */
const app = express();

// Extra fixed origins for non-production dashboard deployments (comma-separated env
// var, e.g. a staging or preview URL). Resolved once at boot — this stays an explicit
// whitelist per the security spec; wildcards are dropped, never honored.
const dashboardOrigins = (process.env.DASHBOARD_ORIGINS ?? "")
  .split(",")
  .map(origin => origin.trim())
  .filter(origin => origin.length > 0 && !origin.includes("*"));

// enable CORS - Cross Origin Resource Sharing
app.use(
  cors({
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Request-ID", "X-Correlation-ID"],
    credentials: true,
    exposedHeaders: ["X-Request-ID"],
    maxAge: 86400, // Cache preflight requests for 24 hours
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE", // Explicitly list allowed headers
    origin: [
      "https://app.vortexfinance.co",
      "https://dashboard.vortexfinance.co",
      "https://metrics.vortexfinance.co",
      ...dashboardOrigins,
      config.env !== "production" ? "https://staging--vortexfi.netlify.app" : null,
      config.env === "development" ? "http://localhost:5173" : null,
      config.env === "development" ? "http://127.0.0.1:5173" : null,
      // Dashboard dev server (deployed origins come from DASHBOARD_ORIGINS)
      config.env === "development" ? "http://localhost:5174" : null,
      config.env === "development" ? "http://127.0.0.1:5174" : null,
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

// attach request IDs before request logging and route handling
app.use(requestContext);

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

// mount api token routes
app.use("/v1", routes);

// if error is not an instanceOf APIError, convert it.
app.use(converter);

// catch 404 and forward to error handler
app.use(notFound);

// error handler, send stacktrace only during development
app.use(handler);

export default app;
