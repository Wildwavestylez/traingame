#!/usr/bin/env node
import fs from "node:fs/promises";

const OVERPASS_ENDPOINTS = ["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter"];
const BATCH_SIZE = 10;
const GAME_PATH = new URL("../game.html", import.meta.url);
const OUT_DIR = new URL("../data/geometry/", import.meta.url);

const toRad = v => v * Math.PI / 180;
function distanceKm(a,b){
  const R=6371,dLat=toRad(b.lat-a.lat),dLon=toRad(b.lon-a.lon),lat1=toRad(a.lat),lat2=toRad(b.lat);
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
class MinHeap{
  constructor(){this.a=[]}
  push(item,p){this.a.push({item,p});let i=this.a.length-1;while(i){const q=Math.floor((i-1)/2);if(this.a[q].p<=p)break;[this.a[q],this.a[i]]=[this.a[i],this.a[q]];i=q}}
  pop(){if(!this.a.length)return null;const r=this.a[0],x=this.a.pop();if(this.a.length){this.a[0]=x;let i=0;for(;;){let l=i*2+1,rn=l+1,s=i;if(l<this.a.length&&this.a[l].p<this.a[s].p)s=l;if(rn<this.a.length&&this.a[rn].p<this.a[s].p)s=rn;if(s===i)break;[this.a[i],this.a[s]]=[this.a[s],this.a[i]];i=s}}return r}
}
const key=p=>`${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;
function buildGraph(elements){
  const nodes=new Map(),edges=new Map(),add=p=>{const id=key(p);if(!nodes.has(id)){nodes.set(id,{id,lat:p.lat,lon:p.lon});edges.set(id,[])}return id};
  for(const way of elements){if(!way.geometry||way.geometry.length<2)continue;for(let i=1;i<way.geometry.length;i++){const a=way.geometry[i-1],b=way.geometry[i],ai=add(a),bi=add(b),w=distanceKm(a,b);edges.get(ai).push({to:bi,weight:w});edges.get(bi).push({to:ai,weight:w})}}
  return {nodes,edges};
}
function nearestNode(graph,station){
  let best=null,d=Infinity;
  for(const n of graph.nodes.values()){const x=distanceKm({lat:station.latitude,lon:station.longitude},n);if(x<d){d=x;best=n}}
  if(!best||d>2)throw new Error(`No railway node within 2 km of ${station.name} (nearest ${d.toFixed(2)} km)`);
  return best;
}
function shortest(graph,start,end){
  const h=new MinHeap(),dist=new Map([[start,0]]),prev=new Map();h.push(start,0);
  while(h.a.length){const cur=h.pop();if(cur.item===end)break;if(cur.p!==dist.get(cur.item))continue;for(const e of graph.edges.get(cur.item)||[]){const nd=cur.p+e.weight;if(nd<(dist.get(e.to)??Infinity)){dist.set(e.to,nd);prev.set(e.to,cur.item);h.push(e.to,nd)}}}
  if(!dist.has(end))return null;const ids=[];let c=end;while(c!==undefined){ids.push(c);if(c===start)break;c=prev.get(c)}if(ids.at(-1)!==start)return null;return ids.reverse().map(id=>graph.nodes.get(id));
}
async function overpass(query){
  let lastError=null;
  for(const endpoint of OVERPASS_ENDPOINTS){
    try{
      const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","User-Agent":"Wildwavestylez-traingame-geometry-import/1.0"},body:new URLSearchParams({data:query})});
      if(!response.ok)throw new Error(`Overpass HTTP ${response.status}`);
      return await response.json();
    }catch(error){lastError=error;console.log(`Endpoint failed: ${endpoint} — ${error.message}`);}
  }
  throw lastError||new Error("All Overpass endpoints failed");
}
function parseRoutes(html){
  const routes=[];
  const nameRe=/name:\s*["']Trať\s+([^"']+)["']/g;
  let m;
  while((m=nameRe.exec(html))){
    const raw=m[1].trim();
    const idMatch=raw.match(/^(\d+[a-z]?)/i);
    if(!idMatch)continue;
    const routeId=idMatch[1];
    const stopsStart=html.indexOf("stops:",m.index);
    if(stopsStart<0)continue;
    const rest=html.slice(stopsStart);
    const blockMatch=rest.match(/stops:\s*\[\s*([\s\S]*?)\n\s*\]\s*,/);
    if(!blockMatch)continue;
    const block=blockMatch[1];
    const stops=[];
    const stopRe=/\{\s*name:\s*["']([^"']+)["']\s*,\s*location:\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/g;
    let s;
    while((s=stopRe.exec(block)))stops.push({name:s[1],latitude:Number(s[2]),longitude:Number(s[3])});
    if(stops.length>=2)routes.push({routeId,raw,stops});
  }
  return routes;
}
const html=await fs.readFile(GAME_PATH,"utf8");
const all=parseRoutes(html);
const seen=new Set(),batch=[];
for(const r of all){if(seen.has(r.routeId)||r.routeId==="198")continue;seen.add(r.routeId);batch.push(r);if(batch.length===BATCH_SIZE)break;}
if(!batch.length)throw new Error("No routes selected for geometry batch.");
console.log("Selected batch:",batch.map(r=>r.routeId).join(", "));

const refs=batch.map(r=>r.routeId);
const refPattern=refs.join("|");
const relData=await overpass(`[out:json][timeout:60];relation["route"="train"]["ref"~"^(${refPattern})$"];out tags;`);
const relations=new Map();
for(const el of relData.elements||[]){
  const ref=(el.tags?.ref||"").trim();
  if(refs.includes(ref)&&!relations.has(ref))relations.set(ref,{id:el.id,tags:el.tags||{}});
}
console.log("Matched OSM relations:",[...relations.entries()].map(([r,v])=>`${r}=${v.id}`).join(", ")||"none");

await fs.mkdir(OUT_DIR,{recursive:true});
const failures=[];
for(const route of batch){
  const rel=relations.get(route.routeId);
  if(!rel){failures.push(`${route.routeId}: no OSM train relation with matching ref`);continue;}
  try{
    const data=await overpass(`[out:json][timeout:60];relation(${rel.id});way(r);out geom;`);
    const ways=(data.elements||[]).filter(e=>e.type==="way");
    const graph=buildGraph(ways),path=[];
    for(let i=1;i<route.stops.length;i++){
      const a=nearestNode(graph,route.stops[i-1]),b=nearestNode(graph,route.stops[i]),segment=shortest(graph,a.id,b.id);
      if(!segment)throw new Error(`No railway path between ${route.stops[i-1].name} and ${route.stops[i].name}`);
      if(!path.length)path.push(...segment);else path.push(...segment.slice(1));
    }
    const distance=path.slice(1).reduce((s,p,i)=>s+distanceKm(path[i],p),0);
    const result={routeId:route.routeId,relationId:rel.id,source:`OpenStreetMap relation ${rel.id} via Overpass API`,osmRef:route.routeId,distanceKm:Number(distance.toFixed(3)),coordinates:path.map(p=>[Number(p.lat.toFixed(7)),Number(p.lon.toFixed(7))])};
    const out=new URL(`route-${route.routeId}.json`,OUT_DIR);
    await fs.writeFile(out,JSON.stringify(result,null,2)+"\n");
    console.log(`OK route ${route.routeId}: relation ${rel.id}, ${result.distanceKm} km, ${result.coordinates.length} points`);
  }catch(error){failures.push(`${route.routeId}: ${error.message}`);console.log(`FAILED route ${route.routeId}: ${error.message}`);}
}
if(failures.length){console.log("Failures:");for(const f of failures)console.log(" -",f);}
console.log(`Batch complete: ${batch.length-failures.length}/${batch.length} routes generated.`);
