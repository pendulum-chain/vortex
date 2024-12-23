const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// googleCredentials: { email: string, key: string },
exports.initGoogleSpreadsheet = async (sheetId, googleCredentials) => {
  // Initialize auth - see https://theoephraim.github.io/node-google-spreadsheet/#/guides/authentication
  if (!googleCredentials.email || !googleCredentials.key) {
    throw new Error('Missing some google credentials');
  }

  const serviceAccountAuth = new JWT({
    // env var values here are copied from service account credentials generated by google
    // see "Authentication" section in docs for more info
    email: googleCredentials.email,
    key: googleCredentials.key,
    scopes: SCOPES,
  });

  const doc = new GoogleSpreadsheet(sheetId, serviceAccountAuth);
  try {
    await doc.loadInfo();
  } catch (error) {
    console.error(`Error loading Google Spreadsheet ${sheetId}:`, error);
    throw error;
  }

  return doc;
};

// doc: GoogleSpreadsheet, headerValues: string[]
exports.getOrCreateSheet = async (doc, headerValues) => {
  let matchingSheet = null;

  try {
    for (let i = 0; i < Math.min(doc.sheetsByIndex.length, 10); i++) {
      const sheet = doc.sheetsByIndex[i];
      try {
        await sheet.loadHeaderRow();
        const sheetHeaders = sheet.headerValues;

        if (
          sheetHeaders.length === headerValues.length &&
          sheetHeaders.every((value, index) => value === headerValues[index])
        ) {
          matchingSheet = sheet;
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!matchingSheet) {
      console.log(' Creating a new sheet.');
      matchingSheet = await doc.addSheet({ headerValues });
    }
  } catch (error) {
    console.error('Error iterating sheets:', error.message);
    throw error;
  }

  return matchingSheet;
};

// sheet: GoogleSpreadsheetWorksheet, data: Record<string, string>
exports.appendData = async (sheet, data) => {
  await sheet.addRow(data);
};
