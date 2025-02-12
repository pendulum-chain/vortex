import express from 'express';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import compress from 'compression';
import methodOverride from 'method-override';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';

import routes from '../api/routes/v1';
import { converter, handler, notFound } from '../api/middlewares/error';

import { config } from './vars';

const { logs, rateLimitMaxRequests, rateLimitNumberOfProxies, rateLimitWindowMinutes } = config;

/**
 * Express instance
 * @public
 */
const app = express();

// enable CORS - Cross Origin Resource Sharing
app.use(
  cors({
    origin: [
      'https://app.vortexfinance.co',
      'https://polygon-prototype-staging--pendulum-pay.netlify.app',
      process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : null,
    ].filter(Boolean) as string[],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'], // Explicitly list allowed headers
    maxAge: 86400, // Cache preflight requests for 24 hours
  }),
);

// enable rate limiting
// Set number of expected proxies
app.set('trust proxy', rateLimitNumberOfProxies);

app.use((req, res, next) => {
  console.log({
    'Raw Socket IP': req.socket.remoteAddress,
    'Express req.ip': req.ip,
    'X-Forwarded-For': req.headers['x-forwarded-for'],
    'X-Real-IP': req.headers['x-real-ip'],
    'Trust Proxy Setting': app.get('trust proxy'),
  });
  next();
});

// Define rate limiter
const limiter = rateLimit({
  windowMs: Number(rateLimitWindowMinutes) * 60 * 1000,
  max: Number(rateLimitMaxRequests), // Limit each IP to <amount> requests per `window`
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
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
app.use('/v1', routes);

// if error is not an instanceOf APIError, convert it.
app.use(converter);

// catch 404 and forward to error handler
app.use(notFound);

// error handler, send stacktrace only during development
app.use(handler);

export default app;
