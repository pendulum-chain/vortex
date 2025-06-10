import { EmailEndpoints } from '@packages/shared';
import { Request, Response } from 'express';
import { config } from '../../config';
import { storeDataInGoogleSpreadsheet } from './googleSpreadSheet.controller';

const { spreadsheet } = config;

const enum EmailSheetHeaders {
  Timestamp = 'timestamp',
  Email = 'email',
  TransactionId = 'transactionId',
}

const EMAIL_SHEET_HEADER_VALUES = [
  EmailSheetHeaders.Timestamp,
  EmailSheetHeaders.Email,
  EmailSheetHeaders.TransactionId,
];

export { EMAIL_SHEET_HEADER_VALUES };

export const storeEmail = async (
  req: Request<{}, {}, EmailEndpoints.StoreEmailRequest>,
  res: Response<EmailEndpoints.StoreEmailResponse | EmailEndpoints.StoreEmailErrorResponse>,
): Promise<void> => {
  if (!spreadsheet.emailSheetId) {
    throw new Error('Email sheet ID is not configured');
  }
  await storeDataInGoogleSpreadsheet(req, res, spreadsheet.emailSheetId, EMAIL_SHEET_HEADER_VALUES);
};
