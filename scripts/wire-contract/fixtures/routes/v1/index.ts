import { Router } from "express";
import itemRoutes from "../items.route";

const router = Router();

router.get("/status", (_request, response) => response.send("ok"));
router.use(["/items", "/things"], itemRoutes);

export default router;
