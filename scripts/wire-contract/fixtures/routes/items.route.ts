import { Router } from "express";

const router = Router({ mergeParams: true });
const handler = () => undefined;

router.route("/").get(handler).post(handler);
router.get("/:id", handler);
router.delete("/:id", handler);

export default router;
