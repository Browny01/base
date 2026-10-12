import {summarize,type BriefingRequest} from "@/packages/server/src/news-summary";
import {mcpRedis} from "@/lib/mcp-data";
export const runtime="nodejs";
export const maxDuration=60;
export function GET(){return summarize({},mcpRedis());}
export async function POST(request:Request){let input:BriefingRequest={};try{input=await request.json();}catch{/* retain legacy empty-body behavior */}return summarize(input,mcpRedis());}
