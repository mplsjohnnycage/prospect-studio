import {actor,setup} from "rivetkit";
import {buildConceptInAgentOS,validateConcept,type ConceptInput} from "./agentos";
export const prospectActor=actor({state:{stage:"Discover",status:"queued",events:[] as {kind:string;at:string}[],lastConcept:null as null | {sha256:string;direction:string;builtAt:string;runtime:string}},actions:{
 record:(c,kind:string,stage:string,status:string)=>{c.state.stage=stage;c.state.status=status;c.state.events.push({kind,at:new Date().toISOString()});if(c.state.events.length>50)c.state.events.shift();c.broadcast("updated",{stage,status,kind});return {stage:c.state.stage,status:c.state.status}},
 snapshot:(c)=>({stage:c.state.stage,status:c.state.status,recent:c.state.events.slice(-10),lastConcept:c.state.lastConcept}),
 // VM runs inside the trusted Sprite actor process, not in the Vercel request handler.
 // No arbitrary shell or code is accepted. Only structured, escaped concept data.
 generateConcept:async(c,input:ConceptInput)=>{
   validateConcept(input);
   const result=await buildConceptInAgentOS(input);
   c.state.lastConcept={sha256:result.sha256,direction:result.direction,builtAt:new Date().toISOString(),runtime:result.runtime};
   c.state.events.push({kind:"agentos_concept_built",at:new Date().toISOString()});
   if(c.state.events.length>50)c.state.events.shift();
   c.broadcast("concept_ready",{sha256:result.sha256,direction:result.direction,verified:result.verified});
   return result;
 }
}});
export const batchActor=actor({state:{running:false,limit:3,spent:0,maxSpend:25},actions:{
 configure:(c,limit:number,maxSpend:number)=>{c.state.limit=Math.max(1,Math.min(limit,25));c.state.maxSpend=Math.max(0,maxSpend);return c.state;},
 pause:(c)=>{c.state.running=false;return c.state},status:(c)=>c.state
}});
export const agentActor=actor({state:{sessions:0},actions:{touch:(c)=>++c.state.sessions,status:(c)=>c.state}});
export const registry=setup({use:{prospectActor,batchActor,agentActor}});
