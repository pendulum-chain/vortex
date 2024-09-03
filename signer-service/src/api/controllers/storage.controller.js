const { spreadsheet } = require('../../config/vars');
const { storeDataInGoogleSpreadsheet } = require('./googleSpreadsheet.controller');

// These are the headers for the Google Spreadsheet
const DUMP_SHEET_HEADER_VALUES = [
  'timestamp',
  'polygonAddress',
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

exports.DUMP_SHEET_HEADER_VALUES = DUMP_SHEET_HEADER_VALUES;

exports.storeData = async (req, res) => storeDataInGoogleSpreadsheet(req, res, spreadsheet.storageSheetId, DUMP_SHEET_HEADER_VALUES)

