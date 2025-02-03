const { spreadsheet } = require('../../config/vars');
const { storeDataInGoogleSpreadsheet } = require('./googleSpreadSheet.controller');

// These are the headers for the Google Spreadsheet
const RATING_SHEET_HEADER_VALUES = ['timestamp', 'rating', 'walletAddress'];

exports.RATING_SHEET_HEADER_VALUES = RATING_SHEET_HEADER_VALUES;

exports.storeRating = async (req, res) =>
  storeDataInGoogleSpreadsheet(req, res, spreadsheet.ratingSheetId, RATING_SHEET_HEADER_VALUES);
