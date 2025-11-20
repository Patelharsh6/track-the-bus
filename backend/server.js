// server.js - FIXED VERSION

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

const PORT = process.env.PORT || 4000;

/* -------------------------
   MQTT Setup with Error Handling
--------------------------*/
const MQTT_URL = "mqtt://test.mosquitto.org:1883";
const client = mqtt.connect(MQTT_URL, {
  reconnectPeriod: 5000,
  connectTimeout: 30000
});

// Initialize vehicle data with better structure
let vehicleData = { 
  "BUS-001": { 
    vehicle_id: "BUS-001", 
    lat: 23.03021, 
    lon: 72.58092, 
    speed_kmph: 22.5, 
    sat: 7, 
    status: "MOVING", 
    heading: 90,
    routeId: "R1",
    lastSeen: Date.now()
  },
  "BUS-002": { 
    vehicle_id: "BUS-002", 
    lat: 23.0280, 
    lon: 72.5850, 
    speed_kmph: 15.0, 
    sat: 5, 
    status: "MOVING", 
    heading: 270,
    routeId: "R2",
    lastSeen: Date.now()
  },
  "BUS-003": { 
    vehicle_id: "BUS-003", 
    lat: 23.0240, 
    lon: 72.5750, 
    speed_kmph: 0, 
    sat: 6, 
    status: "STOPPED", 
    heading: 180,
    routeId: "R1",
    lastSeen: Date.now()
  },
};

// MQTT connection handling
client.on("connect", () => {
  console.log("✅ Backend connected to MQTT");
  client.subscribe("vehicles/+/telemetry", (err) => {
    if (err) console.error("❌ MQTT subscription error:", err);
  });
});

client.on("error", (err) => {
  console.error("❌ MQTT connection error:", err);
});

client.on("message", (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());
    const id = data.vehicle_id;
    
    if (!id) {
      console.warn("⚠️ Received MQTT message without vehicle_id");
      return;
    }

    // Update vehicle data with proper merging
    vehicleData[id] = {
      ...vehicleData[id],
      ...data,
      lastSeen: Date.now(),
      status: data.speed_kmph > 5 ? "MOVING" : "STOPPED"
    };

    // Broadcast to WebSocket clients
    broadcastWS({ type: "telemetry", ...vehicleData[id] });
    console.log("📡 MQTT →", data.vehicle_id, data.lat, data.lon);
  } catch (e) {
    console.error("❌ MQTT message processing error:", e.message);
  }
});

/* -------------------------
   WebSocket with Better Error Handling
--------------------------*/
function broadcastWS(obj) {
  const text = JSON.stringify(obj);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      try {
        client.send(text);
      } catch (err) {
        console.error("❌ WebSocket send error:", err);
      }
    }
  });
}

wss.on("connection", (ws) => {
  console.log("🔌 WebSocket client connected");
  
  // Send current vehicles snapshot
  Object.values(vehicleData).forEach((vehicle) => {
    try {
      ws.send(JSON.stringify({ type: "telemetry", ...vehicle }));
    } catch (err) {
      console.error("❌ WebSocket initial send error:", err);
    }
  });

  ws.on("error", (err) => {
    console.error("❌ WebSocket error:", err);
  });
});

/* -------------------------
   Application Data
--------------------------*/
const ROUTES = {
  R1: {
    id: "R1",
    name: "Lal Darwaja → Vijay Cross",
    color: "#007bff",
    stops: [
      { id: "S1", name: "Lal Darwaja", lat: 23.0225, lon: 72.5714, seq: 0 },
      { id: "S2", name: "Income Tax", lat: 23.0300, lon: 72.5800, seq: 1 },
      { id: "S3", name: "Navrangpura", lat: 23.0355, lon: 72.5900, seq: 2 },
      { id: "S4", name: "Vijay Cross", lat: 23.0402, lon: 72.6000, seq: 3 },
    ],
    path: [
      [23.0225, 72.5714], [23.0250, 72.5750], [23.0300, 72.5800],
      [23.0320, 72.5850], [23.0355, 72.5900], [23.0380, 72.5950],
      [23.0402, 72.6000]
    ]
  },
  R2: {
    id: "R2",
    name: "Ashram Rd → Gandhigram",
    color: "#28a745",
    stops: [
      { id: "A1", name: "RTO Circle", lat: 23.0500, lon: 72.5650, seq: 0 },
      { id: "A2", name: "Gujarat College", lat: 23.0450, lon: 72.5680, seq: 1 },
      { id: "A3", name: "Gandhigram Stn", lat: 23.0400, lon: 72.5720, seq: 2 },
    ],
    path: [
      [23.0500, 72.5650], [23.0480, 72.5660], [23.0450, 72.5680],
      [23.0420, 72.5700], [23.0400, 72.5720]
    ]
  },
};

