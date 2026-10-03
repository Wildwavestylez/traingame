import { GameEngine } from "./engine/GameEngine.js";
import { loadRailwayPath } from "./map/RailwayPath.js";

const engine = new GameEngine();
const status = document.querySelector("#engine-status");
const stats = document.querySelector("#stats");
const clock = document.querySelector("#clock");
const routeName = document.querySelector("#route-name");
const stations = document.querySelector("#station-list");
const trackStatus = document.querySelector("#track-status");
const map = L.map("map").setView([49.13, 13.84], 11);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:19, attribution:"&copy; OpenStreetMap contributors"}).addTo(map);
L.tileLayer("https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png", {
  maxZoom:19, opacity:.72,
  attribution:'Data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>, Style: <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>'
}).addTo(map);

function stationIcon(){return L.divIcon({className:"station-marker",html:"<span></span>",iconSize:[8,8],iconAnchor:[4,4]})}
const trainIcon=L.divIcon({className:"train-marker",html:"🚆",iconSize:[22,22],iconAnchor:[11,11]});
function render(){
  const s=engine.snapshot();
  status.textContent=s.state.toUpperCase();
  clock.textContent=`Simulace: ${s.simulationSeconds}s | rychlost ${s.speed}×`;
  stats.textContent=`${s.network.stations} stanic · ${s.network.routes} trasa · ${s.network.trackSections} úseků`;
}
function renderStations(route){
  stations.innerHTML="";
  route.stops.forEach((station,index)=>{const li=document.createElement("li");li.textContent=`${String(index+1).padStart(2,"0")}  ${station.name}`;stations.appendChild(li)});
}

const demo=await engine.loadDemo();
const route=demo.network.getRoute("route_rat_trakonice_olary");
routeName.textContent=route.name;
renderStations(route);

const stationMarkers=route.stops.map((station,index)=>L.marker([station.latitude,station.longitude],{icon:stationIcon(),keyboard:false,title:station.name})
  .bindTooltip(`${index+1}. ${station.name}`,{direction:"top",offset:[0,-5]}));
function updateStationVisibility(){
  const visible=map.getZoom()>=10;
  stationMarkers.forEach(m=>{if(visible&&!map.hasLayer(m))m.addTo(map);if(!visible&&map.hasLayer(m))map.removeLayer(m)});
}
updateStationVisibility();map.on("zoomend",updateStationVisibility);

try{
  const result=await loadRailwayPath("198");
  trackStatus.textContent=`Uložená železniční geometrie · ${result.distanceKm.toFixed(1)} km`;
  const line=L.polyline(result.coordinates,{weight:3,opacity:.75,interactive:false}).addTo(map);
  map.fitBounds(line.getBounds(),{padding:[25,25]});
  const trainMarker=L.marker(result.coordinates[0],{icon:trainIcon,zIndexOffset:1000,interactive:false}).addTo(map);
  const speedKmH=60,segmentLengths=[];let totalKm=0;
  for(let i=1;i<result.coordinates.length;i++){
    const a=result.coordinates[i-1],b=result.coordinates[i],dLat=(b[0]-a[0])*111,dLon=(b[1]-a[1])*70,len=Math.sqrt(dLat*dLat+dLon*dLon);
    segmentLengths.push(len);totalKm+=len;
  }
  engine.clock.onTick(seconds=>{
    const cycleSeconds=Math.max(1,totalKm/speedKmH*3600);let target=((seconds%cycleSeconds)/cycleSeconds)*totalKm;
    for(let i=1;i<result.coordinates.length;i++){
      const len=segmentLengths[i-1];
      if(target<=len){const a=result.coordinates[i-1],b=result.coordinates[i],r=len?target/len:0;trainMarker.setLatLng([a[0]+(b[0]-a[0])*r,a[1]+(b[1]-a[1])*r]);break}
      target-=len;
    }
  });
}catch(error){trackStatus.textContent=`Uložená železniční geometrie není dostupná: ${error.message}`;console.error(error)}

document.querySelector("#start").addEventListener("click",()=>engine.start());
document.querySelector("#pause").addEventListener("click",()=>engine.pause());
document.querySelector("#speed").addEventListener("input",e=>engine.setSpeed(Number(e.target.value)));
engine.clock.onTick(()=>render());
render();
