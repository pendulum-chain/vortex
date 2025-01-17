import { Request, Response } from 'express';
import { config } from '../../config/vars';
import { storeDataInGoogleSpreadsheet } from './googleSpreadSheet.controller';

const { spreadsheet } = config;

const enum RatingSheetHeaders {
  Timestamp = 'timestamp',
  Rating = 'rating',
  WalletAddress = 'walletAddress',
}

const RATING_SHEET_HEADER_VALUES = [
  RatingSheetHeaders.Timestamp,
  RatingSheetHeaders.Rating,
  RatingSheetHeaders.WalletAddress,
];

export { RATING_SHEET_HEADER_VALUES };

export const storeRating = async (req: Request, res: Response): Promise<void> => {
  if (!spreadsheet.ratingSheetId) {
    throw new Error('Rating sheet ID is not configured');
  }
  await storeDataInGoogleSpreadsheet(req, res, spreadsheet.ratingSheetId, RATING_SHEET_HEADER_VALUES);
};
