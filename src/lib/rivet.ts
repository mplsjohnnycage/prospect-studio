import {actor,setup} from "rivetkit";
export const prospectActor=actor({state:{stage:"Discover",status:"queued",events:[] as {kind:string;at:string}[]},actions:{
 record:(c,kind:string,stage:string,status:string)=>{c.state.stage=stage;c.state.status=status;c.state.events.push({kind,at:new Date().toISOString()});if(c.state.events.length>50)c.state.events.shift();c.broadcast("updated",{stage,status,kind});return {stage:c.state.stage,status:c.state.status}},
 snapshot:(c)=>({stage:c.state.stage,status:c.state.status,recent:c.state.events.slice(-10)})
}});
export const batchActor=actor({state:{running:false,limit:3,spent:0,maxSpend:25},actions:{
 configure:(c,limit:number,maxSpend:number)=>{c.state.limit=Math.max(1,Math.min(limit,25));c.state.maxSpend=Math.max(0,maxSpend);return c.state;},
 pause:(c)=>{c.state.running=false;return c.state},status:(c)=>c.state
}});
export const agentActor=actor({state:{sessions:0},actions:{touch:(c)=>++c.state.sessions,status:(c)=>c.state}});
export const registry=setup({use:{prospectActor,batchActor,agentActor}});
