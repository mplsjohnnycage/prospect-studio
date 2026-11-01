import {query} from "./_generated/server";
import {v} from "convex/values";
import {owner} from "./identity";
import {components} from "./_generated/api";
export const status=query({args:{},handler:async(ctx)=>{
 await owner(ctx);return {provider:"AgentMail Convex Component",configured:!!process.env.AGENTMAIL_API_KEY,sendEnabled:false,inboundWebhook:"/agentmail/webhook",note:"No outbound mail is sent automatically. Explicit approval and provider setup required."};
}});
export const inboxMessages=query({args:{inboxId:v.string()},handler:async(ctx,args):Promise<unknown>=>{
 const user=await owner(ctx);
 const inbox=await ctx.db.query("mailboxes").withIndex("by_owner",q=>q.eq("ownerId",user)).filter(q=>q.eq(q.field("inboxId"),args.inboxId)).first();
 if(!inbox)throw new Error("Inbox not authorized for this account");
 return ctx.runQuery(components.agentmail.lib.listInboundMessages,{inboxId:args.inboxId});
}});
