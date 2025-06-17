import { Router } from "express";
import * as ratingController from "../../controllers/rating.controller";
import { validateRatingInput } from "../../middlewares/validators";

const router: Router = Router({ mergeParams: true });

router.route("/create").post(validateRatingInput, ratingController.storeRating);

export default router;
