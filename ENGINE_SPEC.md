# TrainGame Engine Specification

**Status:** Architecture baseline  
**Purpose:** Define the new TrainGame engine before legacy data and UI are migrated.

---

## 1. Project Goal

TrainGame is a railway tycoon/simulation game built on a real-world railway network.

The game combines:

- real railway stations and geography
- real railway routes
- real train types and photographs
- player-created passenger services
- freight operations
- an expanding player network
- an economy driven by actual transport activity

The new engine must preserve the valuable railway data already collected in the legacy project while separating that data from game logic.

The legacy HTML files are treated as historical/reference material. They must not be destroyed during migration.

---

## 2. Core Design Principles

### 2.1 Simulate transport, not individual people

Passenger demand is represented by aggregated flows rather than one JavaScript object per passenger.

Example:

```
Čkyně → Volyně: 3
Čkyně → Vimperk: 4
Čkyně → Písek: 2
```

This gives the player useful information without creating unnecessary simulation load.

### 2.2 Static world data is separate from runtime state

The complete railway world can contain thousands of stations and routes.

Only the player's active/unlocked network needs to participate in the live simulation.

### 2.3 A railway route is not the same thing as a player service

A real railway route describes infrastructure/geography.

A player-created line/service describes how the player's trains operate over that infrastructure.

A service may cross multiple real routes.

Example:

```
Strakonice → Volary → Strakonice → Blatná
```

### 2.4 Individual vehicles are separate from vehicle types

A vehicle type describes what a train is capable of.

A vehicle instance represents one actual unit.

Example:

```
VehicleType: 810
VehicleInstance: 810 #123
```

The individual unit can be reassigned between player services.

### 2.5 Visualization is separate from simulation

The engine does not need to calculate train physics every rendered frame.

The simulation can know:

```
810 #123
Strakonice → Radošovice
departure: 12:00
arrival: 12:07
```

The map/UI interpolates the displayed position.

### 2.6 The engine must scale

The architecture must support:

- a small local network
- multiple regions
- multiple countries
- many active trains
- passenger transfers
- freight transfers

without simulating inactive parts of Europe at full resolution.

---

# 3. High-Level Architecture

```
GAME ENGINE
│
├── Railway World
│   ├── Countries
│   ├── Stations
│   ├── Routes
│   ├── Track Sections
│   └── Hubs
│
├── Vehicles
│   ├── Vehicle Types
│   └── Vehicle Instances
│
├── Passenger System
│   ├── Demand
│   ├── Passenger Flows
│   └── Transfers
│
├── Freight System
│   ├── Cargo Production
│   ├── Cargo Jobs
│   ├── Wagons
│   └── Freight Hubs
│
├── Operations
│   ├── Player Lines
│   ├── Services
│   ├── Timetables
│   └── Vehicle Duties / Oběhy
│
├── Economy
│   ├── Revenue
│   ├── Costs
│   ├── Vehicle Purchase
│   └── Station/Network Costs
│
└── Player Progress
    ├── Licences
    ├── Station Unlocks
    ├── Network
    ├── Tasks
    └── Expansion
```

UI is a consumer of engine state, not the owner of the simulation logic.

---

# 4. Core Data Model

## 4.1 Station

A station is a real-world railway location.

Minimum fields:

```js
{
  id,
  name,
  country,
  lat,
  lon,
  importance,
  population,
  characteristics,
  routeIds,
  unlocked
}
```

Possible characteristics:

- residential
- employment
- school
- tourism
- industry
- interchange
- freight
- major hub

The data model must allow additional attributes later without breaking existing data.

---

## 4.2 Route

A route represents a real railway line/route from the source dataset.

```js
{
  id,
  name,
  country,
  category,
  stationIds,
  electrification,
  metadata
}
```

A route can contain many stations.

Route data is world data. It does not automatically mean the player owns or operates it.

---

## 4.3 Track Section

A track section represents the connection between two adjacent railway stations.

```js
{
  id,
  routeId,
  fromStationId,
  toStationId,
  distanceKm,
  travelTime,
  properties
}
```

This becomes the basic network edge for pathfinding and train movement.

If a real-world route contains:

```
A → B → C → D
```

the engine should be able to represent:

```
A-B
B-C
C-D
```

as separate sections.

---

## 4.4 Licence

A licence gives the player permission to operate on a route/network area.

Buying a licence does **not** automatically unlock every station.

