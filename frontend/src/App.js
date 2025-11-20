// src/App.jsx - FINAL VERSION

import React, { useEffect, useState, useRef, useCallback } from "react";
import { 
  MapContainer, 
  TileLayer, 
  Marker, 
  Popup, 
  CircleMarker, 
  useMap,
  Polyline 
} from "react-leaflet";
import L from "leaflet";
import 'leaflet-rotatedmarker';
import "leaflet/dist/leaflet.css";
import "./App.css";

/* -------------------------
   Icons and Leaflet Helpers
--------------------------*/
const getBusIcon = (heading = 0) => {
    return L.icon({
        iconUrl: "https://cdn-icons-png.flaticon.com/512/3097/3097144.png",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        className: 'bus-marker',
        rotationAngle: heading
    });
};
const userIcon = new L.Icon({
    iconUrl: "https://cdn-icons-png.flaticon.com/512/535/535239.png",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
});
function FlyTo({ pos }) {
    const map = useMap();
    useEffect(() => {
        if (pos) map.flyTo(pos, 15, { duration: 0.7 });
    }, [pos, map]);
    return null;
}
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
function getRouteIdForUI(bus) {
    if (bus.routeId) return bus.routeId;
    const fallbackMap = { "BUS-001": "R1", "BUS-101": "R1", "BUS-102": "R1", "BUS-103": "R1", "BUS-002": "R2", "BUS-003": "R1" };
    return fallbackMap[bus.vehicle_id] || null;
}

/* -------------------------
    NEW: Time and Distance Formatting Helpers
--------------------------*/
function formatMinutes(totalMinutes) {
    if (totalMinutes === 0 || totalMinutes === null) return "0 min";
    const minutes = Math.round(totalMinutes);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    let parts = [];
    if (hours > 0) {
        parts.push(`${hours} hr`);
    }
    if (remainingMinutes > 0 || hours === 0) {
        parts.push(`${remainingMinutes} min`);
    }
    return parts.join(' ');
}

function formatMeters(totalMeters) {
    if (totalMeters === null || totalMeters === undefined) return "N/A";
    const meters = Math.round(totalMeters);
    const km = Math.floor(meters / 1000);
    const remainingMeters = meters % 1000;

    if (km > 0) {
        // Show km and nearest 100 meters
        return `${km} km ${Math.round(remainingMeters / 100) * 100} m`;
    }
    // For distances under 1km, just show meters
    return `${meters} m`;
}

