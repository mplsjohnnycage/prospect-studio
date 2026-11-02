import {query} from "./_generated/server";

/** Public, data-free backend availability probe. Never returns tenant data. */
export const ping=query({args:{},handler:async()=>({ok:true})});
