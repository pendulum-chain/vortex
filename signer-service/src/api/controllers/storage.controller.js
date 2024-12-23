const { spreadsheet } = require('../../config/vars');
const { storeDataInGoogleSpreadsheet } = require('./googleSpreadSheet.controller.js');

// These are the headers for the Google Spreadsheet for polygon offramp
const DUMP_SHEET_HEADER_VALUES_EVM = [
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
  'squidRouterReceiverId',
  'squidRouterReceiverHash',
];

const DUMP_SHEET_HEADER_VALUES_ASSETHUB = [
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
exports.DUMP_SHEET_HEADER_VALUES_ASSETHUB = DUMP_SHEET_HEADER_VALUES_ASSETHUB;
exports.DUMP_SHEET_HEADER_VALUES_EVM = DUMP_SHEET_HEADER_VALUES_EVM;

exports.storeData = async (req, res) => {
  const sheetHeaderValues = req.body.offramperAddress.includes('0x')
    ? DUMP_SHEET_HEADER_VALUES_EVM
    : DUMP_SHEET_HEADER_VALUES_ASSETHUB;
  console.log(sheetHeaderValues);

  storeDataInGoogleSpreadsheet(req, res, spreadsheet.storageSheetId, sheetHeaderValues);
};
