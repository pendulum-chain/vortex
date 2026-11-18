import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionData, parseAbi, parseUnits } from 'viem';
import { createActiveRampStore, createJsonStorage } from '@vortexfi/consumer-kit';
import { amountRaw, baseGoldRequest, validateBaseGoldQuote, assertBaseDelivery, createBaseGoldAdapter, BASE_PAXG, GOLD_SOURCE_PHASE } from '../src/lib/base-gold.js';
import { readGoldConfig, rampNetwork, BASE_USDC } from '../src/lib/gold-config.js';
import { readGoldBalance } from '../src/lib/gold-balances.js';
import { fundingDrafts } from '../src/lib/gold-funding.js';

const owner='0x0000000000000000000000000000000000000001', ephemeral='0x0000000000000000000000000000000000000002';
const transfer=parseAbi(['function transfer(address to, uint256 amount)']);
const request=(direction='BUY',paymentMethod='usdc')=>baseGoldRequest({direction,paymentMethod,amount:direction==='BUY'?'50':'0.01',owner});
const raw=(req=request())=>({...req,id:'quote',outputAmount:req.rampType==='BUY'?'0.01':'40',expiresAt:new Date(Date.now()+600000).toISOString(),feeCurrency:req.paymentMethod==='usdc'?'USDC':'BRL',anchorFeeFiat:req.paymentMethod==='usdc'?'0':'0.50',networkFeeFiat:'0.10',processingFeeFiat:'0.20',partnerFeeFiat:'0',totalFeeFiat:'0.30',gasless:true});
function harness({ enabled=true,usdcEnabled=true,mutateRamp,approve=true,paused=false,head=100n }={}) {
  let data={},storedKeys=0,registered=0,signatures=0,starts=0,ramp;
  const store=createActiveRampStore({activeKey:'active',historyKey:'history',storage:{get:(k,f)=>data[k]??f,set:(k,v)=>(data[k]=v,true),remove:k=>delete data[k]}});
  const reader={getBlockNumber:async()=>head,readContract:async ({functionName,blockNumber})=>{if(functionName==='balanceOf') { assert.equal(blockNumber,head-2n);return 100n*10n**18n;}return 0n;}};
  let cfg;
  const sdk={createQuote:async req=>raw(req),registerRamp:async(q)=>{
    registered++; cfg.onBeforeEphemeralsStored('order',ephemeral); await cfg.ephemeralStore.put([], 'order');
    const buy=q.rampType==='BUY',destination=buy?BASE_PAXG:BASE_USDC,source=buy?BASE_USDC:BASE_PAXG;
    ramp={id:'order',quoteId:q.id,type:q.rampType,currentPhase:'initial',createdAt:new Date().toISOString(),inputAmount:q.inputAmount,outputAmount:q.outputAmount,depositQrCode:'synthetic-not-payable',unsignedTxs:[{phase:'destinationTransfer',network:'base',signer:ephemeral,txData:{to:destination.address,data:encodeFunctionData({abi:transfer,functionName:'transfer',args:[owner,parseUnits(q.outputAmount,destination.decimals)]}),value:'0'}}]};
    const permit={phase:GOLD_SOURCE_PHASE,network:'base',signer:owner,txData:{primaryType:'Permit',domain:{name:'Synthetic',version:'1',chainId:8453,verifyingContract:source.address},types:{Permit:[{name:'owner',type:'address'},{name:'spender',type:'address'},{name:'value',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}]},message:{owner,spender:ephemeral,value:parseUnits(q.inputAmount,source.decimals).toString(),nonce:'0',deadline:String(Math.floor(Date.now()/1000)+3600)}}};
    if (!(buy&&q.paymentMethod==='pix')) ramp.unsignedTxs.push(permit); mutateRamp?.(ramp); return {rampProcess:ramp,unsignedTransactions:buy&&q.paymentMethod==='pix'?[]:[permit]};
  },submitUserTransactions:async(id,txs,handlers)=>{const payload=txs[0].txData;await handlers.signTypedData(payload,{payloadCount:1,unsignedTransaction:txs[0]});},startRamp:async()=>{starts++;return {...ramp,currentPhase:'swapping'};},getRampStatus:async()=>ramp};
  const api=async path=>path.includes('maintenance')?{is_maintenance_active:paused}:path.includes('supported-cryptocurrencies')?{cryptocurrencies:[{assetSymbol:'PAXG',assetNetwork:'base',assetDecimals:18,assetContractAddress:BASE_PAXG.address,rampTypes:['BUY','SELL']}]}:ramp;
  const adapter=createBaseGoldAdapter({enabled,usdcEnabled,store,reader,api,createClient:c=>(cfg=c,sdk),ephemeralStore:{put:async()=>{storedKeys++;}}});
  const provider={request:async({method})=>{if(method==='eth_signTypedData_v4'){signatures++;if(!approve)throw Object.assign(Error('cancelled'),{code:4001});return '0xsynthetic';}return null;}};
  return {adapter,store,provider,counts:()=>({storedKeys,registered,signatures,starts}),getRamp:()=>ramp};
}

