import type {NextRequest} from "next/server";
import {apiAccessAllowed} from "@/lib/access";
import {GET as handle} from "@/packages/server/src/wallet-tokens";
export async function GET(request:NextRequest){if(!await apiAccessAllowed(request))return Response.json({error:"Unauthorized", tokens: []},{status:401});return handle(request);}
export type {TokenBalance} from "@/packages/core/src/integrations";
