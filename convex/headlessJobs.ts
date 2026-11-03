import {internalMutation,internalQuery} from "./_generated/server";
import type {MutationCtx} from "./_generated/server";
import type {Doc} from "./_generated/dataModel";
import {v} from "convex/values";
import {
 canClaim,expiredTerminal,LEASE_MS,MAX_ATTEMPTS,MAX_LEASE_RENEWALS,
 publicJob,requireClaim,requireJobInput,requireSubmission,
} from "../src/lib/headless-contract";

const kind=v.union(
 v.literal("research_business"),v.literal("qualify_lead"),v.literal("build_demo"),
 v.literal("review_demo"),v.literal("draft_outreach"),
);
type Job=Doc<"headlessJobs">;
const ownerArg={ownerId:v.string()};
const jobArg={ownerId:v.string(),jobId:v.string()};
async function owned(ctx:MutationCtx,ownerId:string,id:string):Promise<Job>{
 const normalized=ctx.db.normalizeId("headlessJobs",id.trim());
 const job=normalized?await ctx.db.get(normalized):null;
 if(!job||job.ownerId!==ownerId)throw Error("Job not found");
 return job;
}
async function audit(ctx:MutationCtx,job:Job,eventType:string,actor:string,note:string){
 await ctx.db.insert("headlessJobEvents",{
  ownerId:job.ownerId,jobId:job._id,eventType,actor:actor.slice(0,100),
  note:note.slice(0,1200),createdAt:Date.now(),
 });
}

