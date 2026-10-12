import {GET as handle} from "@/packages/server/src/social-feed";
export function GET(request:Request){return handle(request, process.env.X_BEARER_TOKEN);}
