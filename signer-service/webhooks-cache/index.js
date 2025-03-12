const express = require('express');
const bodyParser = require('body-parser');

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

  return res.status(401).json({ error: 'Unauthorized' });
}

const checkDomain = (req, res, next) => {
  const referer = req.get('referer');
  const origin = req.get('origin');
  const forwarded = req.get('x-forwarded-host');

  // TODO how to get the domain from the request?

  if (true) {
    return next();
  }
  console.log(origin);

  return res.status(403).json({ error: 'Access denied. Domain not allowed to post events' });
};

app.post('*', checkDomain, (req, res) => {
  events.push(req.body);

  if (events.length > MAX_EVENTS) {
    events.shift();
  }

  console.log('Event received:', req.body);
  res.status(200).send('Event recorded');
});

app.get('/events', authMiddleware, (req, res) => {
  res.json(events);
});

app.patch('/delete', authMiddleware, (req, res) => {
  events = [];
});

app.listen(PORT, () => {});
