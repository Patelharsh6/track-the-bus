// src/App.jsx
import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

/* Icons */
const busIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/3097/3097144.png",
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});
const userIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/535/535239.png",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

/* FlyTo hook */
function FlyTo({ pos }) {
  const map = useMap();
  useEffect(() => {
    if (pos) map.flyTo(pos, 15, { duration: 0.7 });
  }, [pos, map]);
  return null;
}

/* Haversine */
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function App() {
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [buses, setBuses] = useState([]); // live telemetry snapshot
  const [selectedStop, setSelectedStop] = useState(null);
  const [stopInfo, setStopInfo] = useState(null);
  const [userPos, setUserPos] = useState(null);
  const [nearest, setNearest] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [centerPos, setCenterPos] = useState([23.0305, 72.5800]);

  const wsRef = useRef(null);

  useEffect(() => {
    fetch("http://localhost:4000/routes").then(r => r.json()).then(data => {
      setRoutes(data);
      if (data.length) setSelectedRoute(data[0].id);
    }).catch(console.error);

    fetch("http://localhost:4000/stops").then(r => r.json()).then(s => setStops(s)).catch(console.error);

    fetch("http://localhost:4000/buses").then(r => r.json()).then(b => setBuses(b)).catch(console.error);

    const ws = new WebSocket("ws://localhost:4000");
    wsRef.current = ws;
    ws.onopen = () => console.log("WS open");
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        if (m.type === "telemetry" || m.vehicle_id) {
          const payload = m.type === "telemetry" ? m : m;
          setBuses(prev => {
            const idx = prev.findIndex(p => p.vehicle_id === payload.vehicle_id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = { ...copy[idx], ...payload };
              return copy;
            } else {
              return [...prev, payload];
            }
          });
        }
      } catch (e) { /* ignore */ }
    };
    ws.onerror = console.error;
    return () => ws.close();
  }, []);

  useEffect(() => {
    setSelectedStop(null);
    setStopInfo(null);
  }, [selectedRoute]);

  function detectUser() {
    if (!navigator.geolocation) return alert("Geolocation not supported");
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      setUserPos([lat, lon]);
      setCenterPos([lat, lon]);
      fetch(`http://localhost:4000/nearest-stop?lat=${lat}&lon=${lon}`)
        .then(r => r.json())
        .then(res => {
          setNearest(res);
          if (res?.stop) {
            setSelectedStop(res.stop.id);
            fetchStopInfo(res.stop.id);
          }
        })
        .catch(console.error);
    }, () => alert("Cannot access location"));
  }

  function fetchStopInfo(stopId, destId = null) {
    const q = destId ? `?dest=${destId}` : "";
    fetch(`http://localhost:4000/stop/${stopId}${q}`).then(r => r.json()).then(d => setStopInfo(d)).catch(console.error);
  }

  function onSelectStop(stopId) {
    setSelectedStop(stopId);
    fetchStopInfo(stopId);
    const s = stops.find(x => x.id === stopId);
    if (s) setCenterPos([s.lat, s.lon]);
    setDrawerOpen(true);
  }

  function computeFullTrip(destStopId) {
    if (!nearest || !nearest.stop || !stopInfo) return null;
    const walk = nearest.walk_minutes || 0;
    const comingBus = stopInfo.buses.find(b => b.status === "coming");
    const wait = comingBus ? comingBus.eta_to_stop_minutes : (stopInfo.buses[0] ? stopInfo.buses[0].eta_to_stop_minutes : 0);
    const ride = comingBus && comingBus.eta_to_dest_minutes ? comingBus.eta_to_dest_minutes : 0;
    return { walk, wait, ride, total: walk + wait + ride, bus: comingBus ? comingBus.vehicle_id : null };
  }

  return (
    <div className="app-container">
      <header className="topbar">
        <div className="brand">Smart Transit • Premium Demo</div>
        <div className="controls">
          <button className="btn" onClick={detectUser}>📍 My Location</button>
          <button className="btn outline" onClick={() => { if (selectedStop) {
            const s = stops.find(x => x.id === selectedStop); if (s) setCenterPos([s.lat, s.lon]); } }}>🚌 Locate Stop</button>
        </div>
      </header>

      <div className="main-layout">
        <aside className="leftpanel" aria-hidden={window.innerWidth < 720}>
          <div className="panel-block">
            <label>Route</label>
            <select value={selectedRoute || ""} onChange={e => setSelectedRoute(e.target.value)}>
              {routes.map(r => <option key={r.id} value={r.id}>{r.id} — {r.name}</option>)}
            </select>
          </div>

          <div className="panel-block">
            <label>Stops</label>
            <div className="stop-list">
              {stops.filter(s => s.routeId === selectedRoute).map(s => (
                <div key={s.id} className={`stop-row ${selectedStop === s.id ? "active" : ""}`} onClick={() => onSelectStop(s.id)}>
                  <div>{s.name}</div>
                  <div className="muted">{userPos ? `${Math.round(haversineKm(userPos[0], userPos[1], s.lat, s.lon) * 1000)} m` : ""}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel-block">
            <label>Live buses</label>
            <div className="bus-list">
              {buses.filter(b => getRouteIdForUI(b) === selectedRoute).map(b => (
                <div key={b.vehicle_id} className="bus-row">
                  <div><b>{b.vehicle_id}</b></div>
                  <div className="muted">{Math.round((b.speed_kmph || 0) * 10)/10} km/h</div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className="map-container">
          <MapContainer center={centerPos} zoom={13} className="map">
            <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <FlyTo pos={centerPos} />

            {/* stops */}
            {stops.filter(s => s.routeId === selectedRoute).map(s => (
              <CircleMarker key={s.id} center={[s.lat, s.lon]} radius={8} pathOptions={{ color: s.id === (nearest?.stop?.id) ? "#ff5500" : "#ff9900" }} eventHandlers={{ click: () => onSelectStop(s.id) }}>
                <Popup>
                  <div style={{ minWidth: 160 }}>
                    <b>{s.name}</b><br />
                    <button className="btn tiny" onClick={() => onSelectStop(s.id)}>View buses</button>
                  </div>
                </Popup>
              </CircleMarker>
            ))}

            {/* buses */}
            {buses.filter(b => getRouteIdForUI(b) === selectedRoute).map(b => (
              <Marker key={b.vehicle_id} position={[b.lat, b.lon]} icon={busIcon}>
                <Popup>
                  <div><b>{b.vehicle_id}</b><br/>{Math.round((b.speed_kmph || 0) *10)/10} km/h</div>
                </Popup>
              </Marker>
            ))}

            {/* user */}
            {userPos && <Marker position={userPos} icon={userIcon}><Popup>You are here</Popup></Marker>}
          </MapContainer>

          {/* Bottom drawer */}
          <div className={`drawer ${drawerOpen ? "open" : "closed"}`}>
            <div className="drawer-handle" onClick={() => setDrawerOpen(s => !s)}>
              <div className="handle-line" />
              <div className="drawer-title">Stop Info</div>
            </div>

            <div className="drawer-content">
              {!selectedStop && nearest && (
                <div className="nearest-card">
                  <div className="title">Nearest Stop</div>
                  <div className="big">{nearest.stop.name}</div>
                  <div className="muted">Walk: {nearest.walk_minutes} min • {Math.round(nearest.distance_km*1000)} m</div>
                  <div className="actions">
                    <button className="btn" onClick={() => onSelectStop(nearest.stop.id)}>View buses</button>
                    <button className="btn outline" onClick={() => setCenterPos([nearest.stop.lat, nearest.stop.lon])}>Show on map</button>
                  </div>
                </div>
              )}

              {selectedStop && stopInfo && (
                <div className="stop-panel">
                  <div className="title">Stop: {stopInfo.stop.name}</div>
                  <div className="muted">Route: {stopInfo.routeId}</div>

                  <div className="list-title">Buses serving this stop</div>
                  {stopInfo.buses.length === 0 && <div>No buses right now</div>}
                  {stopInfo.buses.map(b => (
                    <div key={b.vehicle_id} className={`bus-item ${b.status === "coming" ? "coming" : "gone"}`}>
                      <div className="left">
                        <div className="bus-id">{b.vehicle_id}</div>
                        <div className="muted">{Math.round((b.speed_kmph||0)*10)/10} km/h</div>
                      </div>
                      <div className="right">
                        <div className="muted">{b.status === "coming" ? `Arrives in ${b.eta_to_stop_minutes} min` : "Gone"}</div>
                        {b.eta_to_dest_minutes !== null && <div className="muted">To destination: {b.eta_to_dest_minutes} min</div>}
                      </div>
                    </div>
                  ))}

                  <div className="plan-trip">
                    <div className="sub">Plan trip from this stop</div>
                    <select onChange={(e) => {
                      const dest = e.target.value;
                      if (dest) fetch(`http://localhost:4000/stop/${selectedStop}?dest=${dest}`).then(r=>r.json()).then(d=>setStopInfo(d)).catch(console.error);
                    }} defaultValue="">
                      <option value="">-- choose destination stop --</option>
                      {stops.filter(s => s.routeId===selectedRoute && s.id !== selectedStop).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>

                    <div style={{ marginTop: 8 }}>
                      <button className="btn" onClick={() => {
                        const full = computeFullTrip(selectedStop);
                        if (!full) return alert("No trip info");
                        alert(`Walk ${full.walk} min • Wait ${full.wait} min • Ride ${full.ride} min • Total ${full.total} min (Bus: ${full.bus || '-'})`);
                      }}>Show total ETA</button>
                    </div>
                  </div>
                </div>
              )}

              {!nearest && !selectedStop && (
                <div className="empty">Click "My Location" to find the nearest stop</div>
              )}
            </div>
          </div>

          <div className="mobile-controls">
            <button className="btn round" onClick={detectUser}>📍</button>
            <button className="btn round" onClick={() => { if (selectedStop) {
              const s = stops.find(x => x.id === selectedStop); if (s) setCenterPos([s.lat, s.lon]); } }}>🚌</button>
          </div>
        </main>
      </div>
    </div>
  );
}

/* Helper to read route id from buses (for UI) */
/* We replicate backend mapping approach here so UI can group buses: */
function getRouteIdForUI(bus) {
  // prefer routeId property if present in telemetry
  if (bus.routeId) return bus.routeId;
  // fallback: try mapping using known IDs (same mapping keys as backend defaults)
  const fallbackMap = {
    "BUS-001":"R1","BUS-101":"R1","BUS-102":"R1","BUS-103":"R1"
  };
  return fallbackMap[bus.vehicle_id] || null;
}
