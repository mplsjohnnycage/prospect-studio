"use client";
import {useEffect,useRef,useState} from "react";
import type {Map as LeafletMap, LayerGroup} from "leaflet";
import {LocateFixed,MapPin,Minus,Plus} from "lucide-react";
import type {Prospect} from "@/lib/domain";
type Props={prospects:Prospect[];selected:string|null;onSelect:(id:string)=>void;zoomTo?:{lat:number;lng:number}|null};
export function MapCanvas({prospects,selected,onSelect,zoomTo}:Props){
 const element=useRef<HTMLDivElement>(null);
 const map=useRef<LeafletMap|null>(null);
 const markers=useRef<LayerGroup|null>(null);
 const selectedRef=useRef(onSelect);
 const [loaded,setLoaded]=useState(false);
 useEffect(()=>{selectedRef.current=onSelect},[onSelect]);
 useEffect(()=>{let canceled=false;let current:LeafletMap|null=null;
  async function init(){
   if(!element.current||map.current)return;
   const L=await import("leaflet");if(canceled||!element.current)return;
   current=L.map(element.current,{zoomControl:false,attributionControl:true,scrollWheelZoom:true,preferCanvas:true}).setView([44.9778,-93.2650],12);
   L.tileLayer("/api/map/tiles/{z}/{x}/{y}",{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).addTo(current);
   map.current=current;markers.current=L.layerGroup().addTo(current);setLoaded(true);
  }
  void init();return()=>{canceled=true;current?.remove();map.current=null;markers.current=null};
 },[]);
 useEffect(()=>{if(!map.current||!markers.current)return;
  let active=true;async function draw(){const L=await import("leaflet");if(!active||!markers.current)return;markers.current.clearLayers();
   for(const p of prospects){if(p.latitude==null||p.longitude==null)continue;
    const marker=L.marker([p.latitude,p.longitude],{icon:L.divIcon({html:`<span class="ps-map-pin ${p.id===selected?"ps-map-pin-active":""}"><strong>${Math.round(p.score)}</strong></span>`,className:"ps-map-icon",iconSize:[48,50],iconAnchor:[24,49]})});
    marker.on("click",()=>selectedRef.current(p.id));marker.addTo(markers.current);
   }
  }void draw();return()=>{active=false}
 },[prospects,selected,loaded]);
 useEffect(()=>{if(!map.current)return;const p=prospects.find(p=>p.id===selected);if(p?.latitude!=null&&p.longitude!=null)map.current.flyTo([p.latitude,p.longitude],Math.max(map.current.getZoom(),13),{duration:0.7});},[selected,prospects]);
 useEffect(()=>{if(zoomTo&&map.current)map.current.flyTo([zoomTo.lat,zoomTo.lng],13,{duration:.8})},[zoomTo]);
 const located=prospects.filter(p=>p.latitude!=null&&p.longitude!=null);
 return <div className="absolute inset-0 z-0 overflow-hidden bg-[#eef1eb] dark:bg-[#141b20]">
  <div ref={element} className="h-full w-full" aria-label="Map of verified prospect locations"/>
  {!loaded&&<div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-foreground">Loading geographic workspace…</div>}
  <div className="pointer-events-none absolute bottom-5 right-4 z-[400] flex flex-col gap-2 sm:right-5">
   <div className="pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-border bg-card/95 shadow-lg backdrop-blur-xl">
    <button aria-label="Zoom in" onClick={()=>map.current?.zoomIn()} className="grid size-10 place-items-center hover:bg-accent"><Plus size={17}/></button>
    <div className="border-t border-border"/><button aria-label="Zoom out" onClick={()=>map.current?.zoomOut()} className="grid size-10 place-items-center hover:bg-accent"><Minus size={17}/></button>
    <div className="border-t border-border"/><button aria-label="Fit to prospects" onClick={async()=>{const L=await import("leaflet");if(map.current){if(located.length){map.current.fitBounds(L.latLngBounds(located.map(p=>[p.latitude!,p.longitude!] as [number,number])),{padding:[120,130],maxZoom:15})}else map.current.setView([44.9778,-93.2650],12)}}} className="grid size-10 place-items-center hover:bg-accent"><LocateFixed size={17}/></button>
   </div>
  </div>
  <div className="pointer-events-none absolute bottom-5 left-4 z-[400] hidden rounded-xl border border-border/70 bg-card/90 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur-xl sm:block">
    <span className="inline-flex items-center gap-2"><MapPin size={12} className="text-primary"/> {located.length} mapped · {prospects.length-located.length} awaiting coordinates</span>
  </div>
 </div>;
}
