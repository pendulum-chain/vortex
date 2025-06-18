import "dotenv/config";
import { Request, Response } from "express";
import httpStatus from "http-status";
import { config } from "../../config/vars";
import { APIError } from "../errors/api-error";
import { appendData, GoogleCredentials, getOrCreateSheet, initGoogleSpreadsheet } from "../services/spreadsheet.service";

type SheetHeaderValues = readonly string[];

interface SpreadsheetResponse {
  message: string;
}

interface SpreadsheetErrorResponse {
  error: string;
  details?: string;
}

export async function storeDataInGoogleSpreadsheet(
  req: Request,
  res: Response,
  spreadsheetId: string,
  sheetHeaderValues: SheetHeaderValues
): Promise<Response<SpreadsheetResponse | SpreadsheetErrorResponse>> {
  try {
    // Ensure credentials are fully defined
    const credentials: GoogleCredentials = {
      email: config.spreadsheet.googleCredentials.email,
      key: config.spreadsheet.googleCredentials.key
    };

    const sheet = await initGoogleSpreadsheet(spreadsheetId, credentials).then(doc =>
      getOrCreateSheet(doc, [...sheetHeaderValues])
    );

    if (!sheet) {
      throw new APIError({
        isPublic: true,
        message: "Failed to store data. Sheet unavailable.",
        status: httpStatus.INTERNAL_SERVER_ERROR
      });
    }

    await appendData(sheet, req.body);
    return res.status(httpStatus.OK).json({ message: "Data stored successfully" });
  } catch (error) {
    console.error("Error in storeData:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      details: errorMessage,
      error: "Failed to store data"
    });
  }
}
