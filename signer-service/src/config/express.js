const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const compress = require('compression');
const methodOverride = require('method-override');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const routes = require('../api/routes/v1');
const { logs, rateLimitMaxRequests, rateLimitNumberOfProxies, rateLimitWindowMinutes } = require('./vars');
const error = require('../api/middlewares/error');
const cookieParser = require('cookie-parser');

/**
 * Express instance
 * @public
 */
const app = express();

// enable CORS - Cross Origin Resource Sharing
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'https://polygon-prototype-staging--pendulum-pay.netlify.app',
      'https://app.vortexfinance.co',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    allowedHeaders: 'Content-Type,Authorization',
  }),
);

// enable rate limiting
// Set number of expected proxies
app.set('trust proxy', true);

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
  windowMs: rateLimitWindowMinutes * 60 * 1000,
  max: rateLimitMaxRequests, // Limit each IP to <amount> requests per `window`
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
app.use(error.converter);

// catch 404 and forward to error handler
app.use(error.notFound);

// error handler, send stacktrace only during development
app.use(error.handler);

module.exports = app;
