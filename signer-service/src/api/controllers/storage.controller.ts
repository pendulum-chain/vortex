import { Request, Response } from 'express';
import { config } from '../../config/vars';
import { storeDataInGoogleSpreadsheet } from './googleSpreadSheet.controller';

enum OfframpHandlerType {
  EVM_TO_STELLAR = 'evm-to-stellar',
  ASSETHUB_TO_STELLAR = 'assethub-to-stellar',
  EVM_TO_BRLA = 'evm-to-brla',
  ASSETHUB_TO_BRLA = 'assethub-to-brla',
}

enum OnrampHandlerType {
  BRLA_TO_EVM = 'brla-to-evm',
  BRLA_TO_ASSETHUB = 'brla-to-assethub',
}

export type FlowType = OfframpHandlerType | OnrampHandlerType;
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
];

export const DUMP_SHEET_HEADER_VALUES_BRLA_TO_ASSETHUB = [
  ...DUMP_SHEET_COMMON_HEADERS,
  'moonbeamToPendulumXcmTx',
  'pendulumToAssetHubXcmTx',
];

export const FLOW_HEADERS: Record<FlowType, FlowHeaders> = {
  'evm-to-stellar': DUMP_SHEET_HEADER_VALUES_EVM_TO_STELLAR,
  'assethub-to-stellar': DUMP_SHEET_HEADER_VALUES_ASSETHUB_TO_STELLAR,
  'evm-to-brla': DUMP_SHEET_HEADER_VALUES_EVM_TO_BRLA,
  'assethub-to-brla': DUMP_SHEET_HEADER_VALUES_ASSETHUB_TO_BRLA,
  'brla-to-evm': DUMP_SHEET_HEADER_VALUES_BRLA_TO_EVM,
  'brla-to-assethub': DUMP_SHEET_HEADER_VALUES_BRLA_TO_ASSETHUB,
};
interface StorageRequestBody {
  flowType: FlowType;
  [key: string]: any;
}

export const storeData = async (req: Request<{}, {}, StorageRequestBody>, res: Response): Promise<void> => {
  if (!spreadsheet.storageSheetId) {
    throw new Error('Storage sheet ID is not defined');
  }

  const sheetHeaderValues = FLOW_HEADERS[req.body.flowType];

  await storeDataInGoogleSpreadsheet(req, res, spreadsheet.storageSheetId, sheetHeaderValues);
};
