const { keccak256 } = require('viem/utils');
const { Keyring } = require('@polkadot/api');

// Returns the hash value for the address. If it's a polkadot address, it will return raw data of the address.
function getHashValueForAddress(address) {
  if (address.startsWith('0x')) {
    return address;
  } else {
    const keyring = new Keyring({ type: 'sr25519' });
    return keyring.decodeAddress(address);
  }
}

//A memo derivation.
async function deriveMemoFromAddress(address) {
  const hashValue = getHashValueForAddress(address);
  const hash = keccak256(hashValue);
  return BigInt(hash).toString().slice(0, 15);
}

module.exports = { deriveMemoFromAddress };
