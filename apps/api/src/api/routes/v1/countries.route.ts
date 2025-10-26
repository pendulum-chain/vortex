import { Router } from "express";
import { getSupportedCountriesHandler } from "../../controllers/countries.controller";

const router: Router = Router({ mergeParams: true });

router.route("/").get(getSupportedCountriesHandler);

export default router;
