// Item 22 (desktop only): embed public business facts with the local EmbeddingGemma server and score lookalike-to-winners.
// Vectors stay in local SQLite (node:sqlite, built into Node 22.5+/24; no native deps). Only the score goes to Convex.
// Endpoint: llama.cpp OpenAI-style /v1/embeddings on loopback (EMBED_URL). If it is down, the caller keeps the existing score.
import {DatabaseSync} from "node:sqlite";
import {mkdirSync} from "node:fs";
import {lookalikeScore} from "../src/lib/agent-core";
export const EMBED_URL=process.env.EMBED_URL??"http://127.0.0.1:11434/v1/embeddings";
export const EMBED_MODEL=process.env.EMBED_MODEL??"embeddinggemma-300M-Q8_0.gguf";
export const EMBED_DIM=768;
export function openVectors(path=process.env.VECTOR_DB??".data/vectors.sqlite"){
 if(path!==":memory:")mkdirSync(path.replace(/[\\/][^\\/]*$/,"")||".",{recursive:true});
 const db=new DatabaseSync(path);
 db.exec("CREATE TABLE IF NOT EXISTS vectors(prospect_id TEXT PRIMARY KEY,model TEXT NOT NULL,dim INTEGER NOT NULL,vec BLOB NOT NULL,won INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL)");
 return db;
}
export async function embed(text:string,fetchImpl:typeof fetch=fetch):Promise<Float32Array>{
 const r=await fetchImpl(EMBED_URL,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({model:EMBED_MODEL,input:text}),signal:AbortSignal.timeout(10_000)});
 if(!r.ok)throw Error("embed HTTP "+r.status);
 const j=await r.json() as {data?:{embedding:number[]}[]};
 const e=j.data?.[0]?.embedding;if(!e||e.length!==EMBED_DIM)throw Error("unexpected embedding size "+(e?.length??0));
 return Float32Array.from(e);
}
export type EmbedResult={score?:number;winners:number;model:string;endpointOk:boolean;error?:string};
export async function runEmbed(prospectId:string,input:{text:string;won:boolean;winners:string[]},opts:{db?:DatabaseSync;fetchImpl?:typeof fetch}={}):Promise<EmbedResult>{
 const db=opts.db??openVectors();
 let v:Float32Array;
 try{v=await embed(input.text,opts.fetchImpl);}
 catch(e){return {winners:0,model:EMBED_MODEL,endpointOk:false,error:String(e).slice(0,200)};}
 db.prepare("INSERT OR REPLACE INTO vectors VALUES(?,?,?,?,?,?)").run(prospectId,EMBED_MODEL,v.length,new Uint8Array(v.buffer),input.won?1:0,Date.now());
 const win=new Set(input.winners);
 const rows=db.prepare("SELECT prospect_id,vec FROM vectors WHERE model=?").all(EMBED_MODEL) as {prospect_id:string;vec:Uint8Array}[];
 const wv=rows.filter(r=>win.has(r.prospect_id)&&r.prospect_id!==prospectId).map(r=>new Float32Array(r.vec.buffer.slice(r.vec.byteOffset,r.vec.byteOffset+r.vec.byteLength)));
 const score=lookalikeScore(v,wv);
 return {...(score!==undefined?{score}:{}),winners:wv.length,model:EMBED_MODEL,endpointOk:true};
}
