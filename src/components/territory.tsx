"use client";
import {useState} from "react";
import {MapPinned,Search,LocateFixed,AlertCircle} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
type Point={_id:string;name:string;trade:string;city:string;latitude?:number;longitude?:number;stage:string};
function haversine(lat1:number,lng1:number,lat2:number,lng2:number){const r=Math.PI/180,a=Math.sin((lat2-lat1)*r/2)**2+Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin((lng2-lng1)*r/2)**2;return 6371*2*Math.asin(Math.sqrt(a));}
export function Territory({all}:{all:Point[]}){
 const [lat,setLat]=useState("44.9778"),[lng,setLng]=useState("-93.2650");
 const [results,setResults]=useState<Point[]|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const indexed=all.filter(p=>typeof p.latitude==="number"&&typeof p.longitude==="number");
 async function search(){setBusy(true);setError("");try{const res=await fetch("/api/nearby?lat="+encodeURIComponent(lat)+"&lng="+encodeURIComponent(lng),{cache:"no-store"});const body=await res.json();if(!res.ok)throw Error(body.error||"Search failed");setResults(body.prospects)}catch(e){setError(e instanceof Error?e.message:"Search failed")}finally{setBusy(false)}}
 return <div className="grid gap-5 lg:grid-cols-[330px_1fr]">
 <div className="rounded-2xl border border-white/10 bg-[#111b28] p-5"><div className="flex items-center gap-2"><MapPinned className="text-[#7ae0bc]" size={19}/><h3 className="text-sm font-semibold">Location intelligence</h3></div><p className="mt-3 text-xs leading-6 text-[#91a4b5]">Find prospects within 25 km of a coordinate using the installed Convex Geospatial index. Coordinates must be verified, not inferred from city names.</p>
 <div className="mt-5 grid grid-cols-2 gap-3"><label className="grid gap-2 text-xs text-[#9fb5c5]">Latitude<Input value={lat} onChange={e=>setLat(e.target.value)} className="border-white/10 bg-[#0a131e] text-white"/></label><label className="grid gap-2 text-xs text-[#9fb5c5]">Longitude<Input value={lng} onChange={e=>setLng(e.target.value)} className="border-white/10 bg-[#0a131e] text-white"/></label></div>
 <Button className="mt-4 w-full bg-[#76e0b9] text-[#0b211a]" onClick={search} disabled={busy}><Search size={15}/>{busy?"Searching…":"Search within 25 km"}</Button>
 <div className="mt-5 rounded-xl bg-[#0b1520] p-4 text-xs"><div className="flex items-center justify-between"><span className="text-[#90a8b6]">Coordinate-indexed</span><span className="font-semibold text-[#82ebc7]">{indexed.length}</span></div><div className="mt-2 flex items-center justify-between"><span className="text-[#90a8b6]">Total prospects</span><span>{all.length}</span></div></div>
 {error&&<div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/20 p-3 text-xs text-red-200"><AlertCircle size={15}/>{error}</div>}
 </div>
 <div className="min-h-[420px] rounded-2xl border border-white/10 bg-[#111b28] p-5"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Nearby prospects</h3><span className="text-xs text-[#8da2b1]">{results?results.length+" matched":indexed.length+" indexed"}</span></div>
 {(results??indexed).length?<div className="mt-4 space-y-2">{(results??indexed).map(p=><div key={p._id} className="flex items-center justify-between rounded-xl border border-white/[.07] bg-[#0b1520] p-4"><div><div className="text-sm font-semibold">{p.name}</div><div className="mt-1 text-xs text-[#839bac]">{p.trade} · {p.city}</div><div className="mt-2 text-[10px] text-[#718da0]">{p.latitude?.toFixed(5)}, {p.longitude?.toFixed(5)}</div></div><div className="text-right"><div className="text-sm font-semibold text-[#83e6bf]">{p.latitude!==undefined&&p.longitude!==undefined?haversine(Number(lat),Number(lng),p.latitude,p.longitude).toFixed(1)+" km":"—"}</div><div className="text-[10px] text-[#7b90a0]">{p.stage}</div></div></div>)}</div>:<div className="flex h-[330px] flex-col items-center justify-center text-center"><LocateFixed className="text-[#639b91]" size={36}/><h4 className="mt-5 text-sm font-semibold">No indexed coordinates yet</h4><p className="mt-2 max-w-[275px] text-xs leading-6 text-[#88a0b0]">Add a prospect with a verified latitude and longitude. The geospatial component will index it automatically.</p></div>}</div>
 </div>;
}
