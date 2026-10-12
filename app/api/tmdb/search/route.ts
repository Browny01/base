import {GET as handle} from "@/packages/server/src/tmdb-search";
export const runtime="nodejs";
export async function GET(request:Request){return handle(request,process.env.TMDB_API_KEY);}
export type {TmdbResult} from "@/packages/core/src/integrations";