let VEHICLE_ROUTE_MAP = {
  "BUS-001": "R1",
  "BUS-002": "R2",
  "BUS-003": "R1",
};

/* -------------------------
   Utility Functions
--------------------------*/
function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

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

function bearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function etaMinutes(bus, stop) {
  const dist = haversineKm(bus.lat, bus.lon, stop.lat, stop.lon);
  const speed = Math.max(bus.speed_kmph || 10, 5);
  const hours = dist / speed;
  return Math.max(1, Math.round(hours * 60));
}

function isApproaching(bus, stop) {
  const dist = haversineKm(bus.lat, bus.lon, stop.lat, stop.lon);
  if (dist < 0.05) return true;

  if (typeof bus.heading === "number") {
    const brg = bearing(bus.lat, bus.lon, stop.lat, stop.lon);
    let diff = Math.abs(brg - bus.heading);
    if (diff > 180) diff = 360 - diff;
    return diff <= 90;
  }
  return true;
}

function getRouteForVehicle(vehicleId) {
  const telemetry = vehicleData[vehicleId];
  if (telemetry && telemetry.routeId) return telemetry.routeId;
  if (VEHICLE_ROUTE_MAP[vehicleId]) return VEHICLE_ROUTE_MAP[vehicleId];
  return null;
}

/* -------------------------
   REST APIs with Error Handling
--------------------------*/
app.get("/latest", (req, res) => {
  try {
    res.json(vehicleData);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch vehicle data" });
  }
});

app.get("/buses", (req, res) => {
  try {
    res.json(Object.keys(vehicleData));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch buses" });
  }
});

app.get("/routes", (req, res) => {
  try {
    res.json(Object.values(ROUTES));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch routes" });
  }
});

app.get("/stops", (req, res) => {
  try {
    const stops = [];
    Object.values(ROUTES).forEach((r) =>
      r.stops.forEach((s) => stops.push({ ...s, routeId: r.id }))
    );
    res.json(stops);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stops" });
  }
});

app.get("/nearest-stop", (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return res.status(400).json({ error: "Valid lat & lon required" });
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

    if (!best) return res.status(404).json({ error: "No stops found" });

    const walkMin = Math.max(1, Math.round((best.dist / 5) * 60));
    res.json({
      stop: best.stop,
      routeId: best.routeId,
      distance_km: best.dist,
      distance_m: Math.round(best.dist * 1000),
      walk_minutes: walkMin,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to find nearest stop" });
  }
});

app.get("/stop/:stopId", (req, res) => {
  try {
    const stopId = req.params.stopId;
    const destId = req.query.dest || null;

    let found = null;
    Object.values(ROUTES).forEach((r) => {
      r.stops.forEach((s, idx) => {
        if (s.id === stopId) found = { route: r, stop: s, idx };
      });
    });

    if (!found) return res.status(404).json({ error: "Stop not found" });

    const route = found.route;
    const stop = found.stop;
    const stopIdx = found.idx;

    const vehiclesOnRoute = Object.keys(vehicleData).filter((vid) => {
      const rId = getRouteForVehicle(vid);
      return rId === route.id;
    });

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
      };
    });

    buses.sort((a, b) => {
      if (a.status === b.status) return a.eta_to_stop_minutes - b.eta_to_stop_minutes;
      return a.status === "coming" ? -1 : 1;
    });

    res.json({
      stop,
      routeId: route.id,
      routePath: route.path,
      routeColor: route.color,
      buses,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stop info" });
  }
});

/* -------------------------
   Admin Endpoints
--------------------------*/
app.post("/admin/map-vehicle", (req, res) => {
  try {
    const { vehicle_id, routeId } = req.body;
    if (!vehicle_id || !routeId) {
      return res.status(400).json({ error: "vehicle_id & routeId required" });
    }
    
    VEHICLE_ROUTE_MAP[vehicle_id] = routeId;
    if (vehicleData[vehicle_id]) {
      vehicleData[vehicle_id].routeId = routeId;
    }
    
    return res.json({ ok: true, VEHICLE_ROUTE_MAP });
  } catch (err) {
    res.status(500).json({ error: "Failed to map vehicle" });
  }
});

app.post("/admin/add-route", (req, res) => {
  try {
    const { id, name, stops, path, color } = req.body;
    if (!id || !stops) {
      return res.status(400).json({ error: "id & stops required" });
    }
    
    ROUTES[id] = { 
      id, 
      name: name || id, 
      stops, 
      path: path || [],
      color: color || "#007bff"
    };
    
    return res.json({ ok: true, route: ROUTES[id] });
  } catch (err) {
    res.status(500).json({ error: "Failed to add route" });
  }
});

