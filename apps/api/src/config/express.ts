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
import aveniaWebhookRoutes from "../api/routes/v1/avenia-webhook.route";
import brlaKycImportRoutes from "../api/routes/v1/brla-kyc-import.route";

import { corsOptions } from "./corsConfig";
import { config } from "./vars";

const { logs, rateLimitMaxRequests, rateLimitNumberOfProxies, rateLimitWindowMinutes } = config;
const REQUEST_BODY_LIMIT = "20mb";

/**
 * Express instance
 * @public
 */
const app = express();

// enable CORS - Cross Origin Resource Sharing
app.use(cors(corsOptions));

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

// secure apps by setting various HTTP headers
app.use(helmet());

// Authenticate and authorize this sensitive token-bearing request before buffering JSON.
app.use(["/v1/brl/kyc/import-token", "/v1/brla/kyc/import-token"], brlaKycImportRoutes);

// Mounted ahead of the JSON parser: Avenia signs the raw request body, and a payload
// that has been parsed and re-serialised does not reproduce those bytes exactly.
// Own, small limit: webhook events are a few KB, and this unauthenticated route should
// not buffer the 20mb the JSON API allows before the signature is even checked.
app.use("/v1/webhooks/avenia", bodyParser.raw({ limit: "100kb", type: "*/*" }), aveniaWebhookRoutes);

// parse body params and attach them to req.body
app.use(bodyParser.json({ limit: REQUEST_BODY_LIMIT }));
app.use(bodyParser.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));

// gzip compression
app.use(compress());

// lets you use HTTP verbs such as PUT or DELETE
// in places where the client doesn't support it
app.use(methodOverride());

// mount api token routes
app.use("/v1", routes);

// if error is not an instanceOf APIError, convert it.
app.use(converter);

// catch 404 and forward to error handler
app.use(notFound);

// error handler, send stacktrace only during development
app.use(handler);

export default app;
