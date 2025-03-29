import { Request, Response } from 'express';
import { config } from '../../config/vars';
import { StorageEndpoints } from 'shared/src/endpoints/storage.endpoints';
import { storeDataInGoogleSpreadsheet } from './googleSpreadSheet.controller';

export type FlowHeaders = string[];

const { spreadsheet } = config;

export const DUMP_SHEET_COMMON_HEADERS = [
  'timestamp',
  'pendulumEphemeralPublicKey',
  'nablaApprovalTx',
  'nablaSwapTx',
  'inputAmount',
  'inputTokenType',
  'outputAmount',
  'outputTokenType',
];

export const DUMP_SHEET_HEADER_VALUES_ASSETHUB_TO_STELLAR = [
  ...DUMP_SHEET_COMMON_HEADERS,
  'offramperAddress',
  'stellarEphemeralPublicKey',
  'spacewalkRedeemTx',
  'stellarOfframpTx',
  'stellarCleanupTx',
];

export const DUMP_SHEET_HEADER_VALUES_EVM_TO_STELLAR = [
  ...DUMP_SHEET_COMMON_HEADERS,
  'offramperAddress',
  'squidRouterReceiverId',
  'squidRouterReceiverHash',
];

export const DUMP_SHEET_HEADER_VALUES_ASSETHUB_TO_BRLA = [
  ...DUMP_SHEET_COMMON_HEADERS,
  'offramperAddress',
  'pendulumToMoonbeamXcmTx',
];

export const DUMP_SHEET_HEADER_VALUES_EVM_TO_BRLA = [
  ...DUMP_SHEET_COMMON_HEADERS,
  'offramperAddress',
  'squidRouterReceiverId',
  'squidRouterReceiverHash',
  'pendulumToMoonbeamXcmTx',
];

export const DUMP_SHEET_HEADER_VALUES_BRLA_TO_EVM = [
  ...DUMP_SHEET_COMMON_HEADERS,
  'moonbeamToPendulumXcmTx',
  'pendulumToMoonbeamXcmTx',
  'squidRouterApproveTx',
  'squidRouterSwapTx',
];

export const DUMP_SHEET_HEADER_VALUES_BRLA_TO_ASSETHUB = [
  ...DUMP_SHEET_COMMON_HEADERS,
  'moonbeamToPendulumXcmTx',
  'pendulumToAssetHubXcmTx',
];

export const FLOW_HEADERS: Record<StorageEndpoints.FlowType, FlowHeaders> = {
  'evm-to-stellar': DUMP_SHEET_HEADER_VALUES_EVM_TO_STELLAR,
  'assethub-to-stellar': DUMP_SHEET_HEADER_VALUES_ASSETHUB_TO_STELLAR,
  'evm-to-brla': DUMP_SHEET_HEADER_VALUES_EVM_TO_BRLA,
  'assethub-to-brla': DUMP_SHEET_HEADER_VALUES_ASSETHUB_TO_BRLA,
  'brla-to-evm': DUMP_SHEET_HEADER_VALUES_BRLA_TO_EVM,
  'brla-to-assethub': DUMP_SHEET_HEADER_VALUES_BRLA_TO_ASSETHUB,
};
export const storeData = async (
  req: Request<{}, {}, StorageEndpoints.StoreDataRequest>,
  res: Response<StorageEndpoints.StoreDataResponse | StorageEndpoints.StoreDataErrorResponse>,
): Promise<void> => {
  if (!spreadsheet.storageSheetId) {
    throw new Error('Storage sheet ID is not defined');
  }

  const sheetHeaderValues = FLOW_HEADERS[req.body.flowType];

  await storeDataInGoogleSpreadsheet(req, res, spreadsheet.storageSheetId, sheetHeaderValues);
};
