import { describe, it, expect, beforeAll } from 'vitest';
import { initGoogleSpreadsheet, appendData, getOrCreateSheet } from '../spreadsheet';
import { config } from '../../../config';

type TestRowData = {
  name: string;
  age: string;
};

describe('initGoogleSpreadsheet', () => {
  beforeAll(async () => {
    // Delete all sheets in the spreadsheet
    // This is to ensure that the test starts with a clean slate
    const doc = await initGoogleSpreadsheet(config.googleCredentials.sheetId, config.googleCredentials);

    let counter = 0;
    for (const sheet of doc.sheetsByIndex) {
      // Delete all sheets except the first one as this would throw an error
      if (counter === 0) {
        // Clear rows in the first sheet
        await sheet.clearRows();
        counter++;
        continue;
      }

      await sheet.delete();
    }
  });

  it('should throw error if google credentials are missing', async () => {
    const credentials = { email: '', key: '' };

    const result = initGoogleSpreadsheet('sheetId', credentials);
    await expect(result).rejects.toThrow('Missing some google credentials');
  });

  it("should create suitable sheet if it doesn't exist", async () => {
    const credentials = config.googleCredentials;
    const sheetId = config.googleCredentials.sheetId;

    const doc = await initGoogleSpreadsheet(sheetId, credentials);
    expect(doc).toBeDefined();
    const sheet = await getOrCreateSheet(doc, ['name', 'age']);
    const rows = await sheet.getRows();
    expect(rows.length).toBe(0);
  });

  it('should add rows to existing file', async () => {
    const credentials = config.googleCredentials;
    const sheetId = config.googleCredentials.sheetId;

    const doc = await initGoogleSpreadsheet(sheetId, credentials);
    expect(doc).toBeDefined();
    const sheet = await getOrCreateSheet(doc, ['name', 'age']);
    await appendData(sheet, { name: 'John', age: '25' });

    const rows = await sheet.getRows<TestRowData>();
    expect(rows.length).toBe(1);
    expect(rows[0].get('name')).toBe('John');
    expect(rows[0].get('age')).toBe('25');
  });

  it("should create a new sheet if the first row doesn't match the header values", async () => {
    const credentials = config.googleCredentials;
    const sheetId = config.googleCredentials.sheetId;

    const doc = await initGoogleSpreadsheet(sheetId, credentials);
    expect(doc).toBeDefined();
    const oldSheet = await getOrCreateSheet(doc, ['name', 'age']);
    await appendData(oldSheet, { name: 'John', age: '25' });

    const newSheet = await getOrCreateSheet(doc, ['name', 'age', 'something']);

    const oldSheetRows = await oldSheet.getRows<TestRowData>();
    expect(oldSheetRows.length).toBe(1);
    const newSheetRows = await newSheet.getRows();
    expect(newSheetRows.length).toBe(0);
  });
});