test('build defaults retain Ethereum; Base and USDC require independent explicit gates',()=>{
  assert.equal(readGoldConfig({}).network,'ethereum');
  assert.equal(readGoldConfig({VITE_GOLD_NETWORK:'base'}).baseEnabled,false);
  assert.equal(readGoldConfig({VITE_GOLD_NETWORK:'base',VITE_GOLD_USDC_ENABLED:'true'}).usdcEnabled,false);
  assert.equal(readGoldConfig({VITE_GOLD_NETWORK:'base',VITE_GOLD_BASE_ENABLED:'true',VITE_GOLD_USDC_ENABLED:'true'}).usdcEnabled,true);
  assert.equal(rampNetwork({rampId:'old'}),'ethereum');assert.throws(()=>readGoldConfig({VITE_GOLD_NETWORK:'polygon'}));
});
test('all four requested routes pin Base, direction and settlement currency',()=>{
  for(const direction of ['BUY','SELL'])for(const method of ['pix','usdc']){
    const req=request(direction,method); assert.equal(req.network,'base');
    const q=validateBaseGoldQuote(raw(req),req);assert.equal(q.currency,method==='usdc'?'USDC':'BRL');
    assert.equal(req.from,direction==='BUY'?(method==='usdc'?'base':'pix'):'base');assert.equal(req.to,direction==='BUY'?'base':method==='usdc'?'base':'pix');
    assert.equal(q.rawQuote.inputCurrency,direction==='BUY'?(method==='usdc'?'USDC':'BRL'):'PAXG');
  }
});
test('wrong chain, currency, amount, method, expiry, gasless claim and fee math fail closed',()=>{
  const req=request();for(const patch of [{network:'ethereum'},{paymentMethod:'pix'},{outputCurrency:'XAUt'},{inputAmount:'51'},{expiresAt:'2000-01-01'},{feeCurrency:'BRL'},{totalFeeFiat:'0.31'},{anchorFeeFiat:'1'},{gasless:false},{processingFeeFiat:''},{outputAmount:'0'},{inputAmount:'50.0000001'}]) assert.throws(()=>validateBaseGoldQuote({...raw(req),...patch},req));
  assert.equal(amountRaw('0.000001',6),1n);assert.throws(()=>amountRaw('1e6',6));
});
test('disabled Base/USDC makes no calls, registration or payable instructions',async()=>{
  const a=harness({enabled:false});assert.deepEqual(await a.adapter.availability(),{buy:false,sell:false});await assert.rejects(a.adapter.quote({direction:'BUY',paymentMethod:'pix',amount:'50',owner}),{code:'ROUTE_NOT_ENABLED'});assert.equal(a.counts().registered,0);
  const b=harness({usdcEnabled:false});await assert.rejects(b.adapter.quote({direction:'BUY',paymentMethod:'usdc',amount:'10',owner}),{code:'ROUTE_NOT_ENABLED'});
});
for(const direction of ['BUY','SELL'])test(`USDC ${direction} stores recovery before one bounded Base permit and starts once`,async()=>{
  const h=harness(),q=await h.adapter.quote({direction,paymentMethod:'usdc',amount:direction==='BUY'?'50':'0.01',owner});
  const r=await h.adapter.register({quote:q,owner,provider:h.provider});assert.equal(h.store.get(owner).network,'base');assert.equal(h.store.get(owner).stage,'ready');assert.equal(h.store.get(owner).permitNonce,'0');assert.deepEqual(h.counts(),{storedKeys:1,registered:1,signatures:1,starts:0});
  await h.adapter.start(r.id,owner);assert.equal(h.counts().starts,1);
  await assert.rejects(h.adapter.register({quote:q,owner,provider:h.provider}),{code:'RAMP_IN_PROGRESS'});
});
test('wrong delivery is refused before source authorization and preserves its order reference',async()=>{
  const h=harness({mutateRamp:r=>r.unsignedTxs[0].network='ethereum'}),q=await h.adapter.quote({direction:'BUY',paymentMethod:'usdc',amount:'50',owner});
  await assert.rejects(h.adapter.register({quote:q,owner,provider:h.provider}),{code:'WRONG_DELIVERY'});assert.equal(h.counts().signatures,0);assert.equal(h.store.get(owner).rampId,'order');
});
test('a wallet cancellation resumes the same registered order and never registers twice',async()=>{
  const h=harness({approve:false}),q=await h.adapter.quote({direction:'BUY',paymentMethod:'usdc',amount:'50',owner});
  await assert.rejects(h.adapter.register({quote:q,owner,provider:h.provider}),{code:4001});assert.equal(h.store.get(owner).rampId,'order');
  await assert.rejects(h.adapter.resume('order',owner,h.provider),{code:4001});assert.equal(h.counts().registered,1);
});
test('two Base confirmations gate funding; maintenance stops registration',async()=>{
  const young=harness({head:1n});assert.equal(await young.adapter.balance(owner),0n);
  const paused=harness({paused:true}),q=await paused.adapter.quote({direction:'BUY',paymentMethod:'usdc',amount:'50',owner});await assert.rejects(paused.adapter.register({quote:q,owner,provider:paused.provider}),{code:'MAINTENANCE_UNAVAILABLE'});assert.equal(paused.counts().registered,0);
});
test('chain reads target the pinned token, not whichever network the wallet currently uses',async()=>{
  const seen=[];const value=await readGoldBalance('base',owner,{readContract:async c=>(seen.push(c.address),10n**18n)});assert.equal(value.grams,31.1034768);assert.deepEqual(seen,[BASE_PAXG.address]);
});
test('balance reads use Privy\'s app RPC, never viem\'s default public RPC',async()=>{
  const old=globalThis.fetch,urls=[];
  globalThis.fetch=async(url,init)=>{urls.push(String(url));const {id}=JSON.parse(init.body);return new Response(JSON.stringify({jsonrpc:'2.0',id,result:'0x'+(10n**18n).toString(16).padStart(64,'0')}),{headers:{'Content-Type':'application/json'}});};
  try { assert.equal((await readGoldBalance('ethereum',owner)).paxg,1); assert.equal((await readGoldBalance('base',owner)).paxg,1); } finally { globalThis.fetch=old; }
  assert.match(urls[0],/^https:\/\/mainnet\.rpc\.privy\.systems\/?\?privyAppId=/);assert.match(urls[1],/^https:\/\/base-mainnet\.rpc\.privy\.systems\/?\?privyAppId=/);
});
for(const direction of ['BUY','SELL'])test(`Pix ${direction} remains separate from USDC authorization and settlement`,async()=>{
  const h=harness(),q=await h.adapter.quote({direction,paymentMethod:'pix',amount:direction==='BUY'?'50':'0.01',owner});
  const r=await h.adapter.register({quote:q,owner,provider:h.provider,pixDestination:'synthetic@example.com'});
  assert.equal(h.store.get(owner).paymentMethod,'pix');assert.equal(h.store.get(owner).stage,direction==='BUY'?'registered':'ready');assert.equal(h.counts().signatures,direction==='BUY'?0:1);assert.ok(r.depositQrCode);
});
test('an API permit for another token, spender, chain, amount or phase never reaches the wallet',async()=>{
  for(const mutate of [p=>p.txData.domain.chainId=1,p=>p.txData.domain.verifyingContract=BASE_PAXG.address,p=>p.txData.message.spender=owner,p=>p.txData.message.value='999999999999',p=>p.phase='untrustedPhase']){
    const h=harness({mutateRamp:r=>mutate(r.unsignedTxs[1])}),q=await h.adapter.quote({direction:'BUY',paymentMethod:'usdc',amount:'50',owner});
    await assert.rejects(h.adapter.register({quote:q,owner,provider:h.provider}),{code:'WALLET_REQUEST_REFUSED'});assert.equal(h.counts().signatures,0);
  }
});
test('disabling new orders preserves owned recovery, while a different wallet cannot resume',async()=>{
  const h=harness(),q=await h.adapter.quote({direction:'BUY',paymentMethod:'usdc',amount:'50',owner});
  await h.adapter.register({quote:q,owner,provider:h.provider});
  const disabled=createBaseGoldAdapter({enabled:false,store:h.store,reader:{},api:async()=>h.getRamp()});
  const r=await disabled.resume('order',owner,h.provider);assert.equal(r.id,'order');
  await assert.rejects(disabled.resume('order',ephemeral,h.provider),{code:'RECOVERY_UNAVAILABLE'});assert.equal(h.counts().registered,1);
});
test('funding drafts persist only the owner-bound amount; expiry and storage failure stay safe',()=>{
  const mem=new Map(),storage=createJsonStorage(()=>({getItem:k=>mem.get(k),setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)}));let now=100;
  const drafts=fundingDrafts(storage,()=>now);drafts.save(owner,'25.123456');assert.deepEqual(drafts.get(owner),{amount:'25.123456'});assert.equal(drafts.get(ephemeral),null);now+=31*60000;assert.equal(drafts.get(owner),null);assert.throws(()=>fundingDrafts({get:()=>({}),set:()=>false}).save(owner,'25'));
});
