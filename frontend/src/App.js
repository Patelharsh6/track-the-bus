import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

/* ================================================
              BUS ROUTES + STOPS
================================================ */
export const BUS_ROUTES = {
  "BUS-001": {
    route: [
      { lat: 23.0225, lon: 72.5714 },
      { lat: 23.0350, lon: 72.5805 },
      { lat: 23.0460, lon: 72.6000 },
    ],
    stops: [
      { name: "Lal Darwaja", lat: 23.0225, lon: 72.5714 },
      { name: "Income Tax", lat: 23.0350, lon: 72.5805 },
      { name: "Vijay Cross", lat: 23.0460, lon: 72.6000 },
    ],
  },
};

/* ================================================
                 ICONS
================================================ */
const busIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/3097/3097144.png",
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const userIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/535/535239.png",
  iconSize: [35, 35],
  iconAnchor: [17, 17],
});

/* ================================================
       GET REAL ROAD ROUTE (OSRM — FREE)
================================================ */
async function getRoadRoute(coords) {
  const path = coords.map((p) => `${p.lon},${p.lat}`).join(";");

  const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.routes) return [];

  return data.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
}

/* ================================================
                  ETA
================================================ */
function calculateETA(bus, stop) {
  if (!bus || !bus.speed_kmph) return "—";

  const R = 6371;
  const dLat = (stop.lat - bus.lat) * (Math.PI / 180);
  const dLon = (stop.lon - bus.lon) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(bus.lat * (Math.PI / 180)) *
      Math.cos(stop.lat * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;

  const c = a;
  const distance = R * c;

  const speed = Number(bus.speed_kmph);
  if (speed < 1) return ">20 min";

  return `${Math.round((distance / speed) * 60)} min`;
}

/* ================================================
             MAP BUTTONS
================================================ */
function Recenter({ telemetry }) {
  const map = useMap();
  return (
    <button
      className="floating-btn recenter"
      onClick={() =>
        telemetry && map.flyTo([telemetry.lat, telemetry.lon], 16)
      }
    >
      🚌 Locate Bus
    </button>
  );
}

function UserLocationBtn({ setUserPos }) {
  const map = useMap();
  return (
    <button
      className="floating-btn userloc"
      onClick={() => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            setUserPos([lat, lon]);
            map.flyTo([lat, lon], 16);
          },
          () => alert("Location error")
        );
      }}
    >
      📍 My Location
    </button>
  );
}

/* ================================================
               MAIN APP
================================================ */
export default function App() {
  const [busList, setBusList] = useState([]);
  const [telemetryMap, setTelemetryMap] = useState({});
  const [selectedBus, setSelectedBus] = useState(null);
  const [userPos, setUserPos] = useState(null);

  const [roadRoute, setRoadRoute] = useState([]);

  /* WebSocket */
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:4000");

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);

      setTelemetryMap((prev) => ({ ...prev, [data.vehicle_id]: data }));

      if (!busList.includes(data.vehicle_id)) {
        setBusList((prev) => [...prev, data.vehicle_id]);
      }

      if (!selectedBus) setSelectedBus(data.vehicle_id);
    };

    return () => ws.close();
  }, [selectedBus]);

  /* Load real road route */
  useEffect(() => {
    async function loadRoute() {
      if (selectedBus && BUS_ROUTES[selectedBus]) {
        const road = await getRoadRoute(BUS_ROUTES[selectedBus].route);
        setRoadRoute(road);
      }
    }
    loadRoute();
  }, [selectedBus]);

  const telemetry = selectedBus ? telemetryMap[selectedBus] : null;
  const defaultCenter = [23.0225, 72.5714];

  return (
    <div className="container">
      {/* Sidebar */}
      <aside className="sidebar glass">
        <h2>🚌 Smart Transport</h2>

        <label>Select Bus</label>
        <select
          className="bus-select"
          value={selectedBus || ""}
          onChange={(e) => setSelectedBus(e.target.value)}
        >
          {busList.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>

        {telemetry ? (
          <div className="card glass">
            <p><b>Bus:</b> {telemetry.vehicle_id}</p>
            <p><b>Lat:</b> {telemetry.lat?.toFixed(6)}</p>
            <p><b>Lon:</b> {telemetry.lon?.toFixed(6)}</p>
            <p><b>Speed:</b> {telemetry.speed_kmph} km/h</p>
            <p><b>SAT:</b> {telemetry.sat}</p>

            <p>
              <b>Status:</b>{" "}
              <span className={telemetry.status === "OK" ? "ok" : "bad"}>
                {telemetry.status}
              </span>
            </p>
          </div>
        ) : (
          <p>Waiting for live data…</p>
        )}
      </aside>

      {/* Map */}
      <main className="map-wrapper">
        <MapContainer center={defaultCenter} zoom={13} className="map">

          {/* Map layer */}
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Real road-following route */}
          {roadRoute.length > 0 && (
            <Polyline positions={roadRoute} color="blue" weight={5} />
          )}

          {/* Stops */}
          {selectedBus &&
            BUS_ROUTES[selectedBus].stops.map((stop, i) => (
              <Marker
                key={i}
                position={[stop.lat, stop.lon]}
                icon={L.divIcon({
                  className: "stop-icon",
                  html: `<div class="stop-dot"></div>`,
                })}
              >
                <Popup>
                  <b>{stop.name}</b>
                  <br />
                  ETA: {telemetry ? calculateETA(telemetry, stop) : "—"}
                </Popup>
              </Marker>
            ))}

          {/* Bus marker */}
          {Object.values(telemetryMap).map((bus) =>
            bus.lat && bus.lon ? (
              <Marker
                key={bus.vehicle_id}
                position={[bus.lat, bus.lon]}
                icon={busIcon}
              />
            ) : null
          )}

          {/* User marker */}
          {userPos && <Marker position={userPos} icon={userIcon} />}

          <Recenter telemetry={telemetry} />
          <UserLocationBtn setUserPos={setUserPos} />
        </MapContainer>
      </main>
    </div>
  );
}
