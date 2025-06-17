const express = require('express');
const bodyParser = require('body-parser');
const httpStatus = require('http-status');

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.PASSWORD || 'bananas';

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
  const _referer = req.get('referer');
  const _origin = req.get('origin');
  const _forwarded = req.get('x-forwarded-host');

  // @TODO how to get the domain from the request?
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

app.get('/events', authMiddleware, (_req, res) => {
  res.json(events);
});

app.patch('/delete', authMiddleware, (_req, _res) => {
  events = [];
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
