// src/App.jsx - FIXED VERSION

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
// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const getBusIcon = (heading = 0, status = "MOVING") => {
  const color = status === "MOVING" ? "#007bff" : "#6c757d";
  return L.divIcon({
    html: `
      <div style="
        background-color: ${color};
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        transform: rotate(${heading}deg);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 10px;
        font-weight: bold;
      ">🚌</div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    className: 'bus-marker'
  });
};

const userIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/535/535239.png",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

const stopIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function FlyTo({ pos }) {
  const map = useMap();
  useEffect(() => {
    if (pos && pos[0] && pos[1]) {
      map.flyTo(pos, 15, { duration: 1 });
    }
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
  const fallbackMap = { 
    "BUS-001": "R1", 
    "BUS-002": "R2", 
    "BUS-003": "R1" 
  };
  return fallbackMap[bus.vehicle_id] || null;
}

/* -------------------------
   Formatting Helpers
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
    return `${km} km ${Math.round(remainingMeters / 100) * 100} m`;
  }
  return `${meters} m`;
}

/* -------------------------
   Main App Component
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
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [centerPos, setCenterPos] = useState([23.0305, 72.5800]);
  const [currentRoutePath, setCurrentRoutePath] = useState([]);
  const [currentRouteColor, setCurrentRouteColor] = useState("#007bff");
  const [appMode, setAppMode] = useState('trip');
  const [feedback, setFeedback] = useState(null);
  const [mapType, setMapType] = useState('standard');
  const [isLoading, setIsLoading] = useState(false);

  const wsRef = useRef(null);

  const clearFeedback = useCallback(() => {
    setTimeout(() => setFeedback(null), 5000);
  }, []);

  // Initialize application data
  useEffect(() => {
    const initializeData = async () => {
      try {
        setIsLoading(true);
        const [routesRes, stopsRes] = await Promise.all([
          fetch("http://localhost:4000/routes"),
          fetch("http://localhost:4000/stops")
        ]);
        
        const routesData = await routesRes.json();
        const stopsData = await stopsRes.json();
        
        setRoutes(routesData);
        setStops(stopsData);
        
        if (appMode === 'route' && routesData.length && !selectedRoute) {
          setSelectedRoute(routesData[0].id);
        }
      } catch (error) {
        console.error("Failed to initialize data:", error);
        setFeedback({ type: 'error', message: 'Failed to load application data' });
        clearFeedback();
      } finally {
        setIsLoading(false);
      }
    };

    initializeData();
  }, [appMode, selectedRoute]);

  // WebSocket connection
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const ws = new WebSocket("ws://localhost:4000");
        wsRef.current = ws;
        
        ws.onopen = () => {
          console.log("✅ WebSocket connected");
          setFeedback({ type: 'success', message: 'Real-time updates connected' });
          clearFeedback();
        };
        
        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (data.type === "telemetry" || data.vehicle_id) {
              setBuses(prev => {
                const existingIndex = prev.findIndex(bus => bus.vehicle_id === data.vehicle_id);
                if (existingIndex >= 0) {
                  const updated = [...prev];
                  updated[existingIndex] = { ...updated[existingIndex], ...data };
                  return updated;
                } else {
                  return [...prev, data];
                }
              });
            }
          } catch (error) {
            console.error("WebSocket message error:", error);
          }
        };
        
        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          setFeedback({ type: 'error', message: 'Connection error' });
          clearFeedback();
        };
        
        ws.onclose = () => {
          console.log("WebSocket disconnected");
          // Attempt reconnection after 3 seconds
          setTimeout(connectWebSocket, 3000);
        };
        
        return () => ws.close();
      } catch (error) {
        console.error("WebSocket connection failed:", error);
      }
    };

    connectWebSocket();
  }, []);

  // Update route path when route selection changes
  useEffect(() => {
    if (selectedRoute) {
      const route = routes.find(r => r.id === selectedRoute);
      if (route) {
        setCurrentRoutePath(route.path || []);
        setCurrentRouteColor(route.color || "#007bff");
      }
    } else {
      setCurrentRoutePath([]);
    }
  }, [selectedRoute, routes]);

  // Get user location
  const getUserLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setFeedback({ type: 'error', message: 'Geolocation not supported' });
      clearFeedback();
      return;
    }

    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserPos([latitude, longitude]);
        setCenterPos([latitude, longitude]);
        
        // Find nearest stop
        fetch(`http://localhost:4000/nearest-stop?lat=${latitude}&lon=${longitude}`)
          .then(r => r.json())
          .then(data => {
            if (!data.error) {
              setNearest(data);
            }
          })
          .catch(console.error)
          .finally(() => setIsLoading(false));
      },
      (error) => {
        console.error("Geolocation error:", error);
        setFeedback({ type: 'error', message: 'Failed to get location' });
        clearFeedback();
        setIsLoading(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }, [clearFeedback]);

  // Autocomplete handlers
  const handleOriginInput = (e) => {
    const value = e.target.value;
    setOriginInput(value);
    if (value.length < 2) {
      setOriginSuggestions([]);
      return;
    }
    const filtered = stops.filter(s => 
      s.name.toLowerCase().includes(value.toLowerCase())
    );
    setOriginSuggestions(filtered.slice(0, 5));
  };

  const handleDestInput = (e) => {
    const value = e.target.value;
    setDestInput(value);
    if (value.length < 2) {
      setDestSuggestions([]);
      return;
    }
    const filtered = stops.filter(s => 
      s.name.toLowerCase().includes(value.toLowerCase())
    );
    setDestSuggestions(filtered.slice(0, 5));
  };

  const selectOriginStop = (stop) => {
    setOriginInput(stop.name);
    setOriginSuggestions([]);
    setCenterPos([stop.lat, stop.lon]);
  };

  const selectDestStop = (stop) => {
    setDestInput(stop.name);
    setDestSuggestions([]);
    setCenterPos([stop.lat, stop.lon]);
  };

  const fetchStopInfo = async (stopId, destId = null) => {
    try {
      setIsLoading(true);
      const query = destId ? `?dest=${destId}` : "";
      const response = await fetch(`http://localhost:4000/stop/${stopId}${query}`);
      const data = await response.json();
      
      if (data.error) {
        setFeedback({ type: 'error', message: data.error });
      } else {
        setStopInfo(data);
        if (data.routePath) {
          setCurrentRoutePath(data.routePath);
          setCurrentRouteColor(data.routeColor || "#007bff");
          setSelectedRoute(data.routeId);
        }
      }
    } catch (error) {
      console.error("Failed to fetch stop info:", error);
      setFeedback({ type: 'error', message: 'Failed to load stop information' });
    } finally {
      setIsLoading(false);
    }
  };

  const onSelectStop = (stopId) => {
    setSelectedStop(stopId);
    fetchStopInfo(stopId);
    const stop = stops.find(s => s.id === stopId);
    if (stop) {
      setCenterPos([stop.lat, stop.lon]);
    }
    setDrawerOpen(true);
  };

  const computeFullTrip = () => {
    if (!nearest?.stop || !stopInfo) {
      setFeedback({ type: 'error', message: 'Missing location or stop information' });
      clearFeedback();
      return null;
    }

    const comingBus = stopInfo.buses.find(b => b.status === "coming");
    if (!comingBus) {
      setFeedback({ type: 'info', message: 'No buses currently coming to this stop' });
      clearFeedback();
      return null;
    }

    const walk = nearest.walk_minutes || 0;
    const wait = comingBus.eta_to_stop_minutes || 0;
    const ride = comingBus.eta_to_dest_minutes || 0;
    const totalMinutes = walk + wait + ride;

    const message = `Total ETA: ${formatMinutes(totalMinutes)} (Walk: ${formatMinutes(walk)}, Wait: ${formatMinutes(wait)}, Ride: ${formatMinutes(ride)})`;
    setFeedback({ type: 'success', message });
    clearFeedback();

    return { walk, wait, ride, total: totalMinutes, bus: comingBus.vehicle_id };
  };

  const planTripByRoad = async () => {
    const fromStop = stops.find(s => s.name.toLowerCase() === originInput.toLowerCase());
    const toStop = stops.find(s => s.name.toLowerCase() === destInput.toLowerCase());

    if (!fromStop || !toStop) {
      setFeedback({ type: 'error', message: 'Please select valid stops' });
      clearFeedback();
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${fromStop.lon},${fromStop.lat};${toStop.lon},${toStop.lat}?overview=full&geometries=geojson`
      );
      const data = await response.json();

      if (data.code === 'Ok' && data.routes?.[0]) {
        const path = data.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);
        setCurrentRoutePath(path);
        setCurrentRouteColor("#28a745");
        setSelectedRoute(null);
        setSelectedStop(null);
        setStopInfo(null);
        setDrawerOpen(true);
        setFeedback({ type: 'success', message: `Route planned from ${fromStop.name} to ${toStop.name}` });
        clearFeedback();
      } else {
        setFeedback({ type: 'error', message: 'No route found between selected stops' });
        clearFeedback();
      }
    } catch (error) {
      console.error("Route planning error:", error);
      setFeedback({ type: 'error', message: 'Failed to plan route' });
      clearFeedback();
    } finally {
      setIsLoading(false);
    }
  };

  // Component rendering
  const TripPlanningSearch = () => (
    <div className="search-card modern-card">
      <div className="search-title">Plan Your Trip</div>
      
      <div className="location-action">
        <button className="btn black" onClick={getUserLocation} disabled={isLoading}>
          {isLoading ? "📍 Locating..." : "📍 Use My Location"}
        </button>
      </div>

      <div className="autocomplete-group">
        <div className="autocomplete-field">
          <label>From</label>
          <input
            type="text"
            placeholder="Enter origin stop"
            value={originInput}
            onChange={handleOriginInput}
            className="autocomplete-input"
            autoComplete="off"
          />
          {originSuggestions.length > 0 && (
            <div className="autocomplete-suggestions">
              {originSuggestions.map(stop => (
                <div key={stop.id} className="suggestion-item" onClick={() => selectOriginStop(stop)}>
                  <span className="suggestion-icon">🟢</span>
                  <span>{stop.name} ({stop.routeId})</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="autocomplete-field">
          <label>To</label>
          <input
            type="text"
            placeholder="Enter destination stop"
            value={destInput}
            onChange={handleDestInput}
            className="autocomplete-input"
            autoComplete="off"
          />
          {destSuggestions.length > 0 && (
            <div className="autocomplete-suggestions">
              {destSuggestions.map(stop => (
                <div key={stop.id} className="suggestion-item" onClick={() => selectDestStop(stop)}>
                  <span className="suggestion-icon">🔵</span>
                  <span>{stop.name} ({stop.routeId})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="actions-row modern-actions">
        <button 
          className="btn black" 
          onClick={planTripByRoad}
          disabled={!originInput || !destInput || isLoading}
        >
          {isLoading ? "Planning..." : "Find Route"}
        </button>
      </div>

      {nearest && (
        <div className="nearest-card">
          <div className="title">Nearest Stop</div>
          <div className="big">{nearest.stop.name}</div>
          <div className="muted">
            Walk: {formatMinutes(nearest.walk_minutes)} • {formatMeters(nearest.distance_m)}
          </div>
        </div>
      )}
    </div>
  );

  const RouteExplorationSearch = () => (
    <div className="search-card modern-card">
      <div className="search-title">Explore Routes</div>
      
      <div className="search-input-group">
        <label>Select Route</label>
        <select 
          className="select-input" 
          value={selectedRoute || ""} 
          onChange={e => setSelectedRoute(e.target.value)}
        >
          <option value="">-- Choose a Route --</option>
          {routes.map(r => (
            <option key={r.id} value={r.id}>
              {r.id} — {r.name}
            </option>
          ))}
        </select>
      </div>

      {selectedRoute && (
        <div className="search-input-group">
          <label>Select Stop</label>
          <select 
            className="select-input" 
            value={selectedStop || ""} 
            onChange={e => onSelectStop(e.target.value)}
          >
            <option value="">-- Choose a Stop --</option>
            {stops
              .filter(s => s.routeId === selectedRoute)
              .map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))
            }
          </select>
        </div>
      )}

      <div className="actions-row">
        <button className="btn light" onClick={() => setAppMode('trip')}>
          Switch to Trip Planner
        </button>
      </div>
    </div>
  );

  const SimulationControls = () => (
    <div className="search-card modern-card">
      <div className="search-title">Simulation Controls</div>
      <div className="simulation-controls">
        <button className="btn black" onClick={() => {
          fetch("http://localhost:4000/simulation/start")
            .then(() => setFeedback({ type: 'success', message: 'Simulation started' }))
            .catch(() => setFeedback({ type: 'error', message: 'Failed to start simulation' }));
        }}>
          Start Simulation
        </button>
        <button className="btn light" onClick={() => {
          fetch("http://localhost:4000/simulation/stop")
            .then(() => setFeedback({ type: 'success', message: 'Simulation stopped' }))
            .catch(() => setFeedback({ type: 'error', message: 'Failed to stop simulation' }));
        }}>
          Stop Simulation
        </button>
        <div className="speed-control">
          <label>Simulation Speed:</label>
          <input
            type="range"
            min="1"
            max="10"
            defaultValue="5"
            onChange={(e) => {
              fetch(`http://localhost:4000/simulation/speed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ speed: e.target.value })
              })
              .then(() => setFeedback({ type: 'success', message: `Speed set to ${e.target.value}` }))
              .catch(() => setFeedback({ type: 'error', message: 'Failed to set speed' }));
            }}
          />
        </div>
      </div>
    </div>
  );

  const MapOptions = () => (
    <div className="map-options">
      <button 
        className={mapType === 'standard' ? 'active' : ''}
        onClick={() => setMapType('standard')}
      >
        Standard
      </button>
      <button 
        className={mapType === 'satellite' ? 'active' : ''}
        onClick={() => setMapType('satellite')}
      >
        Satellite
      </button>
    </div>
  );

  return (
    <div className="app-container">
      <header className="navbar-top">
        <div className="nav-brand">🚌 SmartBus Tracker</div>
        <nav className="nav-menu">
          <button 
            className={`nav-btn ${appMode === 'trip' ? 'active' : ''}`}
            onClick={() => setAppMode('trip')}
          >
            Trip Planner
          </button>
          <button 
            className={`nav-btn ${appMode === 'route' ? 'active' : ''}`}
            onClick={() => setAppMode('route')}
          >
            Routes
          </button>
          <button 
            className={`nav-btn ${appMode === 'simulation' ? 'active' : ''}`}
            onClick={() => setAppMode('simulation')}
          >
            Simulation
          </button>
        </nav>
      </header>

      <div className="main-layout">
        <section className="side-panel">
          <div className="side-panel-content">
            <div className="side-panel-header">
              <h2>SmartBus Tracker</h2>
              <p className="subtitle">Real-time bus tracking system</p>
            </div>

            <div className="side-panel-body">
              {isLoading && (
                <div className="loading-indicator">
                  <div className="spinner"></div>
                  <span>Loading...</span>
                </div>
              )}

              {feedback && (
                <div className={`feedback-message ${feedback.type}`}>
                  {feedback.message}
                </div>
              )}

              {appMode === 'trip' && <TripPlanningSearch />}
              {appMode === 'route' && <RouteExplorationSearch />}
              {appMode === 'simulation' && <SimulationControls />}
            </div>
          </div>
        </section>

        <section className="map-panel">
          <MapOptions />
          
          <MapContainer 
            center={centerPos} 
            zoom={13} 
            className="map"
            zoomControl={true}
          >
            <TileLayer
              url={
                mapType === 'satellite'
                  ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              }
              attribution='&copy; OpenStreetMap contributors'
            />
            
            <FlyTo pos={centerPos} />

            {/* Route Path */}
            {currentRoutePath.length > 0 && (
              <Polyline 
                positions={currentRoutePath} 
                pathOptions={{ 
                  color: currentRouteColor, 
                  weight: 6, 
                  opacity: 0.7,
                  lineJoin: 'round'
                }} 
              />
            )}

            {/* Stops */}
            {stops
              .filter(stop => !selectedRoute || stop.routeId === selectedRoute)
              .map(stop => (
                <CircleMarker
                  key={stop.id}
                  center={[stop.lat, stop.lon]}
                  radius={8}
                  pathOptions={{
                    color: stop.id === selectedStop ? "#007bff" : "#ff9900",
                    fillColor: stop.id === selectedStop ? "#007bff" : "#ff9900",
                    fillOpacity: 0.8,
                    weight: 2
                  }}
                  eventHandlers={{
                    click: () => onSelectStop(stop.id)
                  }}
                >
                  <Popup>
                    <div className="stop-popup">
                      <strong>{stop.name}</strong>
                      <br />
                      <small>Route: {stop.routeId}</small>
                      <br />
                      <button 
                        className="btn tiny"
                        onClick={() => onSelectStop(stop.id)}
                      >
                        View Buses
                      </button>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}

            {/* Buses */}
            {buses
              .filter(bus => !selectedRoute || getRouteIdForUI(bus) === selectedRoute)
              .map(bus => (
                <Marker
                  key={bus.vehicle_id}
                  position={[bus.lat, bus.lon]}
                  icon={getBusIcon(bus.heading || 0, bus.status)}
                >
                  <Popup>
                    <div className="bus-popup">
                      <strong>{bus.vehicle_id}</strong>
                      <br />
                      Speed: {Math.round((bus.speed_kmph || 0) * 10) / 10} km/h
                      <br />
                      Status: {bus.status || 'UNKNOWN'}
                      <br />
                      Route: {bus.routeId || 'N/A'}
                    </div>
                  </Popup>
                </Marker>
              ))}

            {/* User Location */}
            {userPos && (
              <Marker position={userPos} icon={userIcon}>
                <Popup>Your current location</Popup>
              </Marker>
            )}
          </MapContainer>

          {/* Info Drawer */}
          <div className={`drawer ${drawerOpen ? "open" : "minimized"}`}>
            <div 
              className="drawer-handle" 
              onClick={() => setDrawerOpen(!drawerOpen)}
            >
              <div className="handle-line" />
              <div className="drawer-title">
                {stopInfo ? `Stop: ${stopInfo.stop.name}` : 'Bus Information'}
              </div>
            </div>

            <div className="drawer-content">
              {stopInfo && (
                <div className="stop-info">
                  <h3>{stopInfo.stop.name}</h3>
                  <p>Route: {stopInfo.routeId}</p>
                  
                  <div className="buses-list">
                    <h4>Buses</h4>
                    {stopInfo.buses.length === 0 ? (
                      <p className="no-buses">No buses available</p>
                    ) : (
                      stopInfo.buses.map(bus => (
                        <div key={bus.vehicle_id} className="bus-info">
                          <span className="bus-id">{bus.vehicle_id}</span>
                          <span className={`status ${bus.status}`}>
                            {bus.status === 'coming' ? 'Arriving' : 'Departed'}
                          </span>
                          <span className="eta">
                            {bus.status === 'coming' ? formatMinutes(bus.eta_to_stop_minutes) : '--'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  {stopInfo.buses.some(b => b.status === 'coming') && (
                    <button className="btn black" onClick={computeFullTrip}>
                      Calculate Total Trip ETA
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}