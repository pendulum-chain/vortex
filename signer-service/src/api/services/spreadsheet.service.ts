import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export interface GoogleCredentials {
  email?: string;
  key?: string;
}

interface SpreadsheetService {
  initGoogleSpreadsheet: (sheetId: string, credentials: GoogleCredentials) => Promise<GoogleSpreadsheet>;
  getOrCreateSheet: (doc: GoogleSpreadsheet, headerValues: string[]) => Promise<GoogleSpreadsheetWorksheet>;
  appendData: (sheet: GoogleSpreadsheetWorksheet, data: Record<string, string>) => Promise<void>;
}

export const initGoogleSpreadsheet = async (
  sheetId: string,
  credentials: GoogleCredentials,
): Promise<GoogleSpreadsheet> => {
  if (!credentials.email || !credentials.key) {
    throw new Error('Missing required Google credentials');
  }

  const auth = new JWT({
    email: credentials.email,
    key: credentials.key,
    scopes: SCOPES,
  });

  const doc = new GoogleSpreadsheet(sheetId, auth);

  try {
    await doc.loadInfo();
    return doc;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to load Google Spreadsheet ${sheetId}: ${message}`);
  }
};

export const getOrCreateSheet = async (
  doc: GoogleSpreadsheet,
  headerValues: string[],
): Promise<GoogleSpreadsheetWorksheet> => {
  const MAX_SHEETS_TO_CHECK = 10;

  try {
    // Try to find matching sheet
    for (let i = 0; i < Math.min(doc.sheetsByIndex.length, MAX_SHEETS_TO_CHECK); i++) {
      const sheet = doc.sheetsByIndex[i];
      try {
        await sheet.loadHeaderRow();
        if (doHeadersMatch(sheet.headerValues, headerValues)) {
          return sheet;
        }
      } catch {
        continue;
      }
    }

    // Create new sheet if no match found
    return await doc.addSheet({ headerValues });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to get or create sheet: ${message}`);
  }
};

export const appendData = async (sheet: GoogleSpreadsheetWorksheet, data: Record<string, string>): Promise<void> => {
  await sheet.addRow(data);
};

const doHeadersMatch = (existingHeaders: string[], newHeaders: string[]): boolean => (
    existingHeaders.length === newHeaders.length &&
    existingHeaders.every((header, index) => header === newHeaders[index])
  );

export const spreadsheetService: SpreadsheetService = {
  initGoogleSpreadsheet,
  getOrCreateSheet,
  appendData,
};
