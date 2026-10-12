import {GET as handle} from "@/packages/server/src/live-status";
export function GET(request:Request){return handle(request);}