```js
{
  id,
  routeId,
  ownerId,
  purchased,
  price
}
```

---

## 4.5 Station Unlock

Stations are progressively activated by the player.

Example:

1. Buy route 198 licence.
2. Unlock Strakonice.
3. Unlock Radošovice.
4. Unlock Přední Zborovice.
5. Continue expanding toward Volary.

Locked stations remain in world data but do not need active passenger/cargo simulation.

```js
{
  stationId,
  unlocked,
  unlockCost,
  unlockedAt
}
```

Unlock cost may depend on:

- distance
- station importance
- population
- demand potential
- network position

---

# 5. Player-Created Lines

A player line is an operating service created from the real railway network.

Example:

```
Strakonice → Radošovice → Přední Zborovice → Čkyně → Vimperk
```

A line can:

- cross multiple real routes
- contain multiple branches
- be asymmetric
- be extended later
- be operated by one or more vehicle duties

```js
{
  id,
  name,
  stationIds,
  sections,
  direction,
  frequency,
  assignedVehicles
}
```

The player does not manually move every train every second.

The player defines the service; the operations system runs it.

---

# 6. Vehicle System

## 6.1 Vehicle Type

Describes a class/model.

Example:

```js
{
  id: "810",
  name: "810",
  category: "regional",
  capacity: 55,
  maxSpeed: 80,
  traction: "diesel",
  purchasePrice,
  operatingCost,
  image
}
```

Later fields may include:

- acceleration
- braking
- length
- weight
- accessibility
- reliability
- maintenance interval
- electrification requirements

---

## 6.2 Vehicle Instance

Represents one actual train/unit owned by the player.

```js
{
  id,
  vehicleTypeId,
  number,
  condition,
  mileage,
  currentStationId,
  currentSectionId,
  assignedDutyId,
  status
}
```

Possible statuses:

- depot
- waiting
- running
- loading
- unloading
- maintenance
- idle

Example:

```
810 #123
currently: Vimperk
assigned: Strakonice–Volary duty
condition: 87%
```

The exact real-world current assignment of a unit does not need to be perfectly modeled initially. The engine must support the concept so realistic assignments can be added later.

---

# 7. Vehicle Duties / Oběhy

A duty is the operational plan for one vehicle over time.

This is more important than simply assigning a train to a line.

Example:

```
810 #123

06:00 Strakonice → Volary
08:10 Volary → Strakonice
10:30 Strakonice → Blatná
12:00 Blatná → Strakonice
14:00 Strakonice → Volary
...
```

This allows a single physical train to serve multiple player lines during the day.

A duty may therefore be longer and more complex than one line.

---

# 8. Train Movement

The simulation should use scheduled movement segments.

```js
{
  vehicleId,
  fromStationId,
  toStationId,
  departureTime,
  arrivalTime,
  status
}
```

The engine advances the movement according to simulation time.

The UI calculates/interpolates the train's visual position.

This avoids expensive per-frame simulation.

---

# 9. Passenger Demand

Stations generate aggregate passenger demand.

Demand can be influenced by:

- population
- employment
- schools
- tourism
- station importance
- time of day
- network connectivity
- nearby destinations

Example:

```
Čkyně

→ Volyně: 3
→ Vimperk: 4
→ Písek: 2
```

The engine should not create nine passenger objects.

It creates passenger flow quantities.

---

# 10. Passenger Flow

A passenger flow represents a group of passengers with the same current transport goal.

```js
{
  id,
  originStationId,
  destinationStationId,
  currentStationId,
  passengers,
  status
}
```

The flow may require multiple trains and transfers.

Example:

```
Volary
  ↓
Vimperk
  ↓
Volyně
  ↓
Strakonice
  ↓
Písek
```

The same flow can therefore move through several services.

---

# 11. Passenger Boarding

At each station, the engine evaluates:

1. passengers waiting
2. train destination/path
3. available capacity
4. whether the train serves the required next part of the journey

Only compatible passenger flows board.

Example:

Train:

```
Čkyně → Volyně → Strakonice
```

Waiting:

```
3 → Volyně
4 → Vimperk
2 → Písek
```

The train can board the Volyně flow and appropriate onward flows if the network/path allows it.

---

# 12. Transfers

Transfers are first-class behavior.

A passenger does not require a direct train.

Example:

```
Volary → Strakonice → České Budějovice
```

At Strakonice:

- the first train unloads the flow
- the flow becomes waiting demand
- another compatible service can board it

