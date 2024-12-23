require('dotenv').config();

const { spreadsheet } = require('../../config/vars');
const { initGoogleSpreadsheet, getOrCreateSheet, appendData } = require('../services/spreadsheet.service');

exports.storeDataInGoogleSpreadsheet = async (req, res, spreadsheetId) => {
  try {
    // We expect the data to be an object that matches our schema
    const data = req.body;
    // Identify header values based on substrate vs evm offramp.
    const sheetHeaderValues = req.body.offramperAddress.includes('0x')
      ? DUMP_SHEET_HEADER_VALUES_EVM
      : DUMP_SHEET_HEADER_VALUES_ASSETHUB;

    // Try dumping transactions to spreadsheet
    const sheet = await initGoogleSpreadsheet(spreadsheetId, spreadsheet.googleCredentials).then((doc) =>
      getOrCreateSheet(doc, sheetHeaderValues),
    );

    if (sheet) {
      console.log('Appending data to sheet');
      await appendData(sheet, data);
      return res.status(200).json({ message: 'Data stored successfully' });
    }

    return res.status(500).json({ error: 'Failed to store data. Sheet unavailable.' });
  } catch (error) {
    console.error('Error in storeData:', error);
    return res.status(500).json({ error: 'Failed to store data', details: error.message });
  }
};
