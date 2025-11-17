import express from "express";
import cors from "cors";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import mqtt from "mqtt";

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ✅ Public MQTT broker
const MQTT_URL = "mqtt://test.mosquitto.org:1883";
const client = mqtt.connect(MQTT_URL);

// ✅ Store for all bus updates
let vehicleData = {};   // { vehicle_id : {lat, lon, ...} }

// ✅ MQTT Subscribe
client.on("connect", () => {
  console.log("✅ Backend connected to MQTT");
  client.subscribe("vehicles/+/telemetry");
});

// ✅ Handle incoming MQTT messages
client.on("message", (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());
    const id = data.vehicle_id;

    // Store latest info
    vehicleData[id] = data;

    // Send to WebSocket clients
    broadcastWS(data);

    console.log("📡 MQTT →", data);
  } catch (e) {
    console.log("❌ JSON Parse Error:", payload.toString());
  }
});

// ✅ Broadcast helper
function broadcastWS(data) {
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  });
}

// ✅ WS connection log
wss.on("connection", () => {
  console.log("🔌 WebSocket client connected");
});

// ✅ REST endpoint - returns all buses
app.get("/latest", (req, res) => {
  res.json(vehicleData);
});

// List all bus IDs
app.get("/buses", (req, res) => {
  res.json(Object.keys(vehicleData));
});

// =================================
// ❌ MOCK BUS SIMULATION REMOVED
// =================================

server.listen(4000, () => {
  console.log("🌍 Backend running → http://localhost:4000");
});
