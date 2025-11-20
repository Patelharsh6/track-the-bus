import React, { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet'
import { io } from 'socket.io-client'
import L from 'leaflet'
import './App.css'

// Fix for default markers
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

// Custom icons
const busIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTQgMTZWNWEyIDIgMCAwIDEgMi0yaDEyYTIgMiAwIDAgMSAyIDJ2MTFtMCAwaDR2M2gtNHYtM00yMCAxNkg0TTggMTloLTJhMSAxIDAgMCAwLTEgMXYxYTEgMSAwIDAgMCAxIDFoMmExIDEgMCAwIDAgMS0xdi0xYTEgMSAwIDAgMC0xLTFNNiA1aDEybTAgNHY0IiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+Cjwvc3ZnPgo=',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
  className: 'bus-marker'
})

const metroIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMiIgeT0iNSIgd2lkdGg9IjIwIiBoZWlnaHQ9IjE0IiByeD0iMiIgZmlsbD0iIzlCMDI2NSIgc3Ryb2tlPSIjN0EwMTREIiBzdHJva2Utd2lkdGg9IjIiLz4KPHJlY3QgeD0iNiIgeT0iOCIgd2lkdGg9IjEyIiBoZWlnaHQ9IjgiIGZpbGw9IiNGRkYiLz4KPHBhdGggZD0iTTggMTFIMTZNOCAxNEgxNiIgc3Ryb2tlPSIjOUIwMjY1IiBzdHJva2Utd2lkdGg9IjIiLz4KPC9zdmc+',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
  className: 'metro-marker'
})

const stopIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IiNmZjkwMDAiIHN0cm9rZT0iI2ZmNmQwMCIgc3Ryb2tlLXdpZHRoPSIyIi8+Cjx0ZXh0IHg9IjEyIiB5PSIxNiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiIGZvbnQtc2l6ZT0iMTIiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiI+UzwvdGV4dD4KPC9zdmc+',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -10],
})

const metroStopIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IiM5QjAyNjUiIHN0cm9rZT0iIzdBMDE0RCIgc3Ryb2tlLXdpZHRoPSIyIi8+Cjx0ZXh0IHg9IjEyIiB5PSIxNiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiIGZvbnQtc2l6ZT0iMTIiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiI+TTwvdGV4dD4KPC9zdmc+',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -10],
})

const userIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IiMzNDk4ZGIiIHN0cm9rZT0iIzI3N2FiZCIgc3Ryb2tlLXdpZHRoPSIyIi8+CjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjQiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPg==',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -10],
})

// Helper function to get backend URL
const getBackendUrl = () => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }
  return `http://${window.location.hostname}:3000`;
};