The player should be able to see this demand at the station.

Example UI:

```
STRakonice — waiting

12 → České Budějovice
 7 → Písek
 3 → Blatná
```

---

# 13. Pathfinding

The passenger system needs a network pathfinder.

It should operate on:

- unlocked stations
- unlocked track sections
- player-operated services

The first implementation can use a simple graph search.

Later it can consider:

- travel time
- transfers
- frequency
- waiting time
- capacity
- service quality

Pathfinding should be cached where possible.

---

# 14. Freight System

Freight uses the same railway network but a different demand model.

A freight shipment is represented as a job.

```js
{
  id,
  originStationId,
  destinationStationId,
  cargoType,
  weight,
  currentStationId,
  status
}
```

Do not create unnecessary individual wagon objects for every shipment.

---

# 15. Freight Flow

Basic freight lifecycle:

```
origin
  ↓
local collection
  ↓
freight hub
  ↓
long-distance service
  ↓
freight hub
  ↓
local distribution
  ↓
destination
```

Example:

```
Strakonice

2 wagons → Břeclav
3 wagons → Vyškov
2 wagons → Uherské Hradiště
2 wagons → Havlíčkův Brod
2 wagons → Dačice
```

A suitable long-distance train can collect compatible shipments within its capacity.

---

# 16. Freight Hubs

A hub is a location where freight can be consolidated and redistributed.

Hubs can represent:

- real railway yards
- major stations
- abstract/local freight hubs

The first implementation should not require every real yard in Europe to be modeled perfectly.

The system must support both real and abstract hubs.

---

# 17. Wagons

Wagons can later be modeled at two levels:

### Aggregate freight

Used for most simulation.

```
11 wagons
330 tonnes
destination: Brno
```

### Individual wagon instances

Used when the player owns/manages rolling stock individually.

```
Wagon #12345
type: Eas
weight: ...
currentHub: Strakonice
```

The engine should support individual wagons without requiring every shipment to become an individual object.

---

# 18. Locomotive Roles

The freight system should eventually distinguish operational roles:

- local shunting/collection
- regional freight
- long-distance freight

Example:

```
742 → local collection
749 → regional freight
long-distance electric locomotive → mainline freight
```

Electrification restrictions can be added after the basic freight system works.

---

# 19. Economy

The economy converts transport activity into player progression.

Revenue can come from:

- passenger fares
- freight transport
- completed contracts/tasks

Costs can include:

- vehicle purchase
- vehicle operation
- maintenance
- route licences
- station unlocking
- other infrastructure/network costs

The economy must remain data-driven rather than hardcoded throughout the UI.

---

# 20. Network Progression

Progression is based on network expansion rather than arbitrary game levels.

The basic loop is:

```
Licence
 ↓
Unlock station
 ↓
Operate service
 ↓
Generate demand
 ↓
Earn money
 ↓
Unlock more stations
 ↓
Buy/reassign vehicles
 ↓
Expand service
 ↓
Reach new routes/regions
```

Expansion into new countries should emerge naturally from network connectivity and available licences rather than a simple “Level 5 = Germany” rule.

---

# 21. Active Simulation Scope

The complete world dataset may contain a very large number of stations.

Only the following need active simulation:

- unlocked stations
- relevant connected routes
- active player services
- active passenger flows
- active freight jobs
- owned vehicles

Locked world data remains static.

This is a core performance requirement.

---

# 22. Simulation Clock

The simulation should use a logical game clock.

The engine should process meaningful events rather than performing expensive work every rendered frame.

Examples of simulation events:

- train departure
- train arrival
- passenger generation
- passenger boarding
- passenger transfer
- freight loading
- freight unloading
- maintenance
- economy transaction

The exact tick interval can be chosen during implementation/testing.

Rendering remains independent of the simulation tick.

---

# 23. Separation of Concerns

The following must remain separate:

### World data

What exists in the real railway world.

### Player state

What the player has bought/unlocked.

### Runtime state

What trains, passengers and freight are doing now.

### Presentation

What the player sees.

This separation is one of the main goals of the rewrite.

---

# 24. Proposed Repository Structure

Target structure:

