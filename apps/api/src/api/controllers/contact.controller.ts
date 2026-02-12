import type { SubmitContactErrorResponse, SubmitContactResponse } from "@vortexfi/shared";
import type { Request, Response } from "express";
import { config } from "../../config";
import { storeDataInGoogleSpreadsheet } from "./googleSpreadSheet.controller";

enum ContactSheetHeaders {
  Timestamp = "timestamp",
  FullName = "fullName",
  Email = "email",
  ProjectName = "projectName",
  Inquiry = "inquiry"
}

const CONTACT_SHEET_HEADER_VALUES = [
  ContactSheetHeaders.Timestamp,
  ContactSheetHeaders.FullName,
  ContactSheetHeaders.Email,
  ContactSheetHeaders.ProjectName,
  ContactSheetHeaders.Inquiry
];

export { CONTACT_SHEET_HEADER_VALUES };

export const submitContact = async (
  req: Request,
  res: Response<SubmitContactResponse | SubmitContactErrorResponse>
): Promise<void> => {
  if (!config.spreadsheet.contactSheetId) {
    throw new Error("Contact sheet ID is not configured");
  }
  await storeDataInGoogleSpreadsheet(req, res, config.spreadsheet.contactSheetId, CONTACT_SHEET_HEADER_VALUES);
};
