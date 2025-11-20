const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mqtt = require('mqtt');
const cors = require('cors');
const path = require('path');
const os = require('os');

// Import engines
const OSRMEngine = require('./engine/OSRM');
const RouteEngine = require('./engine/Routes');
const ETAEngine = require('./engine/ETA');
const SimulationEngine = require('./simulation/simulation');

// Function to get local IP address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const interface of interfaces[name]) {
            if (interface.family === 'IPv4' && !interface.internal) {
                return interface.address;
            }
        }
    }
    return 'localhost';
}

class AhmedabadTransitServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        
        // Initialize engines
        this.osrm = new OSRMEngine();
        this.routes = new RouteEngine();
        this.eta = new ETAEngine(this.osrm, this.routes);
        this.simulation = new SimulationEngine(this.io);
        
        this.vehicleData = new Map();
        this.vehicleRouteMap = new Map();
        this.mqttClient = null;
        this.simulationEnabled = true;
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocket();
        this.setupMQTT();
        this.loadInitialData();
        
        // Auto-start simulation if enabled
        if (this.simulationEnabled) {
            this.startSimulationForDemo();
        }
    }
    
    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.static(path.join(__dirname, '../frontend/dist')));
        this.app.use('/admin', express.static(path.join(__dirname, 'admin')));
    }
    
    setupRoutes() {
        // API Routes
        this.app.get('/api/health', (req, res) => {
            res.json({ 
                status: 'OK', 
                message: 'Ahmedabad Transit Server Running',
                mqtt: this.mqttClient ? 'Connected' : 'Disabled',
                simulation: this.simulationEnabled ? 'Running' : 'Stopped'
            });
        });
        
        this.app.get('/api/routes', (req, res) => {
            res.json(this.routes.getAllRoutes());
        });
        
        this.app.get('/api/stops', (req, res) => {
            res.json(this.routes.getAllStops());
        });
        
        this.app.get('/api/vehicles', (req, res) => {
            const vehicles = Array.from(this.vehicleData.entries()).map(([id, data]) => ({
                id,
                ...data,
                route: this.vehicleRouteMap.get(id),
                intelligence: this.eta.getBusIntelligence(id),
                isSimulated: id.startsWith('SBUS-')
            }));
            res.json(vehicles);
        });

        // Compatible with your previous /latest endpoint
        this.app.get("/latest", (req, res) => {
            const allData = {};
            this.vehicleData.forEach((value, key) => {
                allData[key] = {
                    ...value,
                    isSimulated: key.startsWith('SBUS-')
                };
            });
            res.json(allData);
        });

        this.app.get("/buses", (req, res) => {
            res.json(Array.from(this.vehicleData.keys()));
        });
        
        this.app.post('/api/trip-plan', async (req, res) => {
            try {
                const { fromLat, fromLon, toLat, toLon, mode = 'walking' } = req.body;
                const tripPlan = await this.eta.calculateTripPlan(
                    { lat: fromLat, lon: fromLon },
                    { lat: toLat, lon: toLon },
                    mode
                );
                res.json(tripPlan);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Search stops by name
        this.app.get('/api/search-stops', (req, res) => {
            const query = (req.query.q || '').toLowerCase();
            const stops = this.routes.getAllStops();
            const filtered = stops.filter(stop => 
                stop.name.toLowerCase().includes(query)
            );
            res.json(filtered.slice(0, 10)); // Limit to 10 results
        });
        
        // Simulation control routes
        this.app.post('/api/simulation/start', (req, res) => {
            this.simulationEnabled = true;
            this.simulation.startSimulation();
            res.json({ status: 'Simulation started', enabled: true });
        });
        
        this.app.post('/api/simulation/stop', (req, res) => {
            this.simulationEnabled = false;
            this.simulation.stopSimulation();
            res.json({ status: 'Simulation stopped', enabled: false });
        });
        
        this.app.get('/api/simulation/status', (req, res) => {
            res.json({ 
                enabled: this.simulationEnabled,
                status: this.simulation.getSimulationStatus()
            });
        });
        
        this.app.post('/api/simulation/add-bus', (req, res) => {
            const busConfig = {
                id: `SBUS-TEST-${Date.now()}`,
                routeId: 'R1',
                direction: 'forward',
                currentStopIndex: 0,
                position: { lat: 23.026239, lon: 72.587448 },
                speed: 8,
                status: 'moving'
            };
            this.simulation.addBus(busConfig);
            res.json({ status: 'Test bus added', busId: busConfig.id });
        });
        
        // Admin route
        this.app.get('/admin', (req, res) => {
            res.sendFile(path.join(__dirname, 'admin/index.html'));
        });

        // Network info endpoint
        this.app.get('/api/network', (req, res) => {
            const localIP = getLocalIP();
            res.json({
                localIP: localIP,
                port: process.env.PORT || 3000,
                urls: {
                    local: `http://localhost:${process.env.PORT || 3000}`,
                    network: `http://${localIP}:${process.env.PORT || 3000}`,
                    frontend: `http://${localIP}:5173`
                }
            });
        });
    }
    
    setupSocket() {
        this.io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);
            
            // Send initial data
            socket.emit('initialData', {
                routes: this.routes.getAllRoutes(),
                stops: this.routes.getAllStops(),
                vehicles: Array.from(this.vehicleData.entries()).map(([id, data]) => ({
                    id,
                    ...data,
                    route: this.vehicleRouteMap.get(id),
                    isSimulated: id.startsWith('SBUS-')
                })),
                mqttStatus: this.mqttClient ? 'connected' : 'disabled',
                simulationEnabled: this.simulationEnabled
            });
            
            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
            });
        });
    }
    
    setupMQTT() {
        try {
            const MQTT_URL = "mqtt://test.mosquitto.org:1883";
            console.log('🔗 Connecting to MQTT broker:', MQTT_URL);
            
            this.mqttClient = mqtt.connect(MQTT_URL, {
                reconnectPeriod: 5000,
                connectTimeout: 8000
            });
            
            this.mqttClient.on('connect', () => {
                console.log('✅ Connected to MQTT broker');
                this.mqttClient.subscribe("vehicles/+/telemetry");
            });
            
            this.mqttClient.on('message', (topic, payload) => {
                try {
                    const data = JSON.parse(payload.toString());
                    // Use BUS- prefix for real vehicles from MQTT
                    const id = data.vehicle_id ? `BUS-${data.vehicle_id}` : `BUS-${Date.now()}`;

                    // Store latest info
                    this.vehicleData.set(id, {
                        ...data,
                        lat: data.latitude || data.lat,
                        lon: data.longitude || data.lon,
                        speed_kmph: data.speed_kmph || 0,
                        status: data.status || 'OK',
                        lastUpdate: Date.now(),
                        timestamp: new Date().toISOString(),
                        isSimulated: false
                    });

                    // Update bus intelligence
                    const routeId = this.vehicleRouteMap.get(id);
                    if (routeId) {
                        this.eta.updateBusIntelligence(id, data, routeId);
                    }

                    // Broadcast to all connected clients
                    this.io.emit('vehicleUpdate', {
                        id: id,
                        ...data,
                        route: routeId,
                        intelligence: this.eta.getBusIntelligence(id),
                        isSimulated: false
                    });

                    console.log("📡 MQTT →", data);

                } catch (e) {
                    console.log("❌ MQTT JSON Parse Error:", payload.toString());
                }
            });
            
            this.mqttClient.on('error', (error) => {
                console.log('⚠️ MQTT connection error:', error.message);
                console.log('🚌 Using simulation mode only');
                this.mqttClient = null;
            });
            
        } catch (error) {
            console.log('⚠️ MQTT initialization failed, using simulation mode only');
            this.mqttClient = null;
        }
    }
    
    loadInitialData() {
        this.routes.loadInitialData();
        
        // Setup default vehicle-route mapping for real buses
        this.vehicleRouteMap.set('BUS-001', 'R1');
        this.vehicleRouteMap.set('BUS-002', 'R2');
        this.vehicleRouteMap.set('BUS-003', 'R3');
        
        console.log('✅ Initial data loaded');
    }
    
    startSimulationForDemo() {
        setTimeout(() => {
            console.log('🚌 Starting simulation for demo...');
            this.simulation.startSimulation();
        }, 2000);
    }
    
    start(port = 3000) {
        let HOST = '0.0.0.0';
        const localIP = getLocalIP();
        
        this.server.listen(port, HOST, () => {
            console.log(`🚀 Ahmedabad Transit Server running`);
            console.log(`📍 Local: http://localhost:${port}`);
            console.log(`🌍 Network: http://${localIP}:${port}`);
            console.log(`🗺️  Frontend: http://${localIP}:5173`);
            console.log(`⚙️  Admin: http://${localIP}:${port}/admin`);
            console.log(`📡 MQTT: ${this.mqttClient ? 'Enabled' : 'Disabled (using simulation)'}`);
            console.log(`🚌 Simulation: ${this.simulationEnabled ? 'Enabled' : 'Disabled'}`);
            console.log(`\n📋 Network Info:`);
            console.log(`   Local Access: http://localhost:${port}`);
            console.log(`   LAN Access: http://${localIP}:${port}`);
            console.log(`   Frontend: http://${localIP}:5173`);
        });
    }
}

// Start the server
const server = new AhmedabadTransitServer();
server.start(process.env.PORT || 3000);

module.exports = AhmedabadTransitServer;