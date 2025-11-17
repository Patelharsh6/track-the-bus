// server.js
// Merged backend: keeps your MQTT + WS logic; adds routes/stops/ETA/nearest/stop-info + admin mapping
// Run: npm install express cors ws mqtt body-parser
// Start: node server.js

import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";
import mqtt from "mqtt";
import bodyParser from "body-parser";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = 4000;

/* -------------------------
   Your original MQTT setup
--------------------------*/
const MQTT_URL = "mqtt://test.mosquitto.org:1883";
const client = mqtt.connect(MQTT_URL);

let vehicleData = {}; // { vehicle_id: { ...lastTelemetry } }

client.on("connect", () => {
  console.log("✅ Backend connected to MQTT");
  client.subscribe("vehicles/+/telemetry");
});

client.on("message", (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());
    const id = data.vehicle_id;
    // Preserve original payload in vehicleData
    vehicleData[id] = {
      ...vehicleData[id],
      ...data,
      lastSeen: Date.now(),
    };

    // Broadcast original payload to WS clients (so existing frontend code works)
    broadcastWS({ type: "telemetry", ...data });

    // Also update derived fields used by REST (route mapping etc)
    // We'll enrich vehicleData below with mapping when requested via REST

    console.log("📡 MQTT →", data);
  } catch (e) {
    console.log("❌ JSON Parse Error:", payload.toString());
  }
});

/* -------------------------
   WebSocket Broadcast Helper
--------------------------*/
function broadcastWS(obj) {
  const text = JSON.stringify(obj);
  wss.clients.forEach((c) => {
    if (c.readyState === 1) c.send(text);
  });
}

wss.on("connection", (ws) => {
  console.log("🔌 WebSocket client connected");
  // Send current vehicles snapshot
  Object.values(vehicleData).forEach((v) => {
    ws.send(JSON.stringify({ type: "telemetry", ...v }));
  });
});

/* -------------------------
   Application data (mock / editable)
--------------------------*/

/*
 ROUTES: keep shape & stops. Replace stops with real stops later.
 Each stop: { id, name, lat, lon, seq }
*/
const ROUTES = {
  R1: {
    id: "R1",
    name: "Lal Darwaja → Vijay Cross",
    stops: [
      { id: "S1", name: "Lal Darwaja", lat: 23.0225, lon: 72.5714, seq: 0 },
      { id: "S2", name: "Income Tax", lat: 23.0300, lon: 72.5800, seq: 1 },
      { id: "S3", name: "Navrangpura", lat: 23.0355, lon: 72.5900, seq: 2 },
      { id: "S4", name: "Vijay Cross", lat: 23.0402, lon: 72.6000, seq: 3 },
    ],
  },
};

/*
 VEHICLE→ROUTE MAP
 If telemetry doesn't include route_id, map vehicle to route here.
 Edit manually or use admin endpoints below.
*/
let VEHICLE_ROUTE_MAP = {
  "BUS-001": "R1",
  "BUS-101": "R1",
  "BUS-102": "R1",
  "BUS-103": "R1",
};

/* -------------------------
   Utilities
--------------------------*/

function toRad(deg) {
  return (deg * Math.PI) / 180;
}
function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

// Haversine distance (km)
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Bearing from A to B (0..360)
function bearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// ETA minutes from bus to stop (approx using straight-line / speed)
function etaMinutes(bus, stop) {
  const dist = haversineKm(bus.lat, bus.lon, stop.lat, stop.lon); // km
  const speed = Math.max(bus.speed_kmph || 10, 8); // avoid divide by zero; assume slow min speed
  const hours = dist / speed;
  return Math.max(1, Math.round(hours * 60));
}

// Determine if bus is approaching a stop: angle check + distance logic
function isApproaching(bus, stop) {
  // If distance is small, treat as arrived / approaching
  const dist = haversineKm(bus.lat, bus.lon, stop.lat, stop.lon);
  if (dist < 0.05) return true; // within 50m -> approaching/arrived

  // If heading available, check bearing difference
  if (typeof bus.heading === "number") {
    const brg = bearing(bus.lat, bus.lon, stop.lat, stop.lon);
    let diff = Math.abs(brg - bus.heading);
    if (diff > 180) diff = 360 - diff;
    return diff <= 90; // within 90 degrees roughly heading towards stop
  }
  // fallback: use simple rule - if stop is ahead in route sequence (handled elsewhere), assume approaching
  return true;
}

/* -------------------------
   Core: find route for vehicle
--------------------------*/
function getRouteForVehicle(vehicleId) {
  // 1) check if telemetry includes routeId
  const telemetry = vehicleData[vehicleId];
  if (telemetry && telemetry.routeId) return telemetry.routeId;
  // 2) check mapping table
  if (VEHICLE_ROUTE_MAP[vehicleId]) return VEHICLE_ROUTE_MAP[vehicleId];
  // 3) unknown
  return null;
}