function App() {
  const [socket, setSocket] = useState(null)
  const [userLocation, setUserLocation] = useState({ lat: 23.0384, lon: 72.5618 })
  const [vehicles, setVehicles] = useState([])
  const [routes, setRoutes] = useState([])
  const [stops, setStops] = useState([])
  const [nearestStop, setNearestStop] = useState(null)
  const [selectedDestination, setSelectedDestination] = useState('')
  const [tripPlan, setTripPlan] = useState(null)
  const [tripOptions, setTripOptions] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('home')
  const [searchFrom, setSearchFrom] = useState('Your Location')
  const [searchTo, setSearchTo] = useState('')
  const [searchSuggestions, setSearchSuggestions] = useState([])
  const [travelMode, setTravelMode] = useState('walking')
  const [simulationEnabled, setSimulationEnabled] = useState(true)
  const [mapCenter, setMapCenter] = useState([23.0384, 72.5618])

  // Initialize socket connection
  useEffect(() => {
    const backendUrl = getBackendUrl();
    console.log('Connecting to backend:', backendUrl);
    
    const newSocket = io(backendUrl);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to server');
    });

    newSocket.on('initialData', (data) => {
      console.log('Received initial data:', data);
      setRoutes(data.routes || []);
      setStops(data.stops || []);
      setVehicles(data.vehicles || []);
      setSimulationEnabled(data.simulationEnabled || false);
      findNearestStop(userLocation);
    });

    newSocket.on('vehicleUpdate', (data) => {
      setVehicles(prev => {
        const filtered = prev.filter(v => v.id !== data.id);
        return [...filtered, data];
      });
    });

    newSocket.on('simulationStatus', (data) => {
      setSimulationEnabled(data.enabled);
    });

    return () => newSocket.close();
  }, []);

  // Get user's actual location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLocation = {
            lat: position.coords.latitude,
            lon: position.coords.longitude
          }
          setUserLocation(newLocation)
          setMapCenter([newLocation.lat, newLocation.lon])
          findNearestStop(newLocation)
        },
        (error) => {
          console.log('Geolocation error, using default location')
        }
      )
    }
  }, [])

  const findNearestStop = (location) => {
    let nearest = null
    let minDistance = Infinity

    stops.forEach(stop => {
      const distance = Math.sqrt(
        Math.pow(stop.lat - location.lat, 2) + Math.pow(stop.lon - location.lon, 2)
      )
      if (distance < minDistance) {
        minDistance = distance
        nearest = { 
          ...stop, 
          distance: (distance * 111320), 
          walkingTime: Math.ceil((distance * 111320) / 1.4),
          cyclingTime: Math.ceil((distance * 111320) / 4.0),
          drivingTime: Math.ceil((distance * 111320) / 11.0)
        }
      }
    })

    setNearestStop(nearest)
  }

  const handleSearchStops = async (query) => {
    if (query.length < 2) {
      setSearchSuggestions([]);
      return;
    }
    
    try {
      const backendUrl = getBackendUrl();
      const response = await fetch(`${backendUrl}/api/search-stops?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      setSearchSuggestions(data);
    } catch (error) {
      console.error('Search error:', error);
    }
  }

  const calculateTrip = async () => {
    if (!searchTo) return;

    setLoading(true);
    try {
      const selectedStop = stops.find(stop => stop.name === searchTo);
      if (!selectedStop) {
        alert('Please select a valid stop from the suggestions');
        return;
      }

      const backendUrl = getBackendUrl();
      
      // Get trip options first (like Uber)
      const optionsResponse = await fetch(`${backendUrl}/api/trip-options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromLat: userLocation.lat,
          fromLon: userLocation.lon,
          toLat: selectedStop.lat,
          toLon: selectedStop.lon
        })
      });
      
      const optionsData = await optionsResponse.json();
      setTripOptions(optionsData);
      
      // Auto-select the first option
      if (optionsData.options && optionsData.options.length > 0) {
        const firstOption = optionsData.options[0];
        
        // Get detailed trip plan for the selected option
        const planResponse = await fetch(`${backendUrl}/api/trip-plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromLat: userLocation.lat,
            fromLon: userLocation.lon,
            toLat: selectedStop.lat,
            toLon: selectedStop.lon,
            mode: travelMode
          })
        });
        
        const planData = await planResponse.json();
        setTripPlan(planData);
        setActiveTab('trip');
      }
      
    } catch (error) {
      console.error('Trip calculation error:', error);
      alert('Failed to calculate route. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSimulation = async (enabled) => {
    try {
      const backendUrl = getBackendUrl();
      const endpoint = enabled ? '/api/simulation/start' : '/api/simulation/stop';
      const response = await fetch(`${backendUrl}${endpoint}`, { method: 'POST' });
      const data = await response.json();
      setSimulationEnabled(data.enabled);
    } catch (error) {
      console.error('Simulation toggle error:', error);
    }
  }

  const formatTime = (seconds) => {
    if (!seconds) return '0 min'
    const mins = Math.ceil(seconds / 60)
    if (mins < 60) return `${mins} min`
    const hours = Math.floor(mins / 60)
    const remainingMins = mins % 60
    return `${hours}h ${remainingMins}m`
  }

  const formatCurrency = (amount) => {
    return `₹${amount}`
  }

  const getBusesForStop = (stopId) => {
    return vehicles.filter(vehicle => {
      const intelligence = vehicle.intelligence
      return intelligence && intelligence.nextStop && intelligence.nextStop.id === stopId
    })
  }

  const getComingVehicles = () => {
    return vehicles
      .filter(vehicle => vehicle.intelligence?.etaToNextStop && vehicle.intelligence.etaToNextStop > 0)
      .sort((a, b) => a.intelligence.etaToNextStop - b.intelligence.etaToNextStop)
      .slice(0, 8)
  }

  const getModeTime = () => {
    if (!nearestStop) return '0 min';
    switch(travelMode) {
      case 'cycling': return formatTime(nearestStop.cyclingTime);
      case 'driving': return formatTime(nearestStop.drivingTime);
      default: return formatTime(nearestStop.walkingTime);
    }
  }

  const getVehicleIcon = (vehicle) => {
    return vehicle.type === 'metro' ? metroIcon : busIcon;
  }

  const getStopIcon = (stopId) => {
    // Check if stop is a metro station
    const isMetroStop = routes.some(route => 
      route.type === 'metro' && route.stops.some(stop => stop.id === stopId)
    );
    return isMetroStop ? metroStopIcon : stopIcon;
  }

  return (
    <div className="app uber-theme">
      {/* Sidebar Navigation */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">🚍</span>
            <span className="logo-text">AMTS Transit</span>
          </div>
        </div>

        <div className="search-section">
          <div className="search-inputs">
            <div className="input-wrapper from">
              <div className="input-dot"></div>
              <input 
                type="text" 
                placeholder="Your location" 
                value={searchFrom}
                onChange={(e) => setSearchFrom(e.target.value)}
                className="search-input"
              />
            </div>
            <div className="input-wrapper to">
              <div className="input-dot"></div>
              <input 
                type="text" 
                placeholder="Where to?" 
                value={searchTo}
                onChange={(e) => {
                  setSearchTo(e.target.value);
                  handleSearchStops(e.target.value);
                }}
                className="search-input"
              />
              {searchSuggestions.length > 0 && searchTo && (
                <div className="search-suggestions">
                  {searchSuggestions.map(stop => (
                    <div 
                      key={stop.id} 
                      className="suggestion-item"
                      onClick={() => {
                        setSearchTo(stop.name);
                        setSearchSuggestions([]);
                      }}
                    >
                      <span className="suggestion-icon">
                        {routes.some(r => r.type === 'metro' && r.stops.some(s => s.id === stop.id)) ? '🚇' : '📍'}
                      </span>
                      <div className="suggestion-details">
                        <div className="suggestion-name">{stop.name}</div>
                        <div className="suggestion-routes">
                          {routes.filter(route => 
                            route.stops.some(s => s.id === stop.id)
                          ).map(route => (
                            <span key={route.id} className={`route-tag ${route.type}`}>
                              {route.id}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="transport-modes">
            <button 
              className={`mode-btn ${travelMode === 'walking' ? 'active' : ''}`}
              onClick={() => setTravelMode('walking')}
            >
              <span className="mode-icon">🚶</span>
              <span>Walk</span>
            </button>
            <button 
              className={`mode-btn ${travelMode === 'cycling' ? 'active' : ''}`}
              onClick={() => setTravelMode('cycling')}
            >
              <span className="mode-icon">🚴</span>
              <span>Bike</span>
            </button>
            <button 
              className={`mode-btn ${travelMode === 'driving' ? 'active' : ''}`}
              onClick={() => setTravelMode('driving')}
            >
              <span className="mode-icon">🚗</span>
              <span>Car</span>
            </button>
          </div>

          <button 
            className="search-button"
            onClick={calculateTrip}
            disabled={!searchTo || loading}
          >
            {loading ? (
              <div className="loading-spinner"></div>
            ) : (
              <>
                <span>Get Directions</span>
                <span className="arrow">→</span>
              </>
            )}
          </button>

          {/* Simulation Controls */}
          <div className="simulation-controls">
            <div className="control-header">
              <span className="control-icon">🎮</span>
              <span>Simulation</span>
            </div>
            <div className="toggle-switch">
              <button 
                className={`toggle-btn ${simulationEnabled ? 'active' : ''}`}
                onClick={() => toggleSimulation(true)}
              >
                ON
              </button>
              <button 
                className={`toggle-btn ${!simulationEnabled ? 'active' : ''}`}
                onClick={() => toggleSimulation(false)}
              >
                OFF
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="nav-tabs">
          <button 
            className={`tab ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => setActiveTab('home')}
          >
            <span className="tab-icon">🏠</span>
            <span className="tab-text">Home</span>
          </button>
          <button 
            className={`tab ${activeTab === 'trip' ? 'active' : ''}`}
            onClick={() => setActiveTab('trip')}
          >
            <span className="tab-icon">🚶</span>
            <span className="tab-text">Trip</span>
          </button>
          <button 
            className={`tab ${activeTab === 'buses' ? 'active' : ''}`}
            onClick={() => setActiveTab('buses')}
          >
            <span className="tab-icon">🚌</span>
            <span className="tab-text">Live Transit</span>
          </button>
          <button 
            className={`tab ${activeTab === 'stops' ? 'active' : ''}`}
            onClick={() => setActiveTab('stops')}
          >
            <span className="tab-icon">📍</span>
            <span className="tab-text">Stops</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="tab-content">
          {/* Home Tab */}
          {activeTab === 'home' && (
            <div className="home-content">
              {nearestStop && (
                <div className="card">
                  <div className="card-header">
                    <span className="card-icon">📍</span>
                    <h3>Nearest Stop</h3>
                  </div>
                  <div className="card-body">
                    <div className="stop-main">
                      <div className="stop-name">{nearestStop.name}</div>
                      <div className="stop-distance">
                        <span className="walk-time">{getModeTime()} {travelMode}</span>
                        <span className="distance">({Math.round(nearestStop.distance)}m)</span>
                      </div>
                    </div>
                    <div className="buses-coming">
                      {getBusesForStop(nearestStop.id).length > 0 ? (
                        <span className="buses-count">
                          {getBusesForStop(nearestStop.id).length} vehicles coming
                        </span>
                      ) : (
                        <span className="no-buses">No vehicles scheduled</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Trip Options (Uber-like) */}
              {tripOptions && tripOptions.options && tripOptions.options.length > 0 && (
                <div className="card">
                  <div className="card-header">
                    <span className="card-icon">🚍</span>
                    <h3>Available Routes</h3>
                  </div>
                  <div className="trip-options">
                    {tripOptions.options.map((option, index) => (
                      <div key={index} className="trip-option">
                        <div className="option-header">
                          <div className="option-type">
                            <span className={`type-icon ${option.type}`}>
                              {option.type === 'metro' ? '🚇' : '🚌'}
                            </span>
                            <span className="type-name">
                              {option.route.name}
                            </span>
                          </div>
                          <div className="option-fare">
                            {formatCurrency(option.fare)}
                          </div>
                        </div>
                        <div className="option-details">
                          <div className="option-time">
                            <span className="time-icon">⏱️</span>
                            {formatTime(option.totalDuration)}
                          </div>
                          <div className="option-stops">
                            {option.type === 'metro' ? 'Metro' : 'Bus'} • {Math.abs(option.route.stops.findIndex(s => s.id === option.fromStop.id) - option.route.stops.findIndex(s => s.id === option.toStop.id))} stops
                          </div>
                        </div>
                        <div className="option-breakdown">
                          <div className="breakdown-item">
                            <span>Walk:</span>
                            <span>{formatTime(option.walkingTime)}</span>
                          </div>
                          <div className="breakdown-item">
                            <span>Wait:</span>
                            <span>{formatTime(option.waitTime)}</span>
                          </div>
                          <div className="breakdown-item">
                            <span>Ride:</span>
                            <span>{formatTime(option.transitTime)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="card">
                <div className="card-header">
                  <span className="card-icon">🔍</span>
                  <h3>Live Transit Nearby</h3>
                </div>
                <div className="buses-list">
                  {getComingVehicles().map(vehicle => (
                    <div key={vehicle.id} className="bus-item">
                      <div className="bus-color-line" style={{
                        backgroundColor: vehicle.type === 'metro' ? '#9B0265' : 
                                        vehicle.isSimulated ? '#e74c3c' : '#3498db'
                      }}></div>
                      <div className="bus-info">
                        <div className="bus-main">
                          <span className="bus-number">{vehicle.id}</span>
                          <span className={`bus-route ${vehicle.type}`}>
                            {vehicle.route}
                          </span>
                          {vehicle.isSimulated && <span className="sim-badge">SIM</span>}
                          {vehicle.type === 'metro' && <span className="metro-badge">METRO</span>}
                        </div>
                        <div className="bus-details">
                          <span className="bus-eta">
                            {formatTime(vehicle.intelligence?.etaToNextStop)} away
                          </span>
                          <span className="bus-speed">{vehicle.speed_kmph} km/h</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {getComingVehicles().length === 0 && (
                    <div className="no-buses-message">
                      <span>No live transit detected</span>
                      <small>Simulation vehicles will appear soon</small>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Trip Tab */}
          {activeTab === 'trip' && tripPlan && (
            <div className="trip-content">
              <div className="card">
                <div className="card-header">
                  <span className="card-icon">🗺️</span>
                  <h3>Your Trip</h3>
                </div>
                <div className="trip-summary">
                  <div className="summary-header">
                    <div className="summary-from-to">
                      <div className="location from">
                        <div className="location-dot blue"></div>
                        <div className="location-text">
                          <div className="location-name">Your Location</div>
                          <div className="location-address">Current position</div>
                        </div>
                      </div>
                      <div className="location to">
                        <div className="location-dot orange"></div>
                        <div className="location-text">
                          <div className="location-name">{tripPlan.destinationStop.stop.name}</div>
                          <div className="location-address">Bus/Metro Stop</div>
                        </div>
                      </div>
                    </div>
                    <div className="summary-stats">
                      <div className="stat">
                        <div className="stat-value">{formatTime(tripPlan.totalDuration)}</div>
                        <div className="stat-label">Total Time</div>
                      </div>
                      <div className="stat">
                        <div className="stat-value">{formatCurrency(tripPlan.fare)}</div>
                        <div className="stat-label">Fare</div>
                      </div>
                      <div className="stat">
                        <div className="stat-value">{tripPlan.type === 'metro' ? 'Metro' : 'Bus'}</div>
                        <div className="stat-label">Mode</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="trip-steps">
                    <div className="trip-step current">
                      <div className="step-icon">📍</div>
                      <div className="step-details">
                        <div className="step-title">Start from your location</div>
                        <div className="step-time">Now</div>
                      </div>
                    </div>

                    <div className="trip-step">
                      <div className="step-icon">
                        {travelMode === 'walking' ? '🚶' : travelMode === 'cycling' ? '🚴' : '🚗'}
                      </div>
                      <div className="step-details">
                        <div className="step-title">{travelMode === 'walking' ? 'Walk' : travelMode === 'cycling' ? 'Cycle' : 'Drive'} to {tripPlan.nearestStop.stop.name}</div>
                        <div className="step-time">{formatTime(tripPlan.toStopRoute?.duration)}</div>
                      </div>
                      <div className="step-distance">{Math.round(tripPlan.nearestStop.distance)}m</div>
                    </div>

                    <div className="trip-step">
                      <div className="step-icon">⏱️</div>
                      <div className="step-details">
                        <div className="step-title">Wait for {tripPlan.type === 'metro' ? 'metro' : 'bus'}</div>
                        <div className="step-time">{formatTime(tripPlan.waitTime)}</div>
                      </div>
                    </div>

                    <div className="trip-step">
                      <div className="step-icon">{tripPlan.type === 'metro' ? '🚇' : '🚌'}</div>
                      <div className="step-details">
                        <div className="step-title">{tripPlan.type === 'metro' ? 'Metro' : 'Bus'} to {tripPlan.destinationStop.stop.name}</div>
                        <div className="step-time">{formatTime(tripPlan.travelTime)}</div>
                      </div>
                      <div className="step-fare">{formatCurrency(tripPlan.fare)}</div>
                    </div>

                    <div className="trip-step">
                      <div className="step-icon">🚶</div>
                      <div className="step-details">
                        <div className="step-title">Walk to destination</div>
                        <div className="step-time">{formatTime(tripPlan.fromStopRoute?.duration)}</div>
                      </div>
                    </div>

                    <div className="trip-step">
                      <div className="step-icon">🎯</div>
                      <div className="step-details">
                        <div className="step-title">Arrive at destination</div>
                        <div className="step-time">Total: {formatTime(tripPlan.totalDuration)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Buses Tab */}
          {activeTab === 'buses' && (
            <div className="buses-content">
              <div className="card">
                <div className="card-header">
                  <span className="card-icon">🔍</span>
                  <h3>All Live Transit</h3>
                </div>
                <div className="buses-list detailed">
                  {vehicles.map(vehicle => (
                    <div key={vehicle.id} className="bus-item detailed">
                      <div className="bus-color-line" style={{
                        backgroundColor: vehicle.type === 'metro' ? '#9B0265' : 
                                        vehicle.isSimulated ? '#e74c3c' : '#3498db'
                      }}></div>
                      <div className="bus-info">
                        <div className="bus-main">
                          <span className="bus-number">{vehicle.id}</span>
                          <span className={`bus-route ${vehicle.type}`}>
                            {vehicle.route || 'Unassigned'}
                          </span>
                          <span className="bus-status">{vehicle.status}</span>
                          {vehicle.isSimulated && <span className="sim-badge">SIM</span>}
                          {vehicle.type === 'metro' && <span className="metro-badge">METRO</span>}
                        </div>
                        <div className="bus-details">
                          <span>Speed: {vehicle.speed_kmph} km/h</span>
                          <span>Location: {vehicle.lat?.toFixed(4)}, {vehicle.lon?.toFixed(4)}</span>
                        </div>
                        {vehicle.intelligence?.nextStop && (
                          <div className="bus-next-stop">
                            Next: {vehicle.intelligence.nextStop.name} ({formatTime(vehicle.intelligence.etaToNextStop)})
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {vehicles.length === 0 && (
                    <div className="no-buses-message">
                      <span>No transit vehicles detected</span>
                      <small>Enable simulation to see demo vehicles</small>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Stops Tab */}
          {activeTab === 'stops' && (
            <div className="stops-content">
              <div className="card">
                <div className="card-header">
                  <span className="card-icon">📍</span>
                  <h3>All Transit Stops</h3>
                </div>
                <div className="stops-list">
                  {stops.map(stop => {
                    const isMetroStop = routes.some(r => r.type === 'metro' && r.stops.some(s => s.id === stop.id));
                    return (
                      <div key={stop.id} className="stop-item">
                        <div className={`stop-marker ${isMetroStop ? 'metro' : ''}`}></div>
                        <div className="stop-info">
                          <div className="stop-name">{stop.name}</div>
                          <div className="stop-routes">
                            {routes.filter(route => 
                              route.stops.some(s => s.id === stop.id)
                            ).map(route => (
                              <span key={route.id} className={`route-badge ${route.type}`}>
                                {route.id}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="stop-buses">
                          {getBusesForStop(stop.id).length > 0 ? (
                            <span className="buses-count">{getBusesForStop(stop.id).length}</span>
                          ) : (
                            <span className="no-buses">0</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="map-container">
        <MapContainer 
          center={mapCenter}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          
          {/* User location */}
          <Marker position={[userLocation.lat, userLocation.lon]} icon={userIcon}>
            <Popup>
              <div className="popup-content">
                <strong>Your Location</strong>
                <br />
                {userLocation.lat.toFixed(4)}, {userLocation.lon.toFixed(4)}
              </div>
            </Popup>
          </Marker>
          
          {/* Transit stops */}
          {stops.map(stop => (
            <Marker key={stop.id} position={[stop.lat, stop.lon]} icon={getStopIcon(stop.id)}>
              <Popup>
                <div className="popup-content">
                  <strong>{stop.name}</strong>
                  <br />
                  <span className="buses-count">
                    {getBusesForStop(stop.id).length} vehicles serving
                  </span>
                  <br />
                  <small>
                    Routes: {routes.filter(route => 
                      route.stops.some(s => s.id === stop.id)
                    ).map(route => (
                      <span key={route.id} className={`route-badge ${route.type}`}>
                        {route.id}
                      </span>
                    ))}
                  </small>
                </div>
              </Popup>
            </Marker>
          ))}
          
          {/* Transit vehicles */}
          {vehicles.map(vehicle => (
            <Marker 
              key={vehicle.id} 
              position={[vehicle.lat, vehicle.lon]} 
              icon={getVehicleIcon(vehicle)}
            >
              <Popup>
                <div className="popup-content">
                  <strong>{vehicle.id}</strong>
                  <br />
                  Route: {vehicle.route || 'Unknown'}
                  <br />
                  Type: {vehicle.type === 'metro' ? 'Metro' : 'Bus'}
                  <br />
                  Speed: {vehicle.speed_kmph} km/h
                  <br />
                  Status: {vehicle.isSimulated ? 'Simulated' : 'Real'}
                  <br />
                  {vehicle.intelligence?.nextStop && (
                    <>Next: {vehicle.intelligence.nextStop.name}</>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
          
          {/* Route lines */}
          {routes.map(route => (
            <Polyline
              key={route.id}
              positions={route.stops.map(stop => [stop.lat, stop.lon])}
              color={route.type === 'metro' ? '#9B0265' : '#3498db'}
              weight={route.type === 'metro' ? 4 : 3}
              opacity={0.6}
            />
          ))}

          {/* Trip routes if available */}
          {tripPlan && (
            <>
              {/* Walking/Driving route to stop */}
              {tripPlan.toStopRoute && (
                <Polyline
                  positions={tripPlan.toStopRoute.geometry.coordinates.map(coord => [coord[1], coord[0]])}
                  color={travelMode === 'walking' ? '#27ae60' : travelMode === 'cycling' ? '#f39c12' : '#3498db'}
                  weight={4}
                  opacity={0.8}
                  dashArray={travelMode === 'walking' ? "5, 10" : null}
                />
              )}
              
              {/* Transit route */}
              {tripPlan.route && (
                <Polyline
                  positions={tripPlan.route.route.stops
                    .slice(tripPlan.route.fromStopIndex, tripPlan.route.toStopIndex + 1)
                    .map(stop => [stop.lat, stop.lon])}
                  color={tripPlan.type === 'metro' ? '#9B0265' : '#e74c3c'}
                  weight={5}
                  opacity={0.7}
                />
              )}
              
              {/* Walking route from stop to destination */}
              {tripPlan.fromStopRoute && (
                <Polyline
                  positions={tripPlan.fromStopRoute.geometry.coordinates.map(coord => [coord[1], coord[0]])}
                  color="#27ae60"
                  weight={4}
                  opacity={0.8}
                  dashArray="5, 10"
                />
              )}
            </>
          )}
        </MapContainer>
      </div>
    </div>
  )
}

export default App