export const enqueue=internalMutation({
 args:{...ownerArg,kind,instruction:v.string(),inputJson:v.string(),idempotencyKey:v.string()},
 handler:async(ctx,a)=>{
  const input=requireJobInput(a.kind,a.instruction,a.inputJson,a.idempotencyKey);
  const old=await ctx.db.query("headlessJobs")
   .withIndex("by_owner_key",q=>q.eq("ownerId",a.ownerId).eq("idempotencyKey",input.idempotencyKey)).first();
  if(old){
   if(old.kind!==input.kind||old.instruction!==input.instruction||old.inputJson!==input.inputJson)
    throw Error("Idempotency key already used for a different job");
   return {id:old._id,status:old.status,existing:true};
  }
  const now=Date.now();
  const id=await ctx.db.insert("headlessJobs",{
   ownerId:a.ownerId,...input,status:"queued",attempts:0,leaseRenewals:0,createdAt:now,updatedAt:now,
  });
  const job=await ctx.db.get(id);
  if(job)await audit(ctx,job,"enqueued","control-plane","Durably queued; no external effects");
  return {id,status:"queued" as const,existing:false};
 },
});
export const get=internalQuery({
 args:jobArg,
 handler:async(ctx,a)=>{
  const normalized=ctx.db.normalizeId("headlessJobs",a.jobId);
  const job=normalized?await ctx.db.get(normalized):null;
  if(!job||job.ownerId!==a.ownerId)throw Error("Job not found");
  return publicJob(job);
 },
});
export const list=internalQuery({
 args:{...ownerArg,limit:v.optional(v.number())},
 handler:async(ctx,a)=>{
  const limit=Math.max(1,Math.min(50,Number.isFinite(a.limit)?Math.trunc(a.limit!):20));
  const jobs=await ctx.db.query("headlessJobs")
   .withIndex("by_owner_updated",q=>q.eq("ownerId",a.ownerId)).order("desc").take(limit);
  return jobs.map(publicJob);
 },
});
export const events=internalQuery({
 args:{...jobArg,limit:v.optional(v.number())},
 handler:async(ctx,a)=>{
  const id=ctx.db.normalizeId("headlessJobs",a.jobId);
  const job=id?await ctx.db.get(id):null;
  if(!job||job.ownerId!==a.ownerId)throw Error("Job not found");
  const limit=Math.max(1,Math.min(80,Number.isFinite(a.limit)?Math.trunc(a.limit!):30));
  return await ctx.db.query("headlessJobEvents")
   .withIndex("by_job_time",q=>q.eq("jobId",job._id)).order("desc").take(limit);
 },
});
export const claim=internalMutation({
 args:{...ownerArg,workerId:v.string(),leaseId:v.string(),jobId:v.optional(v.string())},
 handler:async(ctx,a)=>{
  requireClaim(a.workerId,a.leaseId);
  const now=Date.now();
  let candidate:Job|undefined;
  if(a.jobId){
   const j=await owned(ctx,a.ownerId,a.jobId);
   if(expiredTerminal(j.status,j.leaseUntil,j.attempts,now)){
    await ctx.db.patch(j._id,{status:"failed",updatedAt:now});
    await audit(ctx,j,"exhausted","system","Lease expired after maximum attempts");
   }else if(canClaim(j.status,j.leaseUntil,j.attempts,now))candidate=j;
  }else{
   const queued=await ctx.db.query("headlessJobs")
    .withIndex("by_owner_status",q=>q.eq("ownerId",a.ownerId).eq("status","queued")).take(25);
   candidate=queued.find(j=>canClaim(j.status,j.leaseUntil,j.attempts,now));
   if(!candidate){
    const expired=await ctx.db.query("headlessJobs")
     .withIndex("by_owner_lease",q=>q.eq("ownerId",a.ownerId).eq("status","leased").lte("leaseUntil",now)).take(50);
    for(const j of expired){
     if(expiredTerminal(j.status,j.leaseUntil,j.attempts,now)){
      await ctx.db.patch(j._id,{status:"failed",updatedAt:now});
      await audit(ctx,j,"exhausted","system","Lease expired after maximum attempts");
     }else if(!candidate&&canClaim(j.status,j.leaseUntil,j.attempts,now))candidate=j;
    }
   }
  }
  if(!candidate)return null;
  await ctx.db.patch(candidate._id,{
   status:"leased",workerId:a.workerId,leaseId:a.leaseId,
   leaseUntil:now+LEASE_MS,leaseRenewals:0,attempts:candidate.attempts+1,updatedAt:now,
  });
  await audit(ctx,candidate,"claimed",a.workerId,"Worker claimed a bounded execution lease");
  return {job:publicJob({...candidate,status:"leased" as const,workerId:a.workerId,leaseUntil:now+LEASE_MS,attempts:candidate.attempts+1,updatedAt:now}),leaseId:a.leaseId};
 },
});
export const heartbeat=internalMutation({
 args:{...jobArg,workerId:v.string(),leaseId:v.string()},
 handler:async(ctx,a)=>{
  requireClaim(a.workerId,a.leaseId);
  const j=await owned(ctx,a.ownerId,a.jobId),now=Date.now();
  if(j.status!=="leased"||j.leaseId!==a.leaseId||j.workerId!==a.workerId||!j.leaseUntil||j.leaseUntil<=now)
   throw Error("Lease is no longer valid");
  if(j.leaseRenewals>=MAX_LEASE_RENEWALS)throw Error("Maximum lease renewal limit reached");
  const until=now+LEASE_MS;
  await ctx.db.patch(j._id,{leaseUntil:until,leaseRenewals:j.leaseRenewals+1,updatedAt:now});
  return {leaseUntil:until,remaining:MAX_LEASE_RENEWALS-j.leaseRenewals-1};
 },
});
export const submit=internalMutation({
 args:{...jobArg,workerId:v.string(),leaseId:v.string(),summary:v.string(),evidence:v.array(v.string())},
 handler:async(ctx,a)=>{
  requireClaim(a.workerId,a.leaseId);
  const data=requireSubmission(a.summary,a.evidence),j=await owned(ctx,a.ownerId,a.jobId),now=Date.now();
  if(j.status!=="leased"||j.workerId!==a.workerId||j.leaseId!==a.leaseId||!j.leaseUntil||j.leaseUntil<=now)
   throw Error("Submission requires an active matching lease");
  await ctx.db.patch(j._id,{status:"submitted",summary:data.summary,evidence:data.evidence,
   leaseUntil:undefined,leaseId:undefined,updatedAt:now});
  await audit(ctx,j,"submitted",a.workerId,"Worker submitted evidence; independent verification still required");
  return {id:j._id,status:"submitted" as const,verified:false};
 },
});
export const fail=internalMutation({
 args:{...jobArg,workerId:v.string(),leaseId:v.string(),reason:v.string()},
 handler:async(ctx,a)=>{
  requireClaim(a.workerId,a.leaseId);
  const j=await owned(ctx,a.ownerId,a.jobId),now=Date.now();
  if(j.status!=="leased"||j.workerId!==a.workerId||j.leaseId!==a.leaseId||!j.leaseUntil||j.leaseUntil<=now)
   throw Error("Failure reporting requires an active matching lease");
  const terminal=j.attempts>=MAX_ATTEMPTS;
  await ctx.db.patch(j._id,{status:terminal?"failed":"queued",leaseId:undefined,leaseUntil:undefined,
   workerId:undefined,updatedAt:now});
  await audit(ctx,j,terminal?"failed":"retry_queued",a.workerId,a.reason.slice(0,1200));
  return {id:j._id,status:terminal?"failed":"queued",attempts:j.attempts};
 },
});
// Never exposed through MCP or external CLI. Only trusted, independently authorized
// verifier code may call this internal mutation; it is not human acceptance.
export const verify=internalMutation({
 args:{...jobArg,reviewerId:v.string(),approved:v.boolean(),notes:v.string()},
 handler:async(ctx,a)=>{
  const j=await owned(ctx,a.ownerId,a.jobId);
  if(j.status!=="submitted"||!j.evidence?.length)throw Error("Only an evidenced submission can be reviewed");
  if(a.reviewerId.length<3||a.reviewerId===j.workerId)throw Error("Independent verifier required");
  if(a.notes.trim().length<12||a.notes.length>2000)throw Error("Verification notes required");
  const now=Date.now(),state=a.approved?"verified":"rejected";
  await ctx.db.patch(j._id,{status:state,verifiedAt:a.approved?now:undefined,
   verificationNotes:a.notes.trim(),updatedAt:now});
  await audit(ctx,j,state,a.reviewerId,a.notes);
  return {id:j._id,status:state};
 },
});
