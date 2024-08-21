require('dotenv').config();

const { spreadsheet } = require('../../config/vars');
const { initGoogleSpreadsheet, getOrCreateSheet, appendData } = require('../services/spreadsheet.service');

// These are the headers for the Google Spreadsheet
exports.SHEET_HEADER_VALUES = [
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

exports.storeData = async (req, res, next) => {
  try {
    // We expect the data to be an object that matches our schema
    const data = req.body;

    // Try dumping transactions to spreadsheet
    const sheet = await initGoogleSpreadsheet(spreadsheet.sheetId, spreadsheet.googleCredentials).then((doc) => {
      return getOrCreateSheet(doc, this.SHEET_HEADER_VALUES);
    });

    if (sheet) {
      console.log('Appending data to sheet');
      await appendData(sheet, data);
      return res.status(200).json({ message: 'Data stored successfully' });
    }

    return res.status(500).json({ error: 'Failed to store data. Sheet unavailable.', details: error.message });
  } catch (error) {
    console.error('Error in storeData:', error);
    return res.status(500).json({ error: 'Failed to store data', details: error.message });
  }
};
