import type { AssetData } from './integrations.ts';
export const MARKET_CURRENCIES = ['AUD','USD','EUR','GBP','CAD','NZD','SGD','JPY','CHF','HKD','INR','CNY','BRL','KRW','ZAR'] as const;
export type MarketCurrency = typeof MARKET_CURRENCIES[number];
export const marketCurrency = (value: unknown): MarketCurrency => MARKET_CURRENCIES.includes(value as MarketCurrency) ? value as MarketCurrency : 'AUD';
export function convertMarketAsset(asset: AssetData, currency: MarketCurrency, usdRates: Record<string, number> | null): AssetData {
  const [source, unit] = asset.currency.split('/');
  if (source === currency || source === 'points' || !source || asset.price === null) return asset;
  const from = source === 'USD' ? 1 : usdRates?.[source.toLowerCase()], to = currency === 'USD' ? 1 : usdRates?.[currency.toLowerCase()];
  if (!from || !to || !Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0)
    return { ...asset, note: [asset.note, `Conversion to ${currency} unavailable; showing ${source}`].filter(Boolean).join(' · ') };
  const ratio = to/from;
  return { ...asset, price:asset.price*ratio, history:asset.history.map(p=>({...p,v:p.v*ratio})), currency:currency+(unit?'/'+unit:'') };
}
export function formatMarketPrice(price: number | null, currency: string): string {
  if (price === null || !Number.isFinite(price)) return '—';
  const [code, unit] = currency.split('/');
  if (code === 'points') return new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(price)+' pts';
  if (!MARKET_CURRENCIES.includes(code as MarketCurrency)) return String(price);
  return new Intl.NumberFormat(undefined,{style:'currency',currency:code,currencyDisplay:'code',maximumFractionDigits:code==='JPY'||code==='KRW'?0:price<1?6:2}).format(price)+(unit?'/'+unit:'');
}
