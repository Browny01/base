import {test} from 'node:test';
import assert from 'node:assert/strict';
import {convertMarketAsset, formatMarketPrice, marketCurrency} from '../packages/core/src/market-currency.ts';
import {normalizeNewsPrefs,socialFeedQuery} from '../lib/news-prefs.ts';
import {enableNotifications, installNotifications} from '../lib/notifications.ts';
const asset={id:'gold',name:'Gold',symbol:'GC=F',price:3000,priceUsd:2000,change24h:2,history:[{t:1,v:1500}],currency:'AUD/oz'};
test('market conversion applies the same real FX rate to quotes/history and preserves units and points',()=>{
 const converted=convertMarketAsset(asset,'EUR',{aud:1.5,eur:.9});
 assert.equal(converted.price,1800);assert.equal(converted.history[0].v,900);assert.equal(converted.currency,'EUR/oz');assert.equal(converted.priceUsd,2000);assert.equal(converted.change24h,2);
 assert.equal(convertMarketAsset({...asset,currency:'points'},'USD',null).price,3000);
 assert.equal(convertMarketAsset({...asset,price:null},'USD',null).price,null);
 const unavailable=convertMarketAsset(asset,'JPY',null);assert.equal(unavailable.currency,'AUD/oz');assert.match(unavailable.note!,/unavailable/);
 assert.equal(marketCurrency('bad'),'AUD');assert.match(formatMarketPrice(12,'EUR/oz'),/EUR/);assert.match(formatMarketPrice(5000,'points'),/pts/);assert.equal(formatMarketPrice(null,'AUD'),'—');
});
test('disabled feed kinds keep sources stored but omit them from requests',()=>{
 const prefs=normalizeNewsPrefs({youtube:[{id:'test',name:'Test',channelId:'UCtest',category:'general'}],reddit:['base'],x:['base'],feedKinds:['youtube'],marketCurrency:'GBP'});
 const query=new URLSearchParams(socialFeedQuery(prefs));assert.equal(query.getAll('reddit').length,0);assert.equal(query.getAll('x').length,0);assert.equal(query.getAll('youtube').length,1);assert.deepEqual(prefs.reddit,['base']);assert.equal(prefs.marketCurrency,'GBP');
 assert.equal(socialFeedQuery({...prefs,feedKinds:[]}),'');
});
test('notification delivery errors reach the settings action instead of claiming success',async()=>{
 installNotifications({permission:async()=>'granted',request:async()=>'granted',send:async()=>{throw Error('Notification service unavailable')}});
 await assert.rejects(enableNotifications(),/Notification service unavailable/);
});
