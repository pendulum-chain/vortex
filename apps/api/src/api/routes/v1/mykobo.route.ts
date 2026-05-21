import { Router } from "express";
import multer from "multer";
import * as mykoboController from "../../controllers/mykobo.controller";

const router: Router = Router({ mergeParams: true });
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 }, storage: multer.memoryStorage() });
const profileUpload = upload.fields([
  { maxCount: 1, name: "front" },
  { maxCount: 1, name: "back" },
  { maxCount: 1, name: "face" },
  { maxCount: 1, name: "utility_bill" }
]);

router.route("/profiles").get(mykoboController.getProfileController);
router.route("/profiles").post(profileUpload, mykoboController.createProfileController);

export default router;
