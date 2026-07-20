import { Request, Response } from "express";
import httpStatus from "http-status";
import { Op } from "sequelize";
import logger from "../../config/logger";
import Notification from "../../models/notification.model";
import { getOrCreateNotificationPreferences } from "../services/notifications/notification.service";

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message, status } });
}

function requireUserId(req: Request, res: Response): string | null {
  if (!req.userId) {
    sendError(res, httpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED", "Authentication required");
    return null;
  }
  return req.userId;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function listNotifications(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const rawLimit = Number(req.query.limit ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIMIT) : DEFAULT_LIMIT;
  const before = typeof req.query.before === "string" ? new Date(req.query.before) : null;
  if (before && Number.isNaN(before.getTime())) {
    sendError(res, httpStatus.BAD_REQUEST, "INVALID_BEFORE", "before must be a valid ISO-8601 date");
    return;
  }

  try {
    const [notifications, unreadCount] = await Promise.all([
      Notification.findAll({
        limit,
        order: [["createdAt", "DESC"]],
        where: { profileId: userId, ...(before ? { createdAt: { [Op.lt]: before } } : {}) }
      }),
      Notification.count({ where: { profileId: userId, readAt: null } })
    ]);

    res.status(httpStatus.OK).json({
      notifications: notifications.map(notification => ({
        body: notification.body,
        createdAt: notification.createdAt,
        id: notification.id,
        metadata: notification.metadata,
        readAt: notification.readAt,
        title: notification.title,
        type: notification.type
      })),
      unreadCount
    });
  } catch (error) {
    logger.error("Error listing notifications:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to list notifications");
  }
}

export async function markNotificationRead(req: Request<{ id: string }>, res: Response): Promise<void> {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const notification = await Notification.findOne({ where: { id: req.params.id, profileId: userId } });
    if (!notification) {
      sendError(res, httpStatus.NOT_FOUND, "NOTIFICATION_NOT_FOUND", "Notification not found");
      return;
    }
    if (!notification.readAt) {
      await notification.update({ readAt: new Date() });
    }
    res.status(httpStatus.NO_CONTENT).send();
  } catch (error) {
    logger.error("Error marking notification read:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to mark notification read");
  }
}

export async function markAllNotificationsRead(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    await Notification.update({ readAt: new Date() }, { where: { profileId: userId, readAt: null } });
    res.status(httpStatus.NO_CONTENT).send();
  } catch (error) {
    logger.error("Error marking all notifications read:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to mark notifications read");
  }
}

export async function getNotificationPreferences(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const preferences = await getOrCreateNotificationPreferences(userId);
    res.status(httpStatus.OK).json({ emailEnabled: preferences.emailEnabled, prefs: preferences.prefs });
  } catch (error) {
    logger.error("Error reading notification preferences:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to read preferences");
  }
}

export async function updateNotificationPreferences(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { emailEnabled, prefs } = (req.body ?? {}) as { emailEnabled?: unknown; prefs?: unknown };
  if (emailEnabled !== undefined && typeof emailEnabled !== "boolean") {
    sendError(res, httpStatus.BAD_REQUEST, "INVALID_EMAIL_ENABLED", "emailEnabled must be a boolean");
    return;
  }
  if (prefs !== undefined && (typeof prefs !== "object" || prefs === null || Array.isArray(prefs))) {
    sendError(res, httpStatus.BAD_REQUEST, "INVALID_PREFS", "prefs must be an object");
    return;
  }

  try {
    const preferences = await getOrCreateNotificationPreferences(userId);
    await preferences.update({
      ...(emailEnabled !== undefined ? { emailEnabled } : {}),
      ...(prefs !== undefined ? { prefs: prefs as Record<string, unknown> } : {})
    });
    res.status(httpStatus.OK).json({ emailEnabled: preferences.emailEnabled, prefs: preferences.prefs });
  } catch (error) {
    logger.error("Error updating notification preferences:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to update preferences");
  }
}
