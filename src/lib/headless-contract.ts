/** Shared agent-neutral contract: Convex owns jobs, agents only borrow execution leases. */
export const JOB_KINDS = [
  "research_business", "qualify_lead", "build_demo", "review_demo", "draft_outreach",
] as const;
export type JobKind = (typeof JOB_KINDS)[number];
export type JobStatus = "queued" | "leased" | "submitted" | "verified" | "rejected" | "failed" | "cancelled";
export const LEASE_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 3;
export const MAX_LEASE_RENEWALS = 12;

export function requireJobInput(kind:string,instruction:string,inputJson:string,key:string){
 if(!(JOB_KINDS as readonly string[]).includes(kind))throw Error("Unsupported job kind");
 const trimmed=instruction.trim();
 if(trimmed.length<12||trimmed.length>3000)throw Error("Instruction must be 12–3000 characters");
 if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(key))throw Error("Invalid idempotency key");
 if(new TextEncoder().encode(inputJson).byteLength>16000)throw Error("Job input exceeds 16000 bytes");
 let input:unknown;
 try{input=JSON.parse(inputJson)}catch{throw Error("Job input must be valid JSON")}
 if(!input||typeof input!=="object"||Array.isArray(input))throw Error("Job input must be a JSON object");
 // Inputs are treated as untrusted data, not authority to send, publish, or spend.
 return {kind:kind as JobKind,instruction:trimmed,inputJson:JSON.stringify(input),idempotencyKey:key};
}
export function requireClaim(workerId:string,leaseId:string){
 if(workerId.length<3||workerId.length>100||!/^[A-Za-z0-9][\w.:/-]*$/.test(workerId))throw Error("Invalid worker identifier");
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(leaseId))throw Error("Lease ID must be a UUID");
}
export function canClaim(status:JobStatus,leaseUntil:number|undefined,attempts:number,now:number){
 return attempts<MAX_ATTEMPTS&&(status==="queued"||(status==="leased"&&(leaseUntil??0)<=now));
}
export function expiredTerminal(status:JobStatus,leaseUntil:number|undefined,attempts:number,now:number){
 return status==="leased"&&(leaseUntil??0)<=now&&attempts>=MAX_ATTEMPTS;
}
export function requireSubmission(summary:string,evidence:string[]){
 if(summary.trim().length<10||summary.length>4000)throw Error("Submission summary must be 10–4000 characters");
 if(evidence.length<1||evidence.length>12||evidence.some(x=>x.length<8||x.length>1024))
  throw Error("Provide 1–12 concrete evidence references");
 return {summary:summary.trim(),evidence};
}
export function publicJob<T extends {
 _id:unknown;kind:JobKind;instruction:string;inputJson:string;status:JobStatus;attempts:number;
 createdAt:number;updatedAt:number;workerId?:string;leaseUntil?:number;
 summary?:string;evidence?:string[];verifiedAt?:number;verificationNotes?:string;
}>(job:T){
 // Never return lease ID or private owner ID to polling clients.
 return {id:String(job._id),kind:job.kind,instruction:job.instruction,
  input:JSON.parse(job.inputJson) as unknown,status:job.status,attempts:job.attempts,
  createdAt:job.createdAt,updatedAt:job.updatedAt,workerId:job.workerId??null,
  leaseUntil:job.leaseUntil??null,summary:job.summary??null,evidence:job.evidence??[],
  verifiedAt:job.verifiedAt??null,verificationNotes:job.verificationNotes??null};
}
