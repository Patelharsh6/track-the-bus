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
    const [originInput, setOriginInput] = useState("");
    const [originSuggestions, setOriginSuggestions] = useState([]);
    const [destInput, setDestInput] = useState("");
    const [destSuggestions, setDestSuggestions] = useState([]);
    const [nearest, setNearest] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [centerPos, setCenterPos] = useState([23.0305, 72.5800]);
  const [currentRoutePath, setCurrentRoutePath] = useState([]); 
  const [appMode, setAppMode] = useState('trip'); 
  const [feedback, setFeedback] = useState(null); 
  const [mapType, setMapType] = useState('standard'); // NEW: State for map type

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

    // Autocomplete helpers
    // Improved autocomplete: keep focus, allow any stop, use coordinates
    function handleOriginInput(e) {
        const value = e.target.value;
        setOriginInput(value);
        if (value.length < 1) {
            setOriginSuggestions([]);
            return;
        }
        const filtered = stops.filter(s => s.name.toLowerCase().includes(value.toLowerCase()));
        setOriginSuggestions(filtered);
    }

    function handleDestInput(e) {
        const value = e.target.value;
        setDestInput(value);
        if (value.length < 1) {
            setDestSuggestions([]);
            return;
        }
        const filtered = stops.filter(s => s.name.toLowerCase().includes(value.toLowerCase()));
        setDestSuggestions(filtered);
    }

    function selectOriginStop(stop) {
        setOriginInput(stop.name);
        setOriginSuggestions([]);
        setCenterPos([stop.lat, stop.lon]);
        // Keep focus on input
        setTimeout(() => {
            document.getElementById('origin-input')?.focus();
        }, 0);
    }

    function selectDestStop(stop) {
        setDestInput(stop.name);
        setDestSuggestions([]);
        setCenterPos([stop.lat, stop.lon]);
        setTimeout(() => {
            document.getElementById('dest-input')?.focus();
        }, 0);
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



  const debugTripPlanning = useCallback(() => {
    if (!nearest || !nearest.stop) {
        console.error("Nearest stop not found.");
    }
    if (!stopInfo) {
        console.error("Stop info not available.");
    }
    if (!stopInfo?.buses || stopInfo.buses.length === 0) {
        console.error("No buses available for the selected stop.");
    }
  }, [nearest, stopInfo]);

useEffect(() => {
    debugTripPlanning();
}, [nearest, stopInfo, debugTripPlanning]);

  // Search Card Components
    // Modernized Trip Planning Search
    // Modernized Trip Planning Search (no redundant text/buttons, keep focus)
    const TripPlanningSearch = () => (
        <div className="search-card modern-card">
            <div className="search-title">Trip Planner</div>
            <div className="autocomplete-group">
                <div className="autocomplete-field">
                    <label>From</label>
                    <input
                        id="origin-input"
                        type="text"
                        placeholder="Enter origin stop"
                        value={originInput}
                        onChange={handleOriginInput}
                        className="autocomplete-input"
                        autoComplete="off"
                        onBlur={e => setTimeout(() => setOriginSuggestions([]), 150)}
                        onFocus={handleOriginInput}
                    />
                    {originSuggestions.length > 0 && (
                        <div className="autocomplete-suggestions">
                            {originSuggestions.map(stop => (
                                <div key={stop.id} className="suggestion-item" onMouseDown={() => selectOriginStop(stop)}>
                                    <span className="suggestion-icon">🟢</span>
                                    <span>{stop.name}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="autocomplete-field">
                    <label>To</label>
                    <input
                        id="dest-input"
                        type="text"
                        placeholder="Enter destination stop"
                        value={destInput}
                        onChange={handleDestInput}
                        className="autocomplete-input"
                        autoComplete="off"
                        onBlur={e => setTimeout(() => setDestSuggestions([]), 150)}
                        onFocus={handleDestInput}
                    />
                    {destSuggestions.length > 0 && (
                        <div className="autocomplete-suggestions">
                            {destSuggestions.map(stop => (
                                <div key={stop.id} className="suggestion-item" onMouseDown={() => selectDestStop(stop)}>
                                    <span className="suggestion-icon">🔵</span>
                                    <span>{stop.name}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <div className="actions-row modern-actions">
                <button className="btn black" disabled={!(originInput && destInput && getStopByName(originInput) && getStopByName(destInput))} onClick={planTripByRoad}>
                    Plan Trip
                </button>
            </div>
            {feedback && <div className={`feedback-message ${feedback.type}`}>{feedback.message}</div>}
        </div>
    );

    // Helper to get stop by name
    function getStopByName(name) {
        return stops.find(s => s.name.toLowerCase() === name.toLowerCase());
    }

    // Plan trip by road using OSRM or similar
    async function planTripByRoad() {
        const from = getStopByName(originInput);
        const to = getStopByName(destInput);
        if (!from || !to) {
            setFeedback({ type: 'error', message: 'Please select valid stops for both From and To.' });
            clearFeedback();
            return;
        }
        try {
            const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.code === 'Ok' && data.routes && data.routes[0]) {
                setCurrentRoutePath(data.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]));
                setSelectedRoute(null); // Hide old route
                setSelectedStop(null);
                setStopInfo(null);
                setDrawerOpen(true);
                setFeedback({ type: 'success', message: `Trip planned from ${from.name} to ${to.name}` });
                clearFeedback();
            } else if (data.code === 'NoRoute' || !data.routes || data.routes.length === 0) {
                setCurrentRoutePath([]);
                setFeedback({ type: 'error', message: `No road route found between ${from.name} and ${to.name}.` });
                clearFeedback();
            } else {
                setCurrentRoutePath([]);
                setFeedback({ type: 'error', message: 'No route found.' });
                clearFeedback();
            }
        } catch (e) {
            setCurrentRoutePath([]);
            setFeedback({ type: 'error', message: 'Error planning route.' });
            clearFeedback();
        }
    }

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

  const SimulationControls = () => (
    <div className="simulation-controls">
        <button className="btn black" onClick={() => {
            fetch("http://localhost:4000/simulation/start")
                .then(() => setFeedback({ type: 'success', message: 'Simulation started.' }))
                .catch(() => setFeedback({ type: 'error', message: 'Failed to start simulation.' }));
        }}>
            Start Simulation
        </button>
        <button className="btn light" onClick={() => {
            fetch("http://localhost:4000/simulation/stop")
                .then(() => setFeedback({ type: 'success', message: 'Simulation stopped.' }))
                .catch(() => setFeedback({ type: 'error', message: 'Failed to stop simulation.' }));
        }}>
            Stop Simulation
        </button>
        <input
            type="range"
            min="1"
            max="10"
            defaultValue="5"
            onChange={(e) => {
                fetch(`http://localhost:4000/simulation/speed?value=${e.target.value}`)
                    .then(() => setFeedback({ type: 'success', message: `Simulation speed set to ${e.target.value}.` }))
                    .catch(() => setFeedback({ type: 'error', message: 'Failed to set simulation speed.' }));
            }}
        />
    </div>
);

function toggleDrawerMinimization() {
    setDrawerOpen((prev) => !prev);
}

const MapOptions = () => (
    <div className="map-options">
        <button onClick={() => setMapType('standard')}>Standard View</button>
        <button onClick={() => setMapType('satellite')}>Satellite View</button>
    </div>
);

  return (
    <div className="app-container">
            <header className="navbar-top redesigned-navbar">
                <div className="nav-brand">SmartBus</div>
                <nav className="nav-menu">
                    <button className={`nav-btn${appMode==='trip'?' active':''}`} onClick={() => setAppMode('trip')}>Trip</button>
                    <button className={`nav-btn${appMode==='route'?' active':''}`} onClick={() => setAppMode('route')}>Routes</button>
                    <button className={`nav-btn${appMode==='simulation'?' active':''}`} onClick={() => setAppMode('simulation')}>Sim</button>
                </nav>
            </header>

            <div className="main-layout redesigned-layout">
                <section className="side-panel">
                    <div className="side-panel-content">
                        <div className="side-panel-header">
                            <h2>SmartBus</h2>
                            <div className="side-panel-tabs">
                                <button className={`side-tab${appMode==='trip'?' active':''}`} onClick={() => setAppMode('trip')}>Trip</button>
                                <button className={`side-tab${appMode==='route'?' active':''}`} onClick={() => setAppMode('route')}>Routes</button>
                                <button className={`side-tab${appMode==='simulation'?' active':''}`} onClick={() => setAppMode('simulation')}>Sim</button>
                            </div>
                        </div>
                        <div className="side-panel-body">
                            {appMode === 'trip' ? <TripPlanningSearch /> : <RouteExplorationSearch />}
                            {appMode === 'simulation' && <SimulationControls />}
                        </div>
                    </div>
                </section>
                <section className="map-panel">
                    <MapOptions />
                    <MapContainer center={centerPos} zoom={13} className="map" style={{ height: 'calc(100vh - var(--nav-height, 60px))', width: '100%' }}>
                        <TileLayer
                            url={
                                mapType === 'satellite'
                                    ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                    : "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                            }
                            attribution={
                                mapType === 'satellite'
                                    ? 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
                                    : '&copy; OpenStreetMap contributors'
                            }
                        />
                        <FlyTo pos={centerPos} />
                        {currentRoutePath.length > 0 && (
                                <Polyline positions={currentRoutePath} pathOptions={{ color: 'blue', weight: 4, opacity: 0.7 }} />
                        )}
                        {stops.filter(s => s.routeId === selectedRoute).map(s => (
                            <CircleMarker key={s.id} center={[s.lat, s.lon]} radius={8} pathOptions={{ color: s.id === selectedStop ? "#007bff" : "#ff9900", fillColor: s.id === selectedStop ? "#007bff" : "#ff9900", fillOpacity: 0.8 }} eventHandlers={{ click: () => onSelectStop(s.id) }}>
                                <Popup><div style={{ minWidth: 160 }}><b>{s.name}</b><br /><button className="btn tiny" onClick={() => onSelectStop(s.id)}>View buses</button></div></Popup>
                            </CircleMarker>
                        ))}
                        {buses.filter(b => getRouteIdForUI(b) === selectedRoute).map(b => (
                            <Marker key={b.vehicle_id} position={[b.lat, b.lon]} icon={getBusIcon(b.heading || 0)}><Popup><div><b>{b.vehicle_id}</b><br/>{Math.round((b.speed_kmph || 0) *10)/10} km/h</div></Popup></Marker>
                        ))}
                        {userPos && <Marker position={userPos} icon={userIcon}><Popup>You are here</Popup></Marker>}
                    </MapContainer>
                    <div className={`drawer ${drawerOpen ? "open" : "minimized"}`}>
                        <div className="drawer-handle" onClick={toggleDrawerMinimization}>
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
                                <div className="modern-card stop-route-list-panel">
                                    <div className="list-title">Stops on Route <b>{selectedRoute}</b></div>
                                    <div className="modern-stop-list">
                                        {stops.filter(s => s.routeId === selectedRoute).map(s => (
                                            <div key={s.id} className={`modern-stop-row ${selectedStop === s.id ? "active" : ""}`} onClick={() => onSelectStop(s.id)}>
                                                <span className="stop-dot">🟠</span>
                                                <span className="stop-name">{s.name}</span>
                                                <span className="stop-distance">{userPos ? formatMeters(Math.round(haversineKm(userPos[0], userPos[1], s.lat, s.lon) * 1000)) : ""}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {selectedStop && stopInfo && (
                                <div className="modern-card trip-summary-card">
                                    {feedback?.type === 'success' && feedback.message.startsWith('Total Trip ETA') && (
                                        <div className={`feedback-message ${feedback.type}`}>{feedback.message}</div>
                                    )}
                                    <div className="trip-summary-header">
                                        <span className="trip-summary-icon">🚌</span>
                                        <span className="trip-summary-title">Trip Summary for <b>{stopInfo.stop.name}</b></span>
                                    </div>
                                    <div className="trip-bus-list">
                                        {stopInfo.buses.length === 0 && <div className="no-buses">No buses right now</div>}
                                        {stopInfo.buses.map(b => (
                                            <div key={b.vehicle_id} className={`bus-item-modern ${b.status === "coming" ? "coming" : "gone"}`}>
                                                <div className="bus-badge">{b.vehicle_id}</div>
                                                <div className="bus-meta">
                                                    <span className="bus-speed">{Math.round((b.speed_kmph||0)*10)/10} km/h</span>
                                                    <span className={`bus-status ${b.status}`}>{b.status === "coming" ? "Arriving" : "Passed"}</span>
                                                </div>
                                                <div className="bus-eta">{b.status === "coming" ? formatMinutes(b.eta_to_stop_minutes) : "Gone"}</div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="plan-trip-modern">
                                        <div className="sub">Plan trip from <b>{stopInfo.stop.name}</b></div>
                                        <select className="modern-select" onChange={(e) => {
                                            const dest = e.target.value;
                                            if (dest) fetchStopInfo(selectedStop, dest); 
                                        }} defaultValue="">
                                            <option value="">-- Choose destination stop --</option>
                                            {stops.filter(s => s.routeId === selectedRoute && s.id !== selectedStop).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                        <div style={{ marginTop: 12 }}>
                                            {stopInfo.buses.length > 0 && nearest && (
                                                <button className="btn black" onClick={computeFullTrip}>
                                                    Show Total Trip ETA
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {!nearest && !selectedStop && (
                                <div className="modern-card empty modern-empty">Select an option above to begin planning your trip.</div>
                            )}
                        </div>
                    </div>
                </section>
            </div>
    </div>
  );
}