```
traingame/
│
├── index.html
│
├── css/
│   ├── main.css
│   └── ...
│
├── js/
│   ├── main.js
│   ├── engine/
│   │   ├── GameEngine.js
│   │   ├── SimulationClock.js
│   │   ├── Network.js
│   │   ├── PassengerSystem.js
│   │   ├── FreightSystem.js
│   │   ├── VehicleSystem.js
│   │   ├── OperationsSystem.js
│   │   ├── EconomySystem.js
│   │   └── ProgressSystem.js
│   │
│   ├── map/
│   ├── ui/
│   └── ...
│
├── data/
│   ├── countries/
│   │   ├── cz/
│   │   ├── sk/
│   │   ├── de/
│   │   └── ...
│   ├── stations/
│   ├── routes/
│   ├── trains/
│   └── freight/
│
├── tools/
│   └── import-legacy-data.js
│
├── legacy/
│   ├── game.html
│   ├── open.html
│   ├── test.html
│   └── ...
│
└── ENGINE_SPEC.md
```

The exact final folder structure may evolve during implementation.

---

# 25. Legacy Data Migration

The existing railway dataset is valuable and must be preserved.

Migration strategy:

1. Preserve original files.
2. Extract railway data.
3. Normalize stations.
4. Normalize routes.
5. Normalize train types.
6. Convert legacy data into structured JSON.
7. Validate duplicates and coordinates.
8. Connect routes to shared station entities.
9. Load the new data into the engine.
10. Only then retire legacy runtime code.

The importer should be reusable so additional historical data can be processed later.

Legacy data must not be silently discarded because it contains manually collected information.

---

# 26. Data Quality

Migration must distinguish between:

- confirmed real data
- legacy data
- placeholder data
- generated gameplay data

Suspicious legacy values must not automatically be “corrected” without understanding their original purpose.

Examples of issues that may exist in legacy data:

- duplicate trains
- placeholder coordinates
- unrealistic speed/price values
- duplicate station names
- inconsistent naming

These should be logged and reviewed during migration.

---

# 27. First Vertical Slice

Before importing the whole railway network, the engine should work on one small real network.

Suggested test area:

```
Strakonice
↓
Radošovice
↓
Přední Zborovice
↓
Strunkovice
↓
Čkyně
↓
Vimperk
↓
Volary
```

The vertical slice must demonstrate:

1. route licence purchase
2. station unlocking
3. vehicle purchase
4. player-created service
5. vehicle duty
6. train movement
7. passenger generation
8. passenger boarding
9. passenger alighting
10. transfer demand
11. revenue
12. station expansion
13. vehicle reassignment

If this works, the architecture has proven the core gameplay loop.

---

# 28. Development Order

Recommended implementation order:

### Phase 1 — Engine foundation

- project structure
- data loading
- simulation clock
- core entities
- state management

### Phase 2 — Railway network

- stations
- routes
- track sections
- network graph
- pathfinding

### Phase 3 — Player progression

- licences
- station unlocking
- economy basics

### Phase 4 — Vehicles

- vehicle types
- vehicle instances
- purchase
- assignment
- movement

### Phase 5 — Passenger simulation

- demand generation
- flows
- boarding
- alighting
- transfers

### Phase 6 — Operations

- player lines
- services
- duties/oběhy
- schedules/frequency

### Phase 7 — Freight

- cargo jobs
- wagons
- freight hubs
- collection/distribution

### Phase 8 — UI and map

- map
- train markers
- station UI
- demand UI
- finance UI
- operations UI

### Phase 9 — Legacy data migration

- import the existing railway dataset
- validation
- country expansion

### Phase 10 — Polish

- balancing
- performance
- mobile UX
- visual improvements
- tasks/objectives
- additional countries

---

# 29. Non-Goals for the First Version

Do not overbuild these before the core loop works:

- individual human passenger simulation
- perfect real-world train circulation data
- full railway signaling simulation
- realistic physics
- every real freight yard in Europe
- complex production chains
- multiplayer
- backend infrastructure

These can be added later.

---

# 30. Success Criteria

The rewrite is successful when the following scenario works without legacy game logic:

> A player starts at a real station, buys access to a real railway route, unlocks stations progressively, buys a real train type, creates a service, assigns a specific vehicle, passengers generate real destination flows, passengers can transfer between services, the train earns money, and the player uses that money to expand the network.

The engine must accomplish this while keeping world data, simulation state, player state and presentation independent.

---

# 31. Guiding Principle

**Build the railway engine first. Build the game around it second.**

The real-world railway data is the foundation.

The player network is the strategy layer.

Passenger and freight flows are the living simulation.

Vehicles are the tools.

The economy turns operations into progression.

The map is the window into the world.

