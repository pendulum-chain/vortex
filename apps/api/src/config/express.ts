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
import routes from "../api/routes/v1";

import { config } from "./vars";

const { logs, rateLimitMaxRequests, rateLimitNumberOfProxies, rateLimitWindowMinutes } = config;

/**
 * Express instance
 * @public
 */
const app = express();

// enable CORS - Cross Origin Resource Sharing
app.use(
  cors({
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400, // Cache preflight requests for 24 hours
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE", // Explicitly list allowed headers
    origin: [
      "https://app.vortexfinance.co",
      "https://staging--pendulum-pay.netlify.app",
      process.env.NODE_ENV === "development" ? "http://localhost:5173" : null,
      process.env.NODE_ENV === "development" ? "http://localhost:6006" : null
    ].filter(Boolean) as string[]
  })
);

// enable rate limiting
// Set number of expected proxies
app.set("trust proxy", rateLimitNumberOfProxies);

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
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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
