import { describe, it, expect } from 'vitest';
import { initGoogleSpreadsheet, appendData } from '../spreadsheet';
import { config } from '../../../config';

type TestRowData = {
  name: string;
  age: string;
};

describe('initGoogleSpreadsheet', () => {
  it('should throw error if google credentials are missing', async () => {
    const credentials = { email: '', key: '' };

    const result = initGoogleSpreadsheet('sheetId', credentials);
    await expect(result).rejects.toThrow('Missing some google credentials');
  });

  it("should create file if it doesn't exist", async () => {
    const credentials = config.googleCredentials;
    const sheetId = config.googleCredentials.sheetId;

    const sheet = await initGoogleSpreadsheet(sheetId, credentials, ['name', 'age']);
    const rows = await sheet.getRows();
    expect(rows.length).toBe(0);
  });

  it('should add rows to existing file', async () => {
    const credentials = config.googleCredentials;
    const sheetId = config.googleCredentials.sheetId;

    const sheet = await initGoogleSpreadsheet(sheetId, credentials, ['name', 'age']);
    await appendData(sheet, { name: 'John', age: '25' });

    const rows = await sheet.getRows<TestRowData>();
    expect(rows.length).toBe(1);
    expect(rows[0].get('name')).toBe('John');
    expect(rows[0].get('age')).toBe('25');
  });

  it("should create a new sheet if the first row doesn't match the header values", async () => {
    const credentials = config.googleCredentials;
    const sheetId = config.googleCredentials.sheetId;

    const sheet = await initGoogleSpreadsheet(sheetId, credentials, ['name', 'age']);
    await appendData(sheet, { name: 'John', age: '25' });

    const newSheet = await initGoogleSpreadsheet(sheetId, credentials, ['name', 'age', 'city']);
    const rows = await newSheet.getRows();
    expect(rows.length).toBe(1);
  });
});
