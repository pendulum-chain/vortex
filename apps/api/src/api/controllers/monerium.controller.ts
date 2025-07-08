import { Networks } from "@packages/shared";
import { Request, Response } from "express";
import httpStatus from "http-status";
import { checkAddressExists } from "../services/monerium";

export const checkAddressExistsController = async (req: Request, res: Response): Promise<void> => {
  const { address, network } = req.query;

  if (!address || typeof address !== "string") {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Invalid address parameter" });
    return;
  }

  if (!network || typeof network !== "string") {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Invalid network parameter" });
    return;
  }

  try {
    const result = await checkAddressExists(address, network as Networks);
    if (result) {
      res.json(result);
    } else {
      res.status(httpStatus.NOT_FOUND).json({ error: "Address not found" });
    }
  } catch (error) {
    console.error("Error in checkAddressExistsController:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};
