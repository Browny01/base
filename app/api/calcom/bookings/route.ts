import {GET as handle} from "@/packages/server/src/calcom-bookings";
export function GET(request:Request){return handle(request, process.env.CALCOM_API_KEY);}
