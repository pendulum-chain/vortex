import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPaxgSellRequest, validatePaxgQuote, normalizeQuote, classifyRamp, getBrazilBuyReadiness, kycOutcome, pollBrazilKyc, getPaxgAvailability, getRampWithUnsignedTxs, hasVortexSession, requestVortexOtp, setVortexSession, getFreshAccessToken, getVortexSession, clearVortexSession, submitWalletTransactions, verifyVortexOtp } from '../src/lib/vortex.js';
import { gramsToPaxg, ethereumTransaction, sendEthereumTransaction, assertPaxgSellTransactions, PAXG_ADDRESS, SQUID_ROUTER } from '../src/lib/paxg.js';
import { encodeFunctionData, parseAbi, parseUnits } from 'viem';
import { saveActiveRamp, getActiveRamp, saveTransactionCheckpoint, clearActiveRamp, failActiveRamp, getRampHistory } from '../src/lib/pilot-store.js';

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
test('a failed operation unblocks the wallet but stays in its history with the code',()=>{
  saveActiveRamp({rampId:'r3',walletAddress:address,inputAmount:'0.02',outputAmount:'440',rampType:'SELL'});
  failActiveRamp('other'); assert.equal(getActiveRamp(address).rampId,'r3');
  failActiveRamp('r3');
  assert.equal(getActiveRamp(address),null);
  assert.deepEqual(getRampHistory(address).map(({completedAt,...item})=>item),[{rampId:'r3',walletAddress:address,inputAmount:'0.02',outputAmount:'440',rampType:'SELL',status:'failed'}]);
  memory.clear();
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
const approveData=(spender,amount)=>encodeFunctionData({abi:parseAbi(['function approve(address,uint256) returns (bool)']),functionName:'approve',args:[spender,amount]});
const sellTxs=({approve={},swap={},...tx}={})=>[
  {phase:'squidRouterApprove',network:'ethereum',signer:address,...tx,txData:{to:PAXG_ADDRESS,value:'0',data:approveData(SQUID_ROUTER,parseUnits('0.02',18)),...approve}},
  {phase:'squidRouterSwap',network:'ethereum',signer:address,...tx,txData:{to:SQUID_ROUTER,value:'1000',data:'0xabcdef',...swap}}];
const sell={walletAddress:address,inputAmount:'0.02'};
test('the wallet only signs the approve and swap of the quoted sell',()=>{
  assert.doesNotThrow(()=>assertPaxgSellTransactions(sellTxs(),sell));
  assert.doesNotThrow(()=>assertPaxgSellTransactions(sellTxs({approve:{data:approveData(SQUID_ROUTER,1n)}}),sell));
  const [approve,swap]=sellTxs();
  const tampered=[
    sellTxs({approve:{to:SQUID_ROUTER}}),
    sellTxs({approve:{data:approveData(address,parseUnits('0.02',18))}}),
    sellTxs({approve:{data:approveData(SQUID_ROUTER,parseUnits('0.02',18)+1n)}}),
    sellTxs({approve:{data:approveData(SQUID_ROUTER,1n)+'00'}}),
    sellTxs({approve:{value:'1'}}),
    sellTxs({swap:{to:PAXG_ADDRESS}}),
    sellTxs({signer:'0x0000000000000000000000000000000000000002'}),
    sellTxs({network:'polygon'}),
    [approve],[swap,approve],[approve,swap,swap],
    [approve,{...swap,phase:'squidRouterPermitExecute',txData:{domain:{chainId:1}}}],
  ];
  for(const txs of tampered) assert.throws(()=>assertPaxgSellTransactions(txs,sell),/não correspondem/);
  assert.throws(()=>assertPaxgSellTransactions(sellTxs(),{walletAddress:address}),/não correspondem/);
});
test('a tampered sell never reaches the wallet or the SDK',async()=>{
  const calls=[];
  const client={submitUserTransactions:async()=>calls.push('sdk')};
  const provider={request:async({method})=>calls.push(method)};
  await assert.rejects(submitWalletTransactions(client,{id:'r',createdAt:new Date().toISOString()},sellTxs({swap:{to:address}}),address,provider,'0.02'),/não correspondem/);
  assert.deepEqual(calls,[]);
});
test('a sell past its start window broadcasts nothing and stops blocking the wallet',async()=>{
  const sent=[];
  const provider={request:async({method})=>{sent.push(method);return {'eth_getBalance':'0x0','eth_gasPrice':'0x1','eth_estimateGas':'0x5208'}[method];}};
  const client={submitUserTransactions:async(id,txs,{sendTransaction})=>{for(const tx of txs) await sendTransaction(tx.txData,{unsignedTransaction:tx});}};
  const ramp=(minutesAgo)=>({id:'r5',createdAt:new Date(Date.now()-minutesAgo*60_000).toISOString()});
  saveActiveRamp({rampId:'r5',walletAddress:address,inputAmount:'0.02',rampType:'SELL',stage:'signing'});
  await assert.rejects(submitWalletTransactions(client,ramp(1),sellTxs(),address,provider,'0.02'),/ETH/);
  assert.equal(getActiveRamp(address).rampId,'r5');
  await assert.rejects(submitWalletTransactions(client,ramp(12),sellTxs(),address,provider,'0.02'),/prazo/);
  assert.ok(!sent.includes('eth_sendTransaction'));
  assert.equal(getActiveRamp(address),null);
  memory.clear();
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
test('the e-mail code is requested in Brazilian Portuguese',async()=>{
  const old=globalThis.fetch;let body;
  try {
    globalThis.fetch=async(url,init)=>{assert.match(url,/\/v1\/auth\/request-otp$/);body=JSON.parse(init.body);return new Response(JSON.stringify({success:true}));};
    await requestVortexOtp(' Ana@Example.com ');
    assert.deepEqual(body,{email:'ana@example.com',locale:'pt-BR'});
  } finally {globalThis.fetch=old;}
});
test('only a rejected refresh token ends the Vortex session',async()=>{
  const old=globalThis.fetch;let status;
  const jwt=exp=>'e30.'+Buffer.from(JSON.stringify({exp})).toString('base64url')+'.x';
  try {
    setVortexSession({access_token:jwt(1),refresh_token:'fake-test-only'});
    globalThis.fetch=async()=>new Response(JSON.stringify({error:'unavailable'}),{status});
    status=503; await assert.rejects(getFreshAccessToken());
    assert.equal(getVortexSession()?.refresh_token,'fake-test-only');
    status=401; await assert.rejects(getFreshAccessToken());
    assert.equal(getVortexSession(),null);
  } finally {clearVortexSession();globalThis.fetch=old;}
});
test('a verified Vortex session is reused only for its own e-mail, across refreshes',async()=>{
  const old=globalThis.fetch;
  const jwt=exp=>'e30.'+Buffer.from(JSON.stringify({exp})).toString('base64url')+'.x';
  try {
    globalThis.fetch=async(url)=>new Response(JSON.stringify(/verify-otp$/.test(url)?{access_token:jwt(1),refresh_token:'fake-test-only'}:{access_token:jwt(Math.floor(Date.now()/1000)+3600),refresh_token:'rotated-test-only'}));
    assert.equal(hasVortexSession('ana@example.com'),false);
    await verifyVortexOtp(' Ana@Example.com ','123456');
    assert.equal(hasVortexSession('ana@example.com'),true);
    assert.equal(hasVortexSession('bia@example.com'),false);
    await getFreshAccessToken();
    assert.equal(getVortexSession().refresh_token,'rotated-test-only');
    assert.equal(hasVortexSession(' ANA@example.com'),true);
  } finally {clearVortexSession();globalThis.fetch=old;}
});
test('KYC polling rides out blips and reconciliation, and stops on every final state',async()=>{
  const old=globalThis.fetch;
  const jwt=exp=>'e30.'+Buffer.from(JSON.stringify({exp})).toString('base64url')+'.x';
  const script=(replies)=>{let calls=0;globalThis.fetch=async()=>{const reply=replies[Math.min(calls++,replies.length-1)];if(reply instanceof Error) throw reply;return new Response(JSON.stringify(reply.body),{status:reply.status});};return ()=>calls;};
  const ok=(body)=>({status:200,body});
  try {
    setVortexSession({access_token:jwt(Math.floor(Date.now()/1000)+3600),refresh_token:'fake-test-only'});
    let calls=script([new TypeError('Failed to fetch'),{status:404,body:{error:'KYC attempt not found'}},{status:503,body:{}},ok({status:'PROCESSING'}),ok({status:'COMPLETED',result:'APPROVED'})]);
    assert.equal((await pollBrazilKyc('08786985906',{intervalMs:1})).result,'APPROVED'); assert.equal(calls(),5);
    for(const final of [{status:'EXPIRED'},{status:'COMPLETED',result:'REJECTED',failureReason:'face'}]){
      calls=script([ok(final)]); assert.deepEqual(await pollBrazilKyc('08786985906',{intervalMs:1}),final); assert.equal(calls(),1);
    }
    calls=script([{status:403,body:{error:'not yours'}}]);
    await assert.rejects(pollBrazilKyc('08786985906',{intervalMs:1})); assert.equal(calls(),1);
    calls=script([{status:503,body:{}}]);
    await assert.rejects(pollBrazilKyc('08786985906',{intervalMs:1,maxConsecutiveErrors:3})); assert.equal(calls(),3);
    script([ok({status:'PROCESSING'})]);
    await assert.rejects(pollBrazilKyc('08786985906',{intervalMs:1,timeoutMs:5}),(error)=>error.code==='KYC_PENDING');
  } finally {clearVortexSession();globalThis.fetch=old;}
});
test('a finished KYC attempt tells the user what to fix in Portuguese',()=>{
  assert.deepEqual(kycOutcome({status:'COMPLETED',result:'APPROVED'}),{approved:true,message:''});
  assert.match(kycOutcome({status:'EXPIRED'}).message,/prazo/);
  assert.match(kycOutcome({status:'COMPLETED',result:'REJECTED',failureReason:'face'}).message,/selfie/);
  assert.match(kycOutcome({status:'COMPLETED',result:'REJECTED',failureReason:'tax_id'}).message,/CPF/);
  assert.match(kycOutcome({status:'COMPLETED',result:'REJECTED',failureReason:'unknown'}).message,/não foi aprovada/);
  assert.equal(kycOutcome({status:'COMPLETED',result:'REJECTED'}).approved,false);
});
test('KYC polling stops when the modal closes, even with a status answer in flight',{timeout:2000},async()=>{
  const old=globalThis.fetch;let calls=0;let release;
  const jwt=exp=>'e30.'+Buffer.from(JSON.stringify({exp})).toString('base64url')+'.x';
  const reply=(body)=>new Response(JSON.stringify(body));
  try {
    setVortexSession({access_token:jwt(Math.floor(Date.now()/1000)+3600),refresh_token:'fake-test-only'});
    globalThis.fetch=async()=>{calls++;return reply({status:'PROCESSING'});};
    const waiting=new AbortController();setTimeout(()=>waiting.abort(),20);
    await assert.rejects(pollBrazilKyc('08786985906',{intervalMs:60_000,signal:waiting.signal}),{name:'AbortError'});
    assert.equal(calls,1);
    await assert.rejects(pollBrazilKyc('08786985906',{signal:AbortSignal.abort()}),{name:'AbortError'});
    assert.equal(calls,1);
    globalThis.fetch=()=>new Promise((resolve)=>{release=()=>resolve(reply({status:'COMPLETED',result:'APPROVED'}));});
    const closing=new AbortController();
    const polling=pollBrazilKyc('08786985906',{intervalMs:1,signal:closing.signal});
    await new Promise((resolve)=>setTimeout(resolve,10));
    closing.abort();release();
    await assert.rejects(polling,{name:'AbortError'});
  } finally {clearVortexSession();globalThis.fetch=old;}
});
