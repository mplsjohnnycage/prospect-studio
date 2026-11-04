// Runs one tiny job on an execution provider and prints the result (never the token).
//   EXECUTION_PROVIDER=pc SANDBOX_AGENT_PC_URL=... SANDBOX_AGENT_PC_TOKEN=... node --import tsx scripts/exec-smoke.mts
import {pickProvider, runJob} from "../src/lib/execution";

const provider = pickProvider();
const r = await runJob({
  command: "node",
  args: ["-e", "const fs=require('fs');console.log(JSON.stringify({sum:1+1,file:fs.readFileSync('exec-smoke/hello.txt','utf8')}))"],
  files: [{path: "exec-smoke/hello.txt", content: "hello from prospect studio"}],
}, provider);
console.log(JSON.stringify({provider: r.provider, exitCode: r.exitCode, stdout: r.stdout.trim(), stderr: r.stderr.trim().slice(0, 300), ms: r.ms}));
process.exit(r.exitCode === 0 ? 0 : 1);
