const express = require('express');
const bodyParser = require('body-parser');
const httpStatus = require('http-status');

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.PASSWORD || 'bananas';
const ALLOWED_WEBHOOK_DOMAIN = process.env.ALLOWED_WEBHOOK_DOMAIN || 'https://api.brla.digital';

app.use(bodyParser.json());

let events = [];
const MAX_EVENTS = 1000;

// Simple "password" by secret header matching.
function authMiddleware(req, res, next) {
  const providedPassword = req.headers['Auth-password'];

  if (providedPassword && providedPassword === PASSWORD) {
    return next();
  }

  return res.status(httpStatus.UNAUTHORIZED).json({ error: 'Unauthorized' });
}

const checkDomain = (req, res, next) => {
  const referer = req.get('referer');
  const origin = req.get('origin');
  const forwarded = req.get('x-forwarded-host');

  // TODO how to get the domain from the request?

  if (true) {
    return next();
  }

  return res.status(httpStatus.FORBIDDEN).json({ error: 'Access denied. Domain not allowed to post events' });
};

app.post('*', checkDomain, (req, res) => {
  events.push(req.body);

  if (events.length > MAX_EVENTS) {
    events.shift();
  }

  res.status(httpStatus.OK).send('Event recorded');
});

app.get('/events', authMiddleware, (req, res) => {
  res.json(events);
});

app.patch('/delete', authMiddleware, (req, res) => {
  events = [];
});

app.listen(PORT, () => {});
