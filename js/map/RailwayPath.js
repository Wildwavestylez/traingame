export async function loadRailwayPath(routeId = "198") {
  const response = await fetch(`./data/geometry/route-${routeId}.json`);
  if (!response.ok) throw new Error(`Stored railway geometry unavailable: HTTP ${response.status}`);
  return response.json();
}
