import { Request, Response } from 'express';
import { config } from '../../config/vars';
import { storeDataInGoogleSpreadsheet } from './googleSpreadSheet.controller';

const { spreadsheet } = config;

// Define header values as a const enum for type safety and zero runtime overhead
const enum EmailSheetHeaders {
  Timestamp = 'timestamp',
  Email = 'email',
  TransactionId = 'transactionId',
}

// Type-safe array of header values
const EMAIL_SHEET_HEADER_VALUES = [
  EmailSheetHeaders.Timestamp,
  EmailSheetHeaders.Email,
  EmailSheetHeaders.TransactionId,
] as const;

export { EMAIL_SHEET_HEADER_VALUES };

export const storeEmail = async (req: Request, res: Response): Promise<void> => {
  if (!spreadsheet.emailSheetId) {
    throw new Error('Email sheet ID is not configured');
  }
  await storeDataInGoogleSpreadsheet(req, res, spreadsheet.emailSheetId, EMAIL_SHEET_HEADER_VALUES);
};