/* -------------------------
    App Component
--------------------------*/
export default function App() {
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [buses, setBuses] = useState([]); 
  const [selectedStop, setSelectedStop] = useState(null);
  const [stopInfo, setStopInfo] = useState(null);
  const [userPos, setUserPos] = useState(null);
  const [nearest, setNearest] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [centerPos, setCenterPos] = useState([23.0305, 72.5800]);
  const [currentRoutePath, setCurrentRoutePath] = useState([]); 
  const [appMode, setAppMode] = useState('trip'); 
  const [feedback, setFeedback] = useState(null); 

  const wsRef = useRef(null);

  const clearFeedback = useCallback(() => {
      setTimeout(() => setFeedback(null), 5000);
  }, []);


  useEffect(() => {
    fetch("http://localhost:4000/routes").then(r => r.json()).then(data => {
      setRoutes(data);
      if (appMode === 'route' && data.length && !selectedRoute) {
          setSelectedRoute(data[0].id);
      }
    }).catch(console.error);

    fetch("http://localhost:4000/stops").then(r => r.json()).then(s => setStops(s)).catch(console.error);

    // WebSocket logic
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
  }, [appMode, selectedRoute]);

  useEffect(() => {
    setSelectedStop(null);
    setStopInfo(null);
    setCurrentRoutePath([]);
    const route = routes.find(r => r.id === selectedRoute);
    if (route && route.path) {
        setCurrentRoutePath(route.path);
    }
  }, [selectedRoute, routes]);

  function detectUser() {
    setFeedback(null);
    if (!navigator.geolocation) {
        setFeedback({ type: 'error', message: 'Geolocation not supported by your browser.' });
        clearFeedback();
        return;
    }
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
            setDrawerOpen(true);
            setFeedback({ type: 'success', message: `Nearest stop found: ${res.stop.name}` });
          }
        })
        .catch(e => {
            setFeedback({ type: 'error', message: 'Error fetching nearest stop.' });
            clearFeedback();
            console.error(e);
        });
    }, () => {
        setFeedback({ type: 'error', message: 'Cannot access location. Please allow GPS access.' });
        clearFeedback();
    });
  }

  function fetchStopInfo(stopId, destId = null) {
    setFeedback(null);
    const q = destId ? `?dest=${destId}` : "";
    fetch(`http://localhost:4000/stop/${stopId}${q}`)
      .then(r => r.json())
      .then(d => {
        setStopInfo(d);
        if (d.routePath) {
            setCurrentRoutePath(d.routePath);
            setSelectedRoute(d.routeId); 
        }
      })
      .catch(console.error);
  }

  function onSelectStop(stopId) {
    setSelectedStop(stopId);
    fetchStopInfo(stopId);
    const s = stops.find(x => x.id === stopId);
    if (s) setCenterPos([s.lat, s.lon]);
    setDrawerOpen(true);
    setFeedback(null); 
  }

  function computeFullTrip() {
    // Check if destination is selected
    if (!stopInfo?.buses.find(b => b.eta_to_dest_minutes !== null)) {
        setFeedback({ type: 'info', message: 'Please select a destination stop below to compute the full trip ETA.' });
        clearFeedback();
        return null;
    }

    if (!nearest || !nearest.stop || !stopInfo) {
        setFeedback({ type: 'error', message: 'Cannot compute trip: Missing location or stop info.' });
        clearFeedback();
        return null;
    }

    const walk = nearest.walk_minutes || 0;
    const comingBus = stopInfo.buses.find(b => b.status === "coming");
    const wait = comingBus ? comingBus.eta_to_stop_minutes : 0; 
    const ride = comingBus && comingBus.eta_to_dest_minutes ? comingBus.eta_to_dest_minutes : 0;
    
    if (stopInfo.buses.length === 0) {
         setFeedback({ type: 'info', message: `No buses currently running for this route (${stopInfo.routeId}).` });
         clearFeedback();
         return null;
    }
    
    const totalMinutes = walk + wait + ride;
    
    // Use formatMinutes for all time parts in the message
    const message = `Total Trip ETA: ${formatMinutes(totalMinutes)}. (Walk: ${formatMinutes(walk)}, Wait: ${formatMinutes(wait)}, Ride: ${formatMinutes(ride)} on Bus: ${comingBus?.vehicle_id || 'N/A'})`;
    
    setFeedback({ type: 'success', message: message });
    clearFeedback();

    return { walk, wait, ride, total: totalMinutes, bus: comingBus ? comingBus.vehicle_id : null };
  }

  // Search Card Components
  const TripPlanningSearch = () => (
    <div className="search-card">
        <div className="search-input-group">
            <div className="location-input" onClick={detectUser}>
                <span className="input-placeholder">
                    {userPos ? `Current Location (${Math.round(userPos[0]*100)/100}, ${Math.round(userPos[1]*100)/100})` : 'Enter starting location (Click GPS)'}
                </span>
                <span className="locate-icon">➤</span> 
            </div>
            <div className="location-input" onClick={() => { 
                if (nearest?.stop) onSelectStop(nearest.stop.id); else detectUser(); 
            }}>
                <span className="input-placeholder">
                    {nearest ? `Nearest Stop: ${nearest.stop.name}` : 'Enter destination (Find nearest stop)'}
                </span>
            </div>
        </div>
        <div className="actions-row">
            <button className="btn black" onClick={() => { 
                if (nearest?.stop) { 
                    onSelectStop(nearest.stop.id); 
                } else {
                    detectUser();
                }
            }}>
                {nearest ? `View ETA to ${nearest.stop.id}` : 'Find Nearest Stop'}
            </button>
            <button className="btn light" onClick={() => { setAppMode('route'); setFeedback(null); }}>
                Explore Routes
            </button>
        </div>
        {feedback && <div className={`feedback-message ${feedback.type}`}>{feedback.message}</div>}
    </div>
  );

  const RouteExplorationSearch = () => (
    <div className="search-card route-mode">
        <div className="search-input-group no-marker">
            <label className="search-label">Select Route</label>
            <select className="select-input" value={selectedRoute || ""} onChange={e => setSelectedRoute(e.target.value)}>
                <option value="">-- Choose a Route --</option>
                {routes.map(r => <option key={r.id} value={r.id}>{r.id} — {r.name}</option>)}
            </select>
        </div>
        
        {selectedRoute && (
            <div className="search-input-group no-marker" style={{borderLeft: 'none', paddingLeft: 0}}>
                <label className="search-label">Select Stop on Route</label>
                <select className="select-input" onChange={e => onSelectStop(e.target.value)} value={selectedStop || ""}>
                    <option value="">-- Choose a Stop --</option>
                    {stops.filter(s => s.routeId === selectedRoute).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
            </div>
        )}

        <div className="actions-row">
             <button className="btn black" onClick={() => { setAppMode('trip'); setFeedback(null); }}>
                Plan a Trip
            </button>
            <button className="btn light" onClick={() => { 
                if (selectedRoute) { 
                    const r = routes.find(r => r.id === selectedRoute); 
                    if (r && r.path[0]) setCenterPos(r.path[0]);
                } else {
                     setFeedback({ type: 'info', message: 'Please select a route first.' });
                     clearFeedback();
                }
            }}>
                Locate Route
            </button>
        </div>
        {feedback && <div className={`feedback-message ${feedback.type}`}>{feedback.message}</div>}
    </div>
  );

  return (
    <div className="app-container">
      <header className="navbar-top">
        <div className="nav-left">
          <div className="nav-brand">SmartBus</div>
          <div className="nav-link" onClick={() => setAppMode('trip')}>Trip Planning</div>
          <div className="nav-link" onClick={() => setAppMode('route')}>Routes</div>
        </div>
        <div className="nav-right">
            
        </div>
      </header>

      <div className="main-layout">
        <main className="map-container">
          {appMode === 'trip' ? <TripPlanningSearch /> : <RouteExplorationSearch />}

          <MapContainer center={centerPos} zoom={13} className="map">
            <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <FlyTo pos={centerPos} />

            {/* Route Path, Stops, Buses, User Markers */}
            {currentRoutePath.length > 0 && (
                <Polyline positions={currentRoutePath} pathOptions={{ color: 'blue', weight: 4, opacity: 0.7 }} />
            )}
            {stops.filter(s => s.routeId === selectedRoute).map(s => (
              <CircleMarker key={s.id} center={[s.lat, s.lon]} radius={8} pathOptions={{ color: s.id === selectedStop ? "#007bff" : "#ff9900",fillColor: s.id === selectedStop ? "#007bff" : "#ff9900",fillOpacity: 0.8}} eventHandlers={{ click: () => onSelectStop(s.id) }}>
                <Popup><div style={{ minWidth: 160 }}><b>{s.name}</b><br /><button className="btn tiny" onClick={() => onSelectStop(s.id)}>View buses</button></div></Popup>
              </CircleMarker>
            ))}
            {buses.filter(b => getRouteIdForUI(b) === selectedRoute).map(b => (
              <Marker key={b.vehicle_id} position={[b.lat, b.lon]} icon={getBusIcon(b.heading || 0)}><Popup><div><b>{b.vehicle_id}</b><br/>{Math.round((b.speed_kmph || 0) *10)/10} km/h</div></Popup></Marker>
            ))}
            {userPos && <Marker position={userPos} icon={userIcon}><Popup>You are here</Popup></Marker>}
          </MapContainer>

          {/* Bottom drawer */}
          <div className={`drawer ${drawerOpen ? "open" : ""}`}>
            <div className="drawer-handle" onClick={() => setDrawerOpen(s => !s)}>
              <div className="handle-line" />
              <div className="drawer-title">{selectedStop && stopInfo ? `Stop: ${stopInfo.stop.name}` : nearest ? 'Nearest Stop' : 'Bus Tracker Info'}</div>
            </div>

            <div className="drawer-content">
              {appMode === 'trip' && nearest && (
                <div className="nearest-card">
                  <div className="title">Nearest Stop</div>
                  <div className="big">{nearest.stop.name} ({nearest.routeId})</div>
                  <div className="muted">Walk: {formatMinutes(nearest.walk_minutes)} • {formatMeters(nearest.distance_m || Math.round(nearest.distance_km * 1000))}</div>
                  <div className="actions">
                    <button className="btn black" onClick={() => onSelectStop(nearest.stop.id)}>View Bus ETA</button>
                    <button className="btn light" onClick={() => setCenterPos([nearest.stop.lat, nearest.stop.lon])}>Show on map</button>
                  </div>
                </div>
              )}
              {appMode === 'route' && selectedRoute && (
                <div className="stop-route-list-panel">
                  <div className="list-title">Stops on Route {selectedRoute}</div>
                  <div className="stop-list">
                    {stops.filter(s => s.routeId === selectedRoute).map(s => (
                      <div key={s.id} className={`stop-row ${selectedStop === s.id ? "active" : ""}`} onClick={() => onSelectStop(s.id)}>
                        <div>{s.name}</div>
                        <div className="muted">{userPos ? formatMeters(Math.round(haversineKm(userPos[0], userPos[1], s.lat, s.lon) * 1000)) : ""}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedStop && stopInfo && (
                <>
                  {/* Total Trip ETA Feedback */}
                  {feedback?.type === 'success' && feedback.message.startsWith('Total Trip ETA') && (
                      <div className={`feedback-message ${feedback.type}`}>{feedback.message}</div>
                  )}

                  <div className="stop-panel">
                  <div className="list-title">Buses Serving {stopInfo.stop.name}</div>
                  {stopInfo.buses.length === 0 && <div>No buses right now</div>}
                  {stopInfo.buses.map(b => (
                    <div key={b.vehicle_id} className={`bus-item ${b.status === "coming" ? "coming" : "gone"}`}>
                      <div className="left">
                        <div className="bus-id">{b.vehicle_id}</div>
                        <div className="muted">{Math.round((b.speed_kmph||0)*10)/10} km/h</div>
                      </div>
                      <div className="right">
                        <div className="bus-id">{b.status === "coming" ? formatMinutes(b.eta_to_stop_minutes) : "Gone"}</div>
                        <div className="muted">{b.status === "coming" ? "Arriving" : "Passed"}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="plan-trip">
                    <div className="sub">Plan trip from {stopInfo.stop.name}</div>
                    <select onChange={(e) => {
                      const dest = e.target.value;
                      if (dest) fetchStopInfo(selectedStop, dest); 
                    }} defaultValue="">
                      <option value="">-- Choose destination stop --</option>
                      {stops.filter(s => s.routeId === selectedRoute && s.id !== selectedStop).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>

                    <div style={{ marginTop: 8 }}>
                      {stopInfo.buses.length > 0 && nearest && (
                        <button className="btn black" onClick={computeFullTrip}>
                             Show Total Trip ETA
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}

              {!nearest && !selectedStop && (
                <div className="empty">Select an option in the search card above or click "📍" to begin.</div>
              )}
            </div>
          </div>

          <div className="mobile-controls">
            <button className="btn round" onClick={detectUser}>📍</button>
            <button className="btn round" onClick={() => { 
              if (selectedStop) {
                const s = stops.find(x => x.id === selectedStop); 
                if (s) setCenterPos([s.lat, s.lon]); 
              } 
            }}>🚌</button>
          </div>
        </main>
      </div>
    </div>
  );
}