/* -------------------------
   REST APIs
--------------------------*/

// GET /latest -> all raw telemetry (your original endpoint)
app.get("/latest", (req, res) => {
  res.json(vehicleData);
});

// GET /buses -> list vehicle IDs
app.get("/buses", (req, res) => {
  res.json(Object.keys(vehicleData));
});

// GET /routes -> list routes
app.get("/routes", (req, res) => {
  res.json(Object.values(ROUTES));
});

// GET /stops -> list all stops across routes
app.get("/stops", (req, res) => {
  const stops = [];
  Object.values(ROUTES).forEach((r) =>
    r.stops.forEach((s) => stops.push({ ...s, routeId: r.id }))
  );
  res.json(stops);
});

// GET /nearest-stop?lat=..&lon=..
app.get("/nearest-stop", (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({ error: "lat & lon required" });
  }

  let best = null;
  Object.values(ROUTES).forEach((r) =>
    r.stops.forEach((s, idx) => {
      const d = haversineKm(lat, lon, s.lat, s.lon);
      if (!best || d < best.dist) {
        best = { stop: s, routeId: r.id, idx, dist: d };
      }
    })
  );
  if (!best) return res.status(404).json({ error: "no stops" });

  // walk time
  const walkMin = Math.max(1, Math.round((best.dist / 5) * 60)); // walking 5 km/h
  res.json({
    stop: best.stop,
    routeId: best.routeId,
    distance_km: best.dist,
    walk_minutes: walkMin,
  });
});

// GET /stop/:stopId?dest=DESTID -> info about specific stop + buses with status/eta
app.get("/stop/:stopId", (req, res) => {
  const stopId = req.params.stopId;
  const destId = req.query.dest || null;

  // find this stop and its route
  let found = null;
  Object.values(ROUTES).forEach((r) => {
    r.stops.forEach((s, idx) => {
      if (s.id === stopId) found = { route: r, stop: s, idx };
    });
  });
  if (!found) return res.status(404).json({ error: "stop not found" });

  const route = found.route;
  const stop = found.stop;
  const stopIdx = found.idx;

  // find all vehicles mapped to this route
  const vehiclesOnRoute = Object.keys(vehicleData).filter((vid) => {
    const rId = getRouteForVehicle(vid);
    return rId === route.id;
  });

  // for each vehicle compute eta to stop, status coming/gone, and ETA to dest if dest provided
  const buses = vehiclesOnRoute.map((vid) => {
    const bus = vehicleData[vid];
    const eta_to_stop = etaMinutes(bus, stop);
    const approaching = isApproaching(bus, stop);
    const status = approaching ? "coming" : "gone";

    let eta_to_dest = null;
    if (destId) {
      const dest = route.stops.find((s) => s.id === destId);
      if (dest) eta_to_dest = etaMinutes(bus, dest);
    }

    return {
      vehicle_id: vid,
      lat: bus.lat,
      lon: bus.lon,
      speed_kmph: bus.speed_kmph,
      heading: bus.heading || null,
      eta_to_stop_minutes: eta_to_stop,
      status,
      eta_to_dest_minutes: eta_to_dest,
      lastSeen: bus.lastSeen || null,
      // include departure times if you have them mapped externally (vehicleData may include these fields)
      forward_departure: bus.forward_departure || null,
      reverse_departure: bus.reverse_departure || null,
    };
  });

  // sort: coming first by ETA ascending
  buses.sort((a, b) => {
    if (a.status === b.status) return a.eta_to_stop_minutes - b.eta_to_stop_minutes;
    return a.status === "coming" ? -1 : 1;
  });

  res.json({
    stop,
    routeId: route.id,
    buses,
  });
});

/* -------------------------
   Admin endpoints to manage mapping & routes (simple)
--------------------------*/

// Set vehicle->route mapping
app.post("/admin/map-vehicle", (req, res) => {
  const { vehicle_id, routeId } = req.body;
  if (!vehicle_id || !routeId) return res.status(400).json({ error: "vehicle_id & routeId required" });
  VEHICLE_ROUTE_MAP[vehicle_id] = routeId;
  return res.json({ ok: true, VEHICLE_ROUTE_MAP });
});

// Add a route (simple append)
app.post("/admin/add-route", (req, res) => {
  const { id, name, stops } = req.body;
  if (!id || !stops) return res.status(400).json({ error: "id & stops required" });
  ROUTES[id] = { id, name: name || id, stops };
  return res.json({ ok: true, route: ROUTES[id] });
});

/* -------------------------
   Start server
--------------------------*/
server.listen(PORT, () => {
  console.log(`🌍 Backend running → http://localhost:${PORT}`);
});
