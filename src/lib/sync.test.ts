// Backend/frontend sync check (runs in verify): every api.X.Y used by the UI exists as an exported Convex function,
// and every schema table is read by some Convex query/tool (no orphan tables).
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync,statSync} from "node:fs";
import {join} from "node:path";
const walk=(d:string):string[]=>readdirSync(d).flatMap(f=>{const p=join(d,f);return statSync(p).isDirectory()?(f==="node_modules"||f==="_generated"?[]:walk(p)):[p];});
const ui=walk("src").filter(f=>/\.(tsx?|mts)$/.test(f)&&!f.endsWith(".test.ts"));
const cvx=walk("convex").filter(f=>f.endsWith(".ts")&&!f.includes(".test."));
test("every api.module.fn used by the UI exists",()=>{
  const missing:string[]=[];
  for(const f of ui){for(const m of readFileSync(f,"utf8").matchAll(/\bapi\.([a-zA-Z]+)\.([a-zA-Z]+)/g)){
    const file=join("convex",m[1]+".ts");let src="";try{src=readFileSync(file,"utf8");}catch{missing.push(f+": "+m[0]+" (no module)");continue;}
    if(!new RegExp("export const (?:\\{[^}]*\\b"+m[2]+"\\b[^}]*\\}|"+m[2]+"\\b)").test(src))missing.push(f+": "+m[0]);}}
  assert.deepEqual(missing,[]);
});
test("every schema table is read somewhere in Convex",()=>{
  const schema=readFileSync("convex/schema.ts","utf8");
  const tables=[...schema.matchAll(/^\s*([a-zA-Z]+): defineTable\(/gm)].map(m=>m[1]);
  const all=cvx.filter(f=>!f.endsWith("schema.ts")).map(f=>readFileSync(f,"utf8")).join("\n");
  // Known pre-existing drift (write-only audit log from the Rivet actor; no reader yet).
  const KNOWN=new Set(["actorEvents"]);
  const orphan=tables.filter(t=>!KNOWN.has(t)&&!new RegExp("query\\(\""+t+"\"\\)").test(all));
  assert.deepEqual(orphan,[]);
});
