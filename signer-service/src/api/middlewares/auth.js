const { validateSignatureAndGetMemo } = require('../services/siwe.service');

const getMemoFromCookiesMiddleware = async (req, res, next) => {
  // If the client didn't specify, we don't want to pass a derived memo even if a cookie was sent.
  if (!Boolean(req.body.memo)) {
    req.derivedMemo = null;
    return next();
  }
  try {
    const cookies = req.cookies;
    const address = req.body.address;
    // Default memo (represents no memo usage at all)
    let resultMemo = null;

    for (const authToken in cookies) {
      if (!authToken.startsWith('authToken_')) {
        continue;
      }

      //check if matches the address requested by client, otherwise ignore cookie.
      if (!authToken.includes(address)) {
        continue;
      }

      try {
        const token = cookies[authToken];
        const signature = token.signature;
        const nonce = token.nonce;

        if (!signature || !nonce) {
          continue;
        }

        const memo = await validateSignatureAndGetMemo(nonce, signature);
        console.log(memo);

        // First found first used
        if (memo) {
          resultMemo = memo;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    // Client declared usage of memo, but it could not be derived from provided signatures.
    if (Boolean(req.body.memo) && !resultMemo) {
      return res.status(401).json({
        error: 'Missing signature or nonce',
      });
    }

    req.derivedMemo = resultMemo;
    console.log('derived memo', req.derivedMemo);

    next();
  } catch (err) {
    if (err.message.includes('Could not verify signature')) {
      // Distinguish between failed signature check and other errors.
      return res.status(401).json({
        error: 'Signature validation failed.',
        details: err.message,
      });
    }
    console.error(`Error in getMemoFromCookiesMiddleware: ${err.message}`);

    return res.status(500).json({
      error: 'Error while verifying signature',
      details: err.message,
    });
  }
};

module.exports = {
  getMemoFromCookiesMiddleware,
};
