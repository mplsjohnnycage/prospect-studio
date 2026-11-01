import {AgentOs} from "@rivet-dev/agentos-core";
async function main(){
 console.log("agentOS Core initializing");
 const vm=await AgentOs.create({
  permissions:{network:{default:"deny",rules:[]}},
  limits:{resources:{maxProcesses:8,maxFilesystemBytes:16*1024*1024}}
 });
 try{
  await vm.filesystem.writeFile("/tmp/prospect-studio.txt","agentOS isolated VM check\n");
  const file=await vm.filesystem.readFile("/tmp/prospect-studio.txt");
  const result=await vm.process.exec("cat /tmp/prospect-studio.txt",{output:{capture:"all"}});
  console.log(JSON.stringify({file:new TextDecoder().decode(file).trim(),stdout:result.stdout,exitCode:result.exitCode}));
 }finally{await vm.dispose()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
