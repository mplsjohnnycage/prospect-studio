import {httpRouter} from "convex/server";
import {httpAction} from "./_generated/server";
import {AgentMail} from "@agentmail/convex";
import {components} from "./_generated/api";
const http=httpRouter();
const agentmail=new AgentMail(components.agentmail);
http.route({path:"/agentmail/webhook",method:"POST",handler:httpAction(async(ctx,request)=>agentmail.handleWebhook(ctx as unknown as Parameters<typeof agentmail.handleWebhook>[0],request))});
export default http;
