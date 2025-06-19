import { Router } from "express";
import { getAllPricesBundled, getPriceForProvider } from "../../controllers/price.controller";
import { PriceQuery, validateBundledPriceInput, validatePriceInput } from "../../middlewares/validators";

const router: Router = Router({ mergeParams: true });

router
  .route("/")
  .get<Record<string, never>, unknown, Record<string, never>, PriceQuery>(validatePriceInput, getPriceForProvider);

router
  .route("/all")
  .get<Record<string, never>, unknown, Record<string, never>, PriceQuery>(validateBundledPriceInput, getAllPricesBundled);

export default router;
