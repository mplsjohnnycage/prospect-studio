export const stages = ["Discover","Qualify","Extract","Design","Demo","Outreach","Convert","Produce"] as const;
export type Stage = (typeof stages)[number];
export type ProspectStatus = "queued" | "running" | "needs_approval" | "paused" | "blocked" | "succeeded" | "failed";
export interface Prospect { id:string; name:string; trade:string; city:string; website:string; score:number; stage:Stage; status:ProspectStatus; notes:string; contact:string; source:string; latitude?:number; longitude?:number; createdAt:string; updatedAt:string; }
export interface Concept {id:string; prospectId:string; variant:string; direction:string; description:string; status:"draft" | "approved"; html?:string; sha256?:string; builtAt?:number; createdAt:string; }
export interface Activity {id:string; prospectId:string | null; kind:string; summary:string; at:string;}
export interface Message {id:string; prospectId:string; subject:string; body:string; status:"draft" | "approved"; createdAt:string;}
export type CommandKind = "qualify" | "extract" | "design" | "approve_concept" | "draft_outreach" | "approve_outreach" | "request_publish" | "pause" | "resume";
export const directions = [
  {variant:"A", direction:"Editorial", description:"Strong typography, generous whitespace, confident storytelling and a premium services grid."},
  {variant:"B", direction:"Local First", description:"Neighborhood credibility, prominent click-to-call actions, testimonials and straightforward service areas."},
  {variant:"C", direction:"Conversion", description:"Focused hero, quote request workflow, high contrast calls to action and trust markers."},
  {variant:"D", direction:"Signature", description:"Distinct brand color, expressive layout, project gallery and high-impact before/after storytelling."}
];
export function canTransition(p: Pick<Prospect,"stage" | "status">, command:CommandKind): boolean {
 if (command === "pause") return p.status !== "paused";
 if (command === "resume") return p.status === "paused";
 if (p.status === "paused" || p.status === "blocked") return false;
 if(command === "qualify") return p.stage === "Discover";
 if(command === "extract") return p.stage === "Qualify";
 if(command === "design") return p.stage === "Extract" || p.stage === "Design";
 if(command === "approve_concept") return p.stage === "Design";
 if(command === "request_publish") return p.stage === "Design" || p.stage === "Demo";
 if(command === "draft_outreach") return p.stage === "Demo" || p.stage === "Outreach";
 if(command === "approve_outreach") return p.stage === "Outreach";
 return false;
}
export function advance(stage:Stage,command:CommandKind):Stage {
 if(command==="qualify") return "Qualify";
 if(command==="extract") return "Extract";
 if(command==="design") return "Design";
 if(command==="draft_outreach") return "Outreach";
 return stage;
}
