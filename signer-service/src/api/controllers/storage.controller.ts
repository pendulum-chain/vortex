import { Request, Response } from 'express';
import { config } from '../../config/vars';
import { storeDataInGoogleSpreadsheet } from './googleSpreadSheet.controller';

const { spreadsheet } = config;

type CommonHeaderValues = [
  'timestamp',
  'offramperAddress',
  'stellarEphemeralPublicKey',
  'pendulumEphemeralPublicKey',
  'nablaApprovalTx',
  'nablaSwapTx',
  'spacewalkRedeemTx',
  'stellarOfframpTx',
  'stellarCleanupTx',
  'inputAmount',
  'inputTokenType',
  'outputAmount',
  'outputTokenType',
];

type EVMExtraHeaders = ['squidRouterReceiverId', 'squidRouterReceiverHash'];

export const DUMP_SHEET_HEADER_VALUES_ASSETHUB: CommonHeaderValues = [
  'timestamp',
  'offramperAddress',
  'stellarEphemeralPublicKey',
  'pendulumEphemeralPublicKey',
  'nablaApprovalTx',
  'nablaSwapTx',
  'spacewalkRedeemTx',
  'stellarOfframpTx',
  'stellarCleanupTx',
  'inputAmount',
  'inputTokenType',
  'outputAmount',
  'outputTokenType',
] as const;

export const DUMP_SHEET_HEADER_VALUES_EVM: [...CommonHeaderValues, ...EVMExtraHeaders] = [
  ...DUMP_SHEET_HEADER_VALUES_ASSETHUB,
  'squidRouterReceiverId',
  'squidRouterReceiverHash',
] as const;

interface StorageRequestBody {
  offramperAddress: string;
}

export const storeData = async (req: Request<{}, {}, StorageRequestBody>, res: Response): Promise<void> => {
  if (!spreadsheet.storageSheetId) {
    throw new Error('Storage sheet ID is not defined');
  }

  const sheetHeaderValues = req.body.offramperAddress.includes('0x')
    ? DUMP_SHEET_HEADER_VALUES_EVM
    : DUMP_SHEET_HEADER_VALUES_ASSETHUB;

  console.log(sheetHeaderValues);

  await storeDataInGoogleSpreadsheet(req, res, spreadsheet.storageSheetId, sheetHeaderValues);
};
