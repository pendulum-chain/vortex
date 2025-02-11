import 'dotenv/config';
import { Request, Response } from 'express';
import { config } from '../../config/vars';
import { initGoogleSpreadsheet, getOrCreateSheet, appendData } from '../services/spreadsheet.service';
import { APIError } from '../errors/api-error';
import { GoogleCredentials } from '../services/spreadsheet.service';

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
  sheetHeaderValues: SheetHeaderValues,
): Promise<Response<SpreadsheetResponse | SpreadsheetErrorResponse>> {
  try {
    // Ensure credentials are fully defined
    const credentials: GoogleCredentials = {
      email: config.spreadsheet.googleCredentials.email,
      key: config.spreadsheet.googleCredentials.key,
    };

    const sheet = await initGoogleSpreadsheet(spreadsheetId, credentials).then((doc) =>
      getOrCreateSheet(doc, [...sheetHeaderValues]),
    );

    if (!sheet) {
      throw new APIError({
        message: 'Failed to store data. Sheet unavailable.',
        status: 500,
        isPublic: true,
      });
    }

    await appendData(sheet, req.body);
    return res.status(200).json({ message: 'Data stored successfully' });
  } catch (error) {
    console.error('Error in storeData:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return res.status(500).json({
      error: 'Failed to store data',
      details: errorMessage,
    });
  }
}