/* -------------------------
   Improved Simulation
--------------------------*/
let simulationSpeed = 1;
let simulationInterval = null;
let simulationRoutes = {};

function startSimulation() {
  if (simulationInterval) return;

  // Initialize simulation routes if not set
  Object.keys(vehicleData).forEach(id => {
    if (!simulationRoutes[id]) {
      const routeId = getRouteForVehicle(id);
      simulationRoutes[id] = {
        routeId,
        currentPathIndex: 0,
        path: ROUTES[routeId]?.path || []
      };
    }
  });

  simulationInterval = setInterval(() => {
    Object.keys(vehicleData).forEach((id) => {
      const vehicle = vehicleData[id];
      const simData = simulationRoutes[id];
      
      if (simData && simData.path.length > 0) {
        // Move along route path
        const nextIndex = (simData.currentPathIndex + 1) % simData.path.length;
        const currentPos = simData.path[simData.currentPathIndex];
        const nextPos = simData.path[nextIndex];
        
        if (currentPos && nextPos) {
          // Smooth transition between points
          const progress = 0.1 * simulationSpeed;
          vehicle.lat = currentPos[0] + (nextPos[0] - currentPos[0]) * progress;
          vehicle.lon = currentPos[1] + (nextPos[1] - currentPos[1]) * progress;
          vehicle.heading = bearing(currentPos[0], currentPos[1], nextPos[0], nextPos[1]);
          vehicle.speed_kmph = 30 * simulationSpeed;
          vehicle.status = "MOVING";
          
          // Update path index if close to next point
          if (haversineKm(vehicle.lat, vehicle.lon, nextPos[0], nextPos[1]) < 0.1) {
            simData.currentPathIndex = nextIndex;
          }
        }
      } else {
        // Fallback random movement
        vehicle.lat += (Math.random() - 0.5) * 0.001 * simulationSpeed;
        vehicle.lon += (Math.random() - 0.5) * 0.001 * simulationSpeed;
        vehicle.speed_kmph = Math.random() * 50 * simulationSpeed;
        vehicle.heading = (vehicle.heading + (Math.random() - 0.5) * 30) % 360;
      }
      
      vehicle.lastSeen = Date.now();
      broadcastWS({ type: "telemetry", ...vehicle });
    });
  }, 1000);
}

app.post("/simulation/start", (req, res) => {
  if (simulationInterval) {
    return res.status(400).json({ message: "Simulation already running" });
  }
  
  startSimulation();
  res.json({ message: "Simulation started", speed: simulationSpeed });
});

app.post("/simulation/stop", (req, res) => {
  if (!simulationInterval) {
    return res.status(400).json({ message: "Simulation not running" });
  }
  
  clearInterval(simulationInterval);
  simulationInterval = null;
  res.json({ message: "Simulation stopped" });
});

app.post("/simulation/speed", (req, res) => {
  const { speed } = req.body;
  const newSpeed = parseInt(speed, 10);

  if (isNaN(newSpeed) || newSpeed < 1 || newSpeed > 10) {
    return res.status(400).json({ message: "Speed must be between 1-10" });
  }

  simulationSpeed = newSpeed;
  
  // Restart simulation with new speed if running
  if (simulationInterval) {
    clearInterval(simulationInterval);
    startSimulation();
  }
  
  res.json({ message: `Simulation speed set to ${newSpeed}`, speed: newSpeed });
});

app.get("/simulation/status", (req, res) => {
  res.json({
    running: !!simulationInterval,
    speed: simulationSpeed,
    vehicles: Object.keys(vehicleData).length
  });
});

/* -------------------------
   Health Check
--------------------------*/
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    vehicles: Object.keys(vehicleData).length,
    routes: Object.keys(ROUTES).length,
    simulation: {
      running: !!simulationInterval,
      speed: simulationSpeed
    }
  });
});

/* -------------------------
   Error Handling Middleware
--------------------------*/
app.use((err, req, res, next) => {
  console.error("🚨 Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

/* -------------------------
   Start Server
--------------------------*/
server.listen(PORT, () => {
  console.log(`🚀 SmartBus Server running → http://localhost:${PORT}`);
  console.log(`📊 Health check → http://localhost:${PORT}/health`);
  console.log(`🗺️  Routes API → http://localhost:${PORT}/routes`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  if (simulationInterval) clearInterval(simulationInterval);
  client.end();
  server.close(() => {
    console.log('✅ Server shut down');
    process.exit(0);
  });
});