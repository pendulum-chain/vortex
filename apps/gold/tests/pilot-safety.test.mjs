import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPaxgSellRequest, validatePaxgQuote, normalizeQuote, classifyRamp, getBrazilBuyReadiness, getPaxgAvailability, getRampWithUnsignedTxs, setVortexSession, getFreshAccessToken, clearVortexSession, submitWalletTransactions } from '../src/lib/vortex.js';
import { gramsToPaxg, ethereumTransaction, sendEthereumTransaction, PAXG_ADDRESS } from '../src/lib/paxg.js';
import { saveActiveRamp, getActiveRamp, saveTransactionCheckpoint, clearActiveRamp } from '../src/lib/pilot-store.js';

const address = '0x0000000000000000000000000000000000000001';
const quote = () => ({ id:'test', rampType:'SELL', from:'ethereum', to:'pix', inputCurrency:'PAXG', outputCurrency:'BRL', network:'ethereum', inputAmount:'0.02', outputAmount:'440', expiresAt:new Date(Date.now()+60000).toISOString(), networkFeeFiat:'1', processingFeeFiat:'2', partnerFeeFiat:'0', totalFeeFiat:'3', feeCurrency:'BRL' });
const memory = new Map();
const storage = {getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
globalThis.localStorage = storage;
globalThis.window = {sessionStorage:storage};

test('sell route uses native Ethereum PAXG and PIX BRL',()=>{
  assert.deepEqual(buildPaxgSellRequest('0.02'),{rampType:'SELL',from:'ethereum',to:'pix',inputAmount:'0.02',inputCurrency:'PAXG',outputCurrency:'BRL',paymentMethod:'pix',countryCode:'BR',network:'ethereum'});
  const raw=quote(); validatePaxgQuote(raw,'SELL');
  const normalized=normalizeQuote(raw);
  assert.equal(normalized.grams,0.02*31.1034768);
  assert.equal(normalized.rawQuote,raw);
  assert.equal(normalized.rawQuote.expiresAt,raw.expiresAt);
});
test('wrong asset, network, expired quote, absent or foreign fees fail closed',()=>{
  for(const override of [{outputCurrency:'USDC'},{network:'polygon'},{from:'base'},{expiresAt:'2020-01-01'},{outputAmount:'NaN'},{totalFeeFiat:undefined},{feeCurrency:'USD'}]) assert.throws(()=>validatePaxgQuote({...quote(),...override},'SELL'));
});
test('grams conversion floors precisely, without floating point oversell',()=>{
  assert.equal(gramsToPaxg('31.1034768'),'1');
  assert.equal(gramsToPaxg('0,31103476'),'0.009999999742794027');
});
test('failure overrides conflicting completion',()=>{
  assert.equal(classifyRamp({status:'failed',currentPhase:'complete'}),'failure');
});
test('Brazil readiness reads the signed-in user\'s own Avenia account with the OTP session',async()=>{
  const old=globalThis.fetch;const seen=[];let reply;
  const jwt=exp=>'e30.'+Buffer.from(JSON.stringify({exp})).toString('base64url')+'.x';
  try {
    setVortexSession({access_token:jwt(Math.floor(Date.now()/1000)+3600),refresh_token:'fake-test-only'});
    globalThis.fetch=async(url,init)=>{seen.push({url,init});return new Response(JSON.stringify(reply.body),{status:reply.status});};
    reply={status:200,body:{identityStatus:'CONFIRMED',kycLevel:1,subAccountId:'s1',evmAddress:address}};
    assert.deepEqual(await getBrazilBuyReadiness(),{kycStatus:'approved',canBuy:true,canSell:true});
    assert.match(seen[0].url,/\/v1\/brl\/getUser$/);
    assert.match(seen[0].init.headers.Authorization,/^Bearer /);
    reply={status:200,body:{identityStatus:'PENDING',subAccountId:'s1'}};
    assert.equal((await getBrazilBuyReadiness()).canBuy,false);
    reply={status:400,body:{error:'No completed provider profile found for this API key user.'}};
    assert.deepEqual(await getBrazilBuyReadiness(),{kycStatus:'not_started',canBuy:false,canSell:false});
    reply={status:500,body:{error:'unavailable'}};
    await assert.rejects(getBrazilBuyReadiness());
  } finally {clearVortexSession();globalThis.fetch=old;}
});
test('token discovery requires canonical address and direction',async()=>{
  const old=globalThis.fetch;
  try {
    globalThis.fetch=async(url)=>{assert.match(url,/network=ethereum/);return new Response(JSON.stringify({cryptocurrencies:[{assetSymbol:'PAXG',assetNetwork:'ethereum',assetContractAddress:PAXG_ADDRESS,assetDecimals:18,rampTypes:['BUY']}]}));};
    assert.deepEqual(await getPaxgAvailability(),{buy:true,sell:false});
    globalThis.fetch=async()=>new Response(JSON.stringify({cryptocurrencies:[{assetSymbol:'PAXG',assetNetwork:'ethereum',assetContractAddress:address,assetDecimals:18,rampTypes:['BUY','SELL']}]}));
    assert.deepEqual(await getPaxgAvailability(),{buy:false,sell:false});
  } finally {globalThis.fetch=old;}
});
test('transaction checkpoint survives stage changes and is wallet scoped',()=>{
  saveActiveRamp({rampId:'r1',walletAddress:address,rampType:'SELL'});
  saveTransactionCheckpoint('r1','approve','0xabc');
  saveActiveRamp({rampId:'r1',walletAddress:address,rampType:'SELL',stage:'ready'});
  assert.equal(getActiveRamp(address).transactions.approve,'0xabc');
  assert.equal(getActiveRamp('0xother'),null);
  assert.throws(()=>saveTransactionCheckpoint('r2','approve','0xabc'));
  clearActiveRamp('r2'); assert.ok(getActiveRamp(address)); clearActiveRamp('r1');
});
test('Ethereum RPC transaction whitelist rejects other chains',()=>{
  assert.deepEqual(ethereumTransaction({to:PAXG_ADDRESS,value:'10',gas:21000,chainId:1,unexpected:'omit'},address),{from:address,to:PAXG_ADDRESS,data:'0x',value:'0xa',gas:'0x5208'});
  assert.throws(()=>ethereumTransaction({to:PAXG_ADDRESS,chainId:137},address));
});
test('insufficient ETH is blocked before transaction broadcast',async()=>{
  const calls=[];
  const provider={request:async({method})=>{calls.push(method);return {'eth_getBalance':'0x0','eth_gasPrice':'0x1','eth_estimateGas':'0x5208'}[method];}};
  await assert.rejects(sendEthereumTransaction(provider,address,{to:PAXG_ADDRESS}),/ETH/);
  assert.ok(!calls.includes('eth_sendTransaction'));
});
test('typed signatures cannot switch away from Ethereum',async()=>{
  const client={submitUserTransactions:async(id,tx,callbacks)=>callbacks.signTypedData({domain:{chainId:137}})};
  await assert.rejects(submitWalletTransactions(client,'r', [{}],address,{request:async()=>null}),/Ethereum/);
});
test('concurrent expired sessions rotate once and retain refreshed session',async()=>{
  const old=globalThis.fetch;let calls=0;
  const jwt=exp=>'e30.'+Buffer.from(JSON.stringify({exp})).toString('base64url')+'.x';
  const refreshed=jwt(Math.floor(Date.now()/1000)+3600);
  try {
    setVortexSession({access_token:jwt(1),refresh_token:'fake-test-only'});
    globalThis.fetch=async(url)=>{assert.match(url,/auth\/refresh$/);calls++;return new Response(JSON.stringify({access_token:refreshed,refresh_token:'rotated-test-only'}));};
    assert.deepEqual(await Promise.all([getFreshAccessToken(),getFreshAccessToken()]),[refreshed,refreshed]);
    assert.equal(calls,1);
  } finally {clearVortexSession();globalThis.fetch=old;}
});
test('resuming a sell asks the API for the ramp\'s unsigned wallet transactions',async()=>{
  const old=globalThis.fetch;const seen=[];
  const jwt=exp=>'e30.'+Buffer.from(JSON.stringify({exp})).toString('base64url')+'.x';
  try {
    setVortexSession({access_token:jwt(Math.floor(Date.now()/1000)+3600),refresh_token:'fake-test-only'});
    globalThis.fetch=async(url,init)=>{seen.push({url,init});return new Response(JSON.stringify({id:'r1',currentPhase:'initial',unsignedTxs:[{phase:'squidRouterApprove',signer:address}]}));};
    assert.equal((await getRampWithUnsignedTxs('r1')).unsignedTxs.length,1);
    assert.match(seen[0].url,/\/v1\/ramp\/r1\?showUnsignedTxs=true$/);
    assert.match(seen[0].init.headers.Authorization,/^Bearer /);
  } finally {clearVortexSession();globalThis.fetch=old;}
});
