#!/usr/bin/env node
import fs from "node:fs/promises";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const RELATION_ID = 48873;
const inputPath = new URL("../data/demo-route-198.json", import.meta.url);
const outputPath = new URL("../data/geometry/route-198.json", import.meta.url);

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
const source=JSON.parse(await fs.readFile(inputPath,"utf8")),stations=source.route.stops;
const query=`[out:json][timeout:60];relation(${RELATION_ID});way(r);out geom;`;
console.log("Fetching OSM geometry for relation",RELATION_ID);
const response=await fetch(`${OVERPASS}?data=${encodeURIComponent(query)}`);
if(!response.ok)throw new Error(`Overpass HTTP ${response.status}`);
const data=await response.json(),ways=data.elements.filter(e=>e.type==="way");
console.log("Received",ways.length,"railway ways");
const graph=buildGraph(ways),path=[];
for(let i=1;i<stations.length;i++){
  const a=nearestNode(graph,stations[i-1]),b=nearestNode(graph,stations[i]),segment=shortest(graph,a.id,b.id);
  if(!segment)throw new Error(`No railway path between ${stations[i-1].name} and ${stations[i].name}`);
  if(!path.length)path.push(...segment);else path.push(...segment.slice(1));
}
const distance=path.slice(1).reduce((s,p,i)=>s+distanceKm(path[i],p),0);
const result={routeId:"198",relationId:RELATION_ID,source:"OpenStreetMap relation 48873 via Overpass API",generatedAt:new Date().toISOString(),distanceKm:Number(distance.toFixed(3)),coordinates:path.map(p=>[Number(p.lat.toFixed(7)),Number(p.lon.toFixed(7))])};
await fs.mkdir(new URL("../data/geometry/",import.meta.url),{recursive:true});
await fs.writeFile(outputPath,JSON.stringify(result,null,2)+"\n");
console.log(`Saved ${result.coordinates.length} geometry points, ${result.distanceKm} km`);
