import { FlowType, StoreDataErrorResponse, StoreDataResponse } from "@vortexfi/shared";
import { Request, Response } from "express";

import { config } from "../../config/vars";
import { storeDataInGoogleSpreadsheet } from "./googleSpreadSheet.controller";

export type FlowHeaders = string[];

const { spreadsheet } = config;

export const DUMP_SHEET_COMMON_HEADERS = [
  "timestamp",
  "pendulumEphemeralPublicKey",
  "nablaApprovalTx",
  "nablaSwapTx",
  "inputAmount",
  "inputTokenType",
  "outputAmount",
  "outputTokenType"
];

export const DUMP_SHEET_HEADER_VALUES_ASSETHUB_TO_STELLAR = [
  ...DUMP_SHEET_COMMON_HEADERS,
  "offramperAddress",
  "stellarEphemeralPublicKey",
  "spacewalkRedeemTx",
  "stellarOfframpTx",
  "stellarCleanupTx"
];

export const DUMP_SHEET_HEADER_VALUES_EVM_TO_STELLAR = [
  ...DUMP_SHEET_COMMON_HEADERS,
  "offramperAddress",
  "squidRouterReceiverId",
  "squidRouterReceiverHash"
];

export const DUMP_SHEET_HEADER_VALUES_ASSETHUB_TO_BRLA = [
  ...DUMP_SHEET_COMMON_HEADERS,
  "offramperAddress",
  "pendulumToMoonbeamXcmTx"
];

export const DUMP_SHEET_HEADER_VALUES_EVM_TO_BRLA = [
  ...DUMP_SHEET_COMMON_HEADERS,
  "offramperAddress",
  "squidRouterReceiverId",
  "squidRouterReceiverHash",
  "pendulumToMoonbeamXcmTx"
];

export const DUMP_SHEET_HEADER_VALUES_BRLA_TO_EVM = [
  ...DUMP_SHEET_COMMON_HEADERS,
  "moonbeamToPendulumXcmTx",
  "pendulumToMoonbeamXcmTx",
  "squidRouterApproveTx",
  "squidRouterSwapTx"
];

export const DUMP_SHEET_HEADER_VALUES_BRLA_TO_ASSETHUB = [
  ...DUMP_SHEET_COMMON_HEADERS,
  "moonbeamToPendulumXcmTx",
  "pendulumToAssetHubXcmTx"
];

export const FLOW_HEADERS: Record<FlowType, FlowHeaders> = {
  "assethub-to-brla": DUMP_SHEET_HEADER_VALUES_ASSETHUB_TO_BRLA,
  "assethub-to-stellar": DUMP_SHEET_HEADER_VALUES_ASSETHUB_TO_STELLAR,
  "brla-to-assethub": DUMP_SHEET_HEADER_VALUES_BRLA_TO_ASSETHUB,
  "brla-to-evm": DUMP_SHEET_HEADER_VALUES_BRLA_TO_EVM,
  "evm-to-brla": DUMP_SHEET_HEADER_VALUES_EVM_TO_BRLA,
  "evm-to-stellar": DUMP_SHEET_HEADER_VALUES_EVM_TO_STELLAR
};
export const storeData = async (req: Request, res: Response<StoreDataResponse | StoreDataErrorResponse>): Promise<void> => {
  if (!spreadsheet.storageSheetId) {
    throw new Error("Storage sheet ID is not defined");
  }

  const sheetHeaderValues = FLOW_HEADERS[req.body.flowType as FlowType];

  await storeDataInGoogleSpreadsheet(req, res, spreadsheet.storageSheetId, sheetHeaderValues);
};
