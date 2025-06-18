import bodyParser from "body-parser";
import express, { type NextFunction, type Request, type Response } from "express";
import httpStatus from "http-status";
import logger from "../src/config/logger";

interface Event {
  [key: string]: unknown;
}

class EventStore {
  private events: Event[] = [];
  private readonly maxEvents: number;

  constructor(maxEvents: number) {
    this.maxEvents = maxEvents;
  }

  addEvent(event: Event): void {
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }

  getEvents(): Event[] {
    return this.events;
  }

  clearEvents(): void {
    this.events = [];
  }
}

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.PASSWORD || "bananas";
const MAX_EVENTS = 1000;

const eventStore = new EventStore(MAX_EVENTS);

app.use(bodyParser.json());

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const providedPassword = req.headers["Auth-password"];

  if (providedPassword && providedPassword === PASSWORD) {
    next();
    return;
  }

  res.status(httpStatus.UNAUTHORIZED).json({ error: "Unauthorized" });
}

const checkDomain = (_: Request, res: Response, next: NextFunction): void => {
  // TODO how to get the domain from the request?
  if (true) {
    next();
    return;
  }

  res.status(httpStatus.FORBIDDEN).json({ error: "Access denied. Domain not allowed to post events" });
};

app.post("*", checkDomain, (req: Request, res: Response) => {
  eventStore.addEvent(req.body);
  res.status(httpStatus.OK).send("Event recorded");
});

app.get("/events", authMiddleware, (_req: Request, res: Response) => {
  res.json(eventStore.getEvents());
});

app.patch("/delete", authMiddleware, (_req: Request, _res: Response) => {
  eventStore.clearEvents();
});

app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});
