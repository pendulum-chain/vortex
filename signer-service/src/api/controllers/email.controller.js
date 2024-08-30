const { spreadsheet } = require('../../config/vars');
const { storeDataInGoogleSpreadsheet } = require('./googleSpreadsheet.controller');

// These are the headers for the Google Spreadsheet
const EMAIL_SHEET_HEADER_VALUES = [
  'timestamp',
  'email',
  'transactionId'
];

exports.EMAIL_SHEET_HEADER_VALUES = EMAIL_SHEET_HEADER_VALUES;

exports.storeEmail = async (req, res) => storeDataInGoogleSpreadsheet(req, res, spreadsheet.emailSheetId, EMAIL_SHEET_HEADER_VALUES)
