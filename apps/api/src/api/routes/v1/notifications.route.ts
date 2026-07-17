import { Request, Response, Router } from "express";
import {
  getNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences
} from "../../controllers/notifications.controller";
import { requireAuth } from "../../middlewares/supabaseAuth";

const router: Router = Router({ mergeParams: true });

router.use(requireAuth);

/**
 * GET /v1/notifications?limit=&before=
 * Newest-first feed plus the unread count.
 */
router.get("/", listNotifications as unknown as (req: Request, res: Response) => void);

/**
 * GET /v1/notifications/preferences
 */
router.get("/preferences", getNotificationPreferences as unknown as (req: Request, res: Response) => void);

/**
 * PUT /v1/notifications/preferences
 */
router.put("/preferences", updateNotificationPreferences as unknown as (req: Request, res: Response) => void);

/**
 * POST /v1/notifications/read-all
 */
router.post("/read-all", markAllNotificationsRead as unknown as (req: Request, res: Response) => void);

/**
 * POST /v1/notifications/:id/read
 */
router.post("/:id/read", markNotificationRead as unknown as (req: Request<{ id: string }>, res: Response) => void);

export default router;
