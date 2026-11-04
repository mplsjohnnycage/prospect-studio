import {providerStatus} from "@/lib/integrations";export async function GET(){return Response.json(providerStatus())}
export const maxDuration=30;