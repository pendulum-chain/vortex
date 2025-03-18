import { Request, Response } from 'express';
import { config } from '../../config/vars';
import { storeDataInGoogleSpreadsheet } from './googleSpreadSheet.controller';

const { spreadsheet } = config;

type CommonHeaderValues = [
  'timestamp',
  'offramperAddress',
  'pendulumEphemeralPublicKey',
  'nablaApprovalTx',
  'nablaSwapTx',
  'inputAmount',
  'inputTokenType',
  'outputAmount',
  'outputTokenType',
];

type AssethubExtraHeaders = ['stellarEphemeralPublicKey', 'spacewalkRedeemTx', 'stellarOfframpTx', 'stellarCleanupTx'];

type EVMExtraHeaders = [
  'stellarEphemeralPublicKey',
  'spacewalkRedeemTx',
  'stellarOfframpTx',
  'stellarCleanupTx',
  'squidRouterReceiverId',
  'squidRouterReceiverHash',
];

type MoonbeamExtraHeaders = ['squidRouterReceiverId', 'squidRouterReceiverHash', 'pendulumToMoonbeamXcmTx'];

export const DUMP_SHEET_HEADER_VALUES_ASSETHUB_TO_STELLAR: [...CommonHeaderValues, ...AssethubExtraHeaders] = [
  'timestamp',
  'offramperAddress',
  'pendulumEphemeralPublicKey',
  'nablaApprovalTx',
  'nablaSwapTx',
  'inputAmount',
  'inputTokenType',
  'outputAmount',
  'outputTokenType',
  'stellarEphemeralPublicKey',
  'spacewalkRedeemTx',
  'stellarOfframpTx',
  'stellarCleanupTx',
] as const;

export const DUMP_SHEET_HEADER_VALUES_EVM_TO_STELLAR: [...CommonHeaderValues, ...EVMExtraHeaders] = [
  ...DUMP_SHEET_HEADER_VALUES_ASSETHUB_TO_STELLAR,
  'squidRouterReceiverId',
  'squidRouterReceiverHash',
] as const;

export const DUMP_SHEET_HEADER_VALUES_ASSETHUB_TO_BRLA: [...CommonHeaderValues, ...MoonbeamExtraHeaders] = [
  'timestamp',
  'offramperAddress',
  'pendulumEphemeralPublicKey',
  'nablaApprovalTx',
  'nablaSwapTx',
  'inputAmount',
  'inputTokenType',
  'outputAmount',
  'outputTokenType',
  'squidRouterReceiverId',
  'squidRouterReceiverHash',
  'pendulumToMoonbeamXcmTx',
] as const;

export const DUMP_SHEET_HEADER_VALUES_EVM_TO_BRLA: [...CommonHeaderValues, ...MoonbeamExtraHeaders] = [
  'timestamp',
  'offramperAddress',
  'pendulumEphemeralPublicKey',
  'nablaApprovalTx',
  'nablaSwapTx',
  'inputAmount',
  'inputTokenType',
  'outputAmount',
  'outputTokenType',
  'squidRouterReceiverId',
  'squidRouterReceiverHash',
  'pendulumToMoonbeamXcmTx',
] as const;

interface StorageRequestBody {
  offramperAddress: string;
  timestamp?: string;
  pendulumEphemeralPublicKey?: string;
  nablaApprovalTx?: string;
  nablaSwapTx?: string;
  inputAmount?: string;
  inputTokenType?: string;
  outputAmount?: string;
  outputTokenType?: string;
  squidRouterReceiverId?: string;
  squidRouterReceiverHash?: string;
  pendulumToMoonbeamXcmT?: string;
  stellarEphemeralPublicKey?: string;
  spacewalkRedeemTx?: string;
  stellarOfframpTx?: string;
  stellarCleanupTx?: string;
  squidRouterReceiverHas?: string;
}

export const storeData = async (req: Request<{}, {}, StorageRequestBody>, res: Response): Promise<void> => {
  if (!spreadsheet.storageSheetId) {
    throw new Error('Storage sheet ID is not defined');
  }

  const sheetHeaderValues = req.body.offramperAddress.includes('0x')
    ? req.body.stellarEphemeralPublicKey
      ? DUMP_SHEET_HEADER_VALUES_EVM_TO_STELLAR
      : DUMP_SHEET_HEADER_VALUES_EVM_TO_BRLA
    : req.body.stellarEphemeralPublicKey
    ? DUMP_SHEET_HEADER_VALUES_ASSETHUB_TO_STELLAR
    : DUMP_SHEET_HEADER_VALUES_ASSETHUB_TO_BRLA;

  console.log(sheetHeaderValues);

  await storeDataInGoogleSpreadsheet(req, res, spreadsheet.storageSheetId, sheetHeaderValues);
};
