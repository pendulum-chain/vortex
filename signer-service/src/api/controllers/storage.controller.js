const { spreadsheet } = require('../../config/vars');
const { storeDataInGoogleSpreadsheet } = require('./googleSpreadsheet.controller');

// These are the headers for the Google Spreadsheet
const SHEET_HEADER_VALUES = [
  'timestamp',
  'polygonAddress',
  'stellarEphemeralPublicKey',
  'pendulumEphemeralPublicKey',
  'nablaApprovalTx',
  'nablaSwapTx',
  'spacewalkRedeemTx',
  'stellarOfframpTx',
  'stellarCleanupTx',
];

exports.SHEET_HEADER_VALUES = SHEET_HEADER_VALUES;

exports.storeData = async (req, res) => storeDataInGoogleSpreadsheet(req, res, spreadsheet.storageSheetId, SHEET_HEADER_VALUES)

