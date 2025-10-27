import { Router } from "express";
import { getSupportedFiatCurrenciesHandler } from "../../controllers/fiat-currencies.controller";

const router: Router = Router({ mergeParams: true });

router.route("/").get(getSupportedFiatCurrenciesHandler);

export default router;
