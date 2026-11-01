import {mutation,query} from "./_generated/server";
import {v} from "convex/values";
import {owner} from "./identity";
const status=v.union(v.literal("planned"),v.literal("completed"),v.literal("cancelled"));
export const list=query({args:{},handler:async ctx=>{
 const user=await owner(ctx);
 return await ctx.db.query("appointments").withIndex("by_owner_start",q=>q.eq("ownerId",user)).order("asc").take(300);
}});
export const create=mutation({args:{prospectId:v.id("prospects"),startAt:v.number(),durationMinutes:v.number(),title:v.string(),notes:v.optional(v.string()),bookingUrl:v.optional(v.string())},handler:async(ctx,a)=>{
 const user=await owner(ctx);const p=await ctx.db.get(a.prospectId);if(!p||p.ownerId!==user)throw Error("Prospect not found");
 if(!Number.isFinite(a.startAt)||a.startAt<Date.UTC(2025,0,1)||a.startAt>Date.UTC(2120,0,1))throw Error("Invalid appointment start");
 if(!Number.isInteger(a.durationMinutes)||a.durationMinutes<15||a.durationMinutes>240)throw Error("Invalid duration");
 if(!a.title.trim()||a.title.length>160)throw Error("Valid title required");
 if(a.bookingUrl&&(!a.bookingUrl.startsWith("https://")||a.bookingUrl.length>512))throw Error("Booking URL must be HTTPS");
 const id=await ctx.db.insert("appointments",{ownerId:user,prospectId:p._id,startAt:a.startAt,durationMinutes:a.durationMinutes,title:a.title.trim(),notes:(a.notes??"").slice(0,3000),bookingUrl:a.bookingUrl??"",status:"planned",source:"manual",updatedAt:Date.now()});
 await ctx.db.insert("activities",{ownerId:user,prospectId:p._id,kind:"appointment_scheduled",summary:"Planned call: "+a.title+" (not a confirmed booking)",timestamp:Date.now()});
 return id;
}});
export const update=mutation({args:{id:v.id("appointments"),status:v.optional(status),notes:v.optional(v.string())},handler:async(ctx,a)=>{
 const user=await owner(ctx);const apt=await ctx.db.get(a.id);
 if(!apt||apt.ownerId!==user)throw Error("Appointment not found");
 if(a.notes&&a.notes.length>3000)throw Error("Notes too long");
 await ctx.db.patch(a.id,{...(a.status?{status:a.status}:{}),...(a.notes!==undefined?{notes:a.notes}:{}),updatedAt:Date.now()});
 await ctx.db.insert("activities",{ownerId:user,prospectId:apt.prospectId,kind:"appointment_updated",summary:"Updated call: "+apt.title,timestamp:Date.now()});
 return a.id;
}});
export const remove=mutation({args:{id:v.id("appointments")},handler:async(ctx,a)=>{
 const user=await owner(ctx);const apt=await ctx.db.get(a.id);if(!apt||apt.ownerId!==user)throw Error("Appointment not found");
 await ctx.db.delete(a.id);
 await ctx.db.insert("activities",{ownerId:user,prospectId:apt.prospectId,kind:"appointment_deleted",summary:"Removed planned call: "+apt.title,timestamp:Date.now()});
 return true;
}});
