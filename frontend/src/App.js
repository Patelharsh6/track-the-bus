// src/App.jsx - COMPLETELY FIXED VERSION

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

function FlyTo({ pos }) {
  const map = useMap();
  useEffect(() => {
    if (pos && pos[0] && pos[1]) {
      map.flyTo(pos, 15, { duration: 1 });
    }
  }, [pos, map]);
  return null;
}

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

function getRouteIdForUI(bus) {
  if (bus.routeId) return bus.routeId;
  const fallbackMap = { 
    "BUS-001": "R1", 
    "BUS-002": "R2", 
    "BUS-003": "R1" 
  };
  return fallbackMap[bus.vehicle_id] || null;
}

// Create a separate component for inputs to prevent re-renders
const SearchInput = React.memo(({ 
  inputRef, 
  value, 
  onChange, 
  onSelectSuggestion,
  suggestions,
  placeholder,
  label 
}) => {
  const [localSuggestions, setLocalSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    setLocalSuggestions(suggestions);
  }, [suggestions]);

  const handleInputChange = (e) => {
    onChange(e.target.value);
  };

  const handleSuggestionClick = (item) => {
    onSelectSuggestion(item);
    setShowSuggestions(false);
  };

  return (
    <div className="autocomplete-field">
      <label>{label}</label>
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={handleInputChange}
        className="autocomplete-input"
        autoComplete="off"
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
      />
      {showSuggestions && localSuggestions.length > 0 && (
        <div className="autocomplete-suggestions">
          {localSuggestions.map(item => (
            <div 
              key={item.id} 
              className="suggestion-item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSuggestionClick(item)}
            >
              <span className="suggestion-icon">🚏</span>
              <div className="suggestion-content">
                <div className="suggestion-main">{item.name}</div>
                <div className="suggestion-sub">Route: {item.routeId}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

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
  const [isLocating, setIsLocating] = useState(false);

  const wsRef = useRef(null);
  const originInputRef = useRef(null);
  const destInputRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const stopsRef = useRef([]);

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
        stopsRef.current = stopsData; // Store stops in ref to avoid dependency
        
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
  }, [appMode, selectedRoute, clearFeedback]);

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
          setTimeout(connectWebSocket, 3000);
        };
        
        return () => ws.close();
      } catch (error) {
        console.error("WebSocket connection failed:", error);
      }
    };

    connectWebSocket();
  }, [clearFeedback]);

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

  // FIXED: Stable location detection
  const getUserLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setFeedback({ type: 'error', message: 'Geolocation not supported' });
      clearFeedback();
      return;
    }

    setIsLocating(true);
    setFeedback({ type: 'info', message: 'Getting your location...' });

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 10000,
          enableHighAccuracy: true
        });
      });

      const { latitude, longitude } = position.coords;
      setUserPos([latitude, longitude]);
      setCenterPos([latitude, longitude]);

      const nearestResponse = await fetch(
        `http://localhost:4000/nearest-stop?lat=${latitude}&lon=${longitude}`
      );
      const nearestData = await nearestResponse.json();

      if (!nearestData.error) {
        setNearest(nearestData);
        setOriginInput(nearestData.stop.name);
        setFeedback({ 
          type: 'success', 
          message: `Location found! Set to ${nearestData.stop.name}` 
        });
      } else {
        setFeedback({ type: 'error', message: 'Found location but no nearby stops' });
      }
    } catch (error) {
      console.error("Geolocation error:", error);
      let errorMessage = 'Failed to get location';
      if (error.code === error.TIMEOUT) {
        errorMessage = 'Location request timed out';
      } else if (error.code === error.PERMISSION_DENIED) {
        errorMessage = 'Location access denied. Please enable location services.';
      }
      setFeedback({ type: 'error', message: errorMessage });
    } finally {
      setIsLocating(false);
      clearFeedback();
    }
  }, [clearFeedback]);

  // FIXED: Completely stable input handlers using refs
  const handleOriginInput = useCallback((value) => {
    setOriginInput(value);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (value.length < 2) {
      setOriginSuggestions([]);
      return;
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      const filtered = stopsRef.current.filter(s => 
        s.name.toLowerCase().includes(value.toLowerCase())
      );
      setOriginSuggestions(filtered.slice(0, 5));
    }, 150);
  }, []);

  const handleDestInput = useCallback((value) => {
    setDestInput(value);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (value.length < 2) {
      setDestSuggestions([]);
      return;
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      const filtered = stopsRef.current.filter(s => 
        s.name.toLowerCase().includes(value.toLowerCase())
      );
      setDestSuggestions(filtered.slice(0, 5));
    }, 150);
  }, []);

  // Stable selection handlers
  const selectOrigin = useCallback((item) => {
    setOriginInput(item.name);
    setCenterPos([item.lat, item.lon]);
    setOriginSuggestions([]);
  }, []);

  const selectDestination = useCallback((item) => {
    setDestInput(item.name);
    setCenterPos([item.lat, item.lon]);
    setDestSuggestions([]);
  }, []);

  // Fetch stop information
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

  // Trip planning function
  const planTrip = async () => {
    if (!originInput || !destInput) {
      setFeedback({ type: 'error', message: 'Please enter both origin and destination' });
      clearFeedback();
      return;
    }

    setIsLoading(true);
    setFeedback({ type: 'info', message: 'Planning your route...' });

    try {
      const fromStop = stopsRef.current.find(s => s.name.toLowerCase() === originInput.toLowerCase());
      const toStop = stopsRef.current.find(s => s.name.toLowerCase() === destInput.toLowerCase());

      if (!fromStop || !toStop) {
        setFeedback({ type: 'error', message: 'Please select valid bus stops from suggestions' });
        return;
      }

      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${fromStop.lon},${fromStop.lat};${toStop.lon},${toStop.lat}?overview=full&geometries=geojson`
      );
      const data = await response.json();

      if (data.code === 'Ok' && data.routes?.[0]) {
        const path = data.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);
        setCurrentRoutePath(path);
        setCurrentRouteColor("#28a745");
        
        const distance = (data.routes[0].distance / 1000).toFixed(1);
        const duration = Math.round(data.routes[0].duration / 60);
        
        const message = `Route found: ${distance} km, ${formatMinutes(duration)}`;
        setFeedback({ type: 'success', message });
        setDrawerOpen(true);
      } else {
        setFeedback({ type: 'error', message: 'No route found between stops' });
      }
    } catch (error) {
      console.error('Trip planning error:', error);
      setFeedback({ type: 'error', message: 'Failed to plan route' });
    } finally {
      setIsLoading(false);
      clearFeedback();
    }
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

  // FIXED: Memoized TripPlanningSearch component
  const TripPlanningSearch = React.memo(() => (
    <div className="search-card modern-card">
      <div className="search-title">Plan Your Trip</div>
      
      <div className="location-action">
        <button 
          className="btn black" 
          onClick={getUserLocation} 
          disabled={isLocating}
        >
          {isLocating ? "📍 Locating..." : "📍 Use My Location"}
        </button>
      </div>

      <div className="autocomplete-group">
        <SearchInput
          inputRef={originInputRef}
          value={originInput}
          onChange={handleOriginInput}
          onSelectSuggestion={selectOrigin}
          suggestions={originSuggestions}
          placeholder="Enter bus stop name"
          label="From"
        />

        <SearchInput
          inputRef={destInputRef}
          value={destInput}
          onChange={handleDestInput}
          onSelectSuggestion={selectDestination}
          suggestions={destSuggestions}
          placeholder="Enter bus stop name"
          label="To"
        />
      </div>

      <div className="actions-row modern-actions">
        <button 
          className="btn black" 
          onClick={planTrip}
          disabled={!originInput || !destInput || isLoading}
        >
          {isLoading ? "Planning..." : "Find Route"}
        </button>
      </div>

      {nearest && (
        <div className="nearest-card">
          <div className="title">Current Location</div>
          <div className="big">{nearest.stop.name}</div>
          <div className="muted">
            Walk: {formatMinutes(nearest.walk_minutes)} • {formatMeters(nearest.distance_m)}
          </div>
        </div>
      )}
    </div>
  ));

  const RouteExplorationSearch = React.memo(() => (
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
  ));

  const SimulationControls = React.memo(() => (
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
  ));

  const MapOptions = React.memo(() => (
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
  ));

  // Drawer content
  const DrawerContent = React.memo(() => {
    if (!stopInfo) {
      return (
        <div className="drawer-default-content">
          <h3>Bus Information</h3>
          <p>Select a bus stop to see arrival times and bus information.</p>
          {nearest && (
            <div className="nearest-info">
              <h4>Your Nearest Stop</h4>
              <p><strong>{nearest.stop.name}</strong></p>
              <p>Walk: {formatMinutes(nearest.walk_minutes)} • {formatMeters(nearest.distance_m)}</p>
              <button 
                className="btn black" 
                onClick={() => onSelectStop(nearest.stop.id)}
              >
                View Bus Times
              </button>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="stop-info-content">
        <div className="stop-header">
          <h3>{stopInfo.stop.name}</h3>
          <p className="route-info">Route: {stopInfo.routeId}</p>
        </div>
        
        <div className="buses-section">
          <h4>Live Bus Information</h4>
          {stopInfo.buses && stopInfo.buses.length > 0 ? (
            <div className="buses-list">
              {stopInfo.buses.map(bus => (
                <div key={bus.vehicle_id} className={`bus-item ${bus.status}`}>
                  <div className="bus-header">
                    <span className="bus-id">{bus.vehicle_id}</span>
                    <span className={`bus-status ${bus.status}`}>
                      {bus.status === 'coming' ? '🟢 Arriving' : '🔴 Departed'}
                    </span>
                  </div>
                  <div className="bus-details">
                    <div className="bus-eta">
                      {bus.status === 'coming' ? (
                        <span className="eta-time">{formatMinutes(bus.eta_to_stop_minutes)}</span>
                      ) : (
                        <span className="eta-passed">Departed</span>
                      )}
                    </div>
                    <div className="bus-meta">
                      <span>Speed: {Math.round((bus.speed_kmph || 0) * 10) / 10} km/h</span>
                      {bus.eta_to_dest_minutes && (
                        <span>To destination: {formatMinutes(bus.eta_to_dest_minutes)}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-buses">
              <p>No buses currently on this route</p>
            </div>
        )}
        </div>

        {stopInfo.buses && stopInfo.buses.some(b => b.status === 'coming') && nearest && (
          <div className="trip-planning">
            <button className="btn black full-width" onClick={computeFullTrip}>
              Calculate Total Trip ETA from Your Location
            </button>
          </div>
        )}
      </div>
    );
  });

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
              <DrawerContent />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}