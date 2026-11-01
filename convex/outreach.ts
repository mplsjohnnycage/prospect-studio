import {mutation} from "./_generated/server";
import {v} from "convex/values";
import {owner} from "./identity";
export const edit=mutation({args:{id:v.id("outreach"),subject:v.string(),body:v.string()},handler:async(ctx,a)=>{
 const user=await owner(ctx);const m=await ctx.db.get(a.id);if(!m||m.ownerId!==user)throw Error("Draft not found");
 if(m.status!=="draft")throw Error("Only drafts can be edited; an approved message is locked");
 if(!a.subject.trim()||a.subject.length>200||!a.body.trim()||a.body.length>10000)throw Error("Invalid subject or body");
 await ctx.db.patch(a.id,{subject:a.subject,body:a.body,updatedAt:Date.now()});
 await ctx.db.insert("activities",{ownerId:user,prospectId:m.prospectId,kind:"draft_updated",summary:"Edited outreach draft; not sent",timestamp:Date.now()});
 return a.id;
}});
