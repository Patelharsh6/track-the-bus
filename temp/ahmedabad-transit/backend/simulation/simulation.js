const axios = require('axios');

class SimulationEngine {
    constructor(io) {
        this.io = io;
        this.simulatedBuses = new Map();
        this.simulatedMetros = new Map();
        this.isRunning = false;
        console.log('✅ Simulation Engine initialized');
    }

    startSimulation() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        console.log('🚌 Starting transit simulation...');

        this.createSimulatedVehicles();
        
        this.movementInterval = setInterval(() => {
            this.moveBuses();
            this.moveMetros();
        }, 2000);

        console.log(`✅ Simulation started with ${this.simulatedBuses.size} buses and ${this.simulatedMetros.size} metros`);
    }

    stopSimulation() {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        clearInterval(this.movementInterval);
        this.simulatedBuses.clear();
        this.simulatedMetros.clear();
        console.log('🛑 Simulation stopped');
    }

    createSimulatedVehicles() {
        // Simulated Buses
        const busConfigs = [
            {
                id: 'SBUS-001',
                routeId: 'R1',
                direction: 'forward',
                currentStopIndex: 0,
                position: { lat: 23.026239, lon: 72.587448 },
                speed: 8,
                status: 'moving',
                type: 'bus'
            },
            {
                id: 'SBUS-002', 
                routeId: 'R1',
                direction: 'reverse',
                currentStopIndex: 5,
                position: { lat: 23.066396, lon: 72.535848 },
                speed: 7,
                status: 'stopped',
                type: 'bus'
            },
            {
                id: 'SBUS-003',
                routeId: 'R2', 
                direction: 'forward',
                currentStopIndex: 1,
                position: { lat: 23.051396, lon: 72.621848 },
                speed: 9,
                status: 'moving',
                type: 'bus'
            }
        ];

        // Simulated Metros
        const metroConfigs = [
            {
                id: 'SMETRO-001',
                routeId: 'M1',
                direction: 'forward',
                currentStopIndex: 0,
                position: { lat: 22.991396, lon: 72.681848 },
                speed: 15,
                status: 'moving',
                type: 'metro'
            },
            {
                id: 'SMETRO-002',
                routeId: 'M2',
                direction: 'forward',
                currentStopIndex: 0,
                position: { lat: 23.101396, lon: 72.581848 },
                speed: 16,
                status: 'moving',
                type: 'metro'
            }
        ];

        busConfigs.forEach(config => {
            this.simulatedBuses.set(config.id, config);
        });

        metroConfigs.forEach(config => {
            this.simulatedMetros.set(config.id, config);
        });
    }

    moveBuses() {
        for (const [busId, bus] of this.simulatedBuses.entries()) {
            if (bus.status !== 'moving') continue;

            const route = this.getRoute(bus.routeId);
            if (!route) continue;

            const stops = bus.direction === 'forward' ? route.stops : [...route.stops].reverse();
            const nextStopIndex = bus.currentStopIndex + 1;
            
            if (nextStopIndex >= stops.length) {
                bus.direction = bus.direction === 'forward' ? 'reverse' : 'forward';
                bus.currentStopIndex = 0;
                continue;
            }

            const currentStop = stops[bus.currentStopIndex];
            const nextStop = stops[nextStopIndex];

            const distance = this.calculateDistance(bus.position, nextStop);
            const moveDistance = bus.speed * 2;

            if (distance <= moveDistance) {
                bus.position = { ...nextStop };
                bus.currentStopIndex = nextStopIndex;
                bus.status = 'stopped';
                
                setTimeout(() => {
                    if (this.simulatedBuses.has(busId)) {
                        this.simulatedBuses.get(busId).status = 'moving';
                    }
                }, 10000); // 10 second stop
            } else {
                const ratio = moveDistance / distance;
                bus.position.lat = bus.position.lat + (nextStop.lat - bus.position.lat) * ratio;
                bus.position.lon = bus.position.lon + (nextStop.lon - bus.position.lon) * ratio;
            }

            this.emitSimulatedData(bus);
        }
    }

    moveMetros() {
        for (const [metroId, metro] of this.simulatedMetros.entries()) {
            if (metro.status !== 'moving') continue;

            const route = this.getRoute(metro.routeId);
            if (!route) continue;

            const stops = metro.direction === 'forward' ? route.stops : [...route.stops].reverse();
            const nextStopIndex = metro.currentStopIndex + 1;
            
            if (nextStopIndex >= stops.length) {
                metro.direction = metro.direction === 'forward' ? 'reverse' : 'forward';
                metro.currentStopIndex = 0;
                continue;
            }

            const currentStop = stops[metro.currentStopIndex];
            const nextStop = stops[nextStopIndex];

            const distance = this.calculateDistance(metro.position, nextStop);
            const moveDistance = metro.speed * 2;

            if (distance <= moveDistance) {
                metro.position = { ...nextStop };
                metro.currentStopIndex = nextStopIndex;
                metro.status = 'stopped';
                
                setTimeout(() => {
                    if (this.simulatedMetros.has(metroId)) {
                        this.simulatedMetros.get(metroId).status = 'moving';
                    }
                }, 15000); // 15 second stop for metros
            } else {
                const ratio = moveDistance / distance;
                metro.position.lat = metro.position.lat + (nextStop.lat - metro.position.lat) * ratio;
                metro.position.lon = metro.position.lon + (nextStop.lon - metro.position.lon) * ratio;
            }

            this.emitSimulatedData(metro);
        }
    }

    emitSimulatedData(vehicle) {
        const telemetry = {
            lat: vehicle.position.lat,
            lon: vehicle.position.lon,
            speed_kmph: (vehicle.speed * 3.6).toFixed(2),
            status: 'OK',
            timestamp: new Date().toISOString(),
            simulated: true
        };

        this.io.emit('vehicleUpdate', {
            id: vehicle.id,
            ...telemetry,
            route: vehicle.routeId,
            type: vehicle.type,
            intelligence: {
                nextStop: this.getRoute(vehicle.routeId)?.stops[vehicle.currentStopIndex + 1],
                status: vehicle.status,
                etaToNextStop: vehicle.status === 'stopped' ? 0 : 30
            },
            isSimulated: true
        });
    }

    getRoute(routeId) {
        const routes = {
            'R1': {
                stops: [
                    { id: 'S1', name: 'Lal Darwaja', lat: 23.026239, lon: 72.587448 },
                    { id: 'S2', name: 'Khadia', lat: 23.030000, lon: 72.585000 },
                    { id: 'S3', name: 'Gheekanta', lat: 23.032000, lon: 72.583000 },
                    { id: 'S4', name: 'Income Tax', lat: 23.038396, lon: 72.561848 },
                    { id: 'S5', name: 'Navrangpura', lat: 23.046896, lon: 72.556848 },
                    { id: 'S6', name: 'Stadium', lat: 23.051396, lon: 72.551348 },
                    { id: 'S7', name: 'University', lat: 23.056896, lon: 72.545848 },
                    { id: 'S8', name: 'Commerce Six Roads', lat: 23.061396, lon: 72.540848 },
                    { id: 'S9', name: 'Gurukul', lat: 23.066396, lon: 72.535848 }
                ]
            },
            'R2': {
                stops: [
                    { id: 'S10', name: 'Bapunagar', lat: 23.041896, lon: 72.631848 },
                    { id: 'S11', name: 'Ramol', lat: 23.045000, lon: 72.628000 },
                    { id: 'S12', name: 'Saraspur', lat: 23.051396, lon: 72.621848 },
                    { id: 'S13', name: 'Naroda', lat: 23.054000, lon: 72.618000 },
                    { id: 'S14', name: 'CTM Cross Road', lat: 23.056896, lon: 72.611848 },
                    { id: 'S15', name: 'Amraiwadi', lat: 23.060000, lon: 72.605000 },
                    { id: 'S16', name: 'Maninagar', lat: 23.066396, lon: 72.601848 }
                ]
            },
            'M1': {
                stops: [
                    { id: 'M1-1', name: 'Vastral Gam', lat: 22.991396, lon: 72.681848 },
                    { id: 'M1-2', name: 'Jhansi Ki Rani', lat: 23.011396, lon: 72.661848 },
                    { id: 'M1-3', name: 'Apparel Park', lat: 23.021396, lon: 72.651848 },
                    { id: 'M1-4', name: 'Amraiwadi', lat: 23.031396, lon: 72.641848 },
                    { id: 'M1-5', name: 'Rabari Colony', lat: 23.041396, lon: 72.631848 },
                    { id: 'M1-6', name: 'Jivraj Park', lat: 23.021396, lon: 72.571848 },
                    { id: 'M1-7', name: 'Rajiv Nagar', lat: 23.031396, lon: 72.561848 },
                    { id: 'M1-8', name: 'Shreyas', lat: 23.041396, lon: 72.551848 },
                    { id: 'M1-9', name: 'Paldi', lat: 23.021396, lon: 72.571848 },
                    { id: 'M1-10', name: 'Gandhigram', lat: 23.031396, lon: 72.561848 },
                    { id: 'M1-11', name: 'Old High Court', lat: 23.026239, lon: 72.587448 },
                    { id: 'M1-12', name: 'Shahpur', lat: 23.036239, lon: 72.577448 },
                    { id: 'M1-13', name: 'Gheekanta', lat: 23.032000, lon: 72.583000 },
                    { id: 'M1-14', name: 'Kalupur Railway Station', lat: 23.026239, lon: 72.597448 },
                    { id: 'M1-15', name: 'Kankaria East', lat: 23.016239, lon: 72.607448 },
                    { id: 'M1-16', name: 'Kankaria West', lat: 23.011396, lon: 72.601848 },
                    { id: 'M1-17', name: 'Jhulta Minar', lat: 23.006239, lon: 72.597448 }
                ]
            },
            'M2': {
                stops: [
                    { id: 'M2-1', name: 'Motera Stadium', lat: 23.101396, lon: 72.581848 },
                    { id: 'M2-2', name: 'Sabarmati', lat: 23.081396, lon: 72.581848 },
                    { id: 'M2-3', name: 'AEC', lat: 23.071396, lon: 72.581848 },
                    { id: 'M2-4', name: 'Sabarmati Railway Station', lat: 23.066396, lon: 72.581848 },
                    { id: 'M2-5', name: 'Ranip', lat: 23.086000, lon: 72.576000 },
                    { id: 'M2-6', name: 'Vadaj', lat: 23.091000, lon: 72.571000 },
                    { id: 'M2-7', name: 'Usmanpura', lat: 23.051396, lon: 72.571848 },
                    { id: 'M2-8', name: 'Vijay Nagar', lat: 23.046396, lon: 72.566848 },
                    { id: 'M2-9', name: 'Old High Court', lat: 23.026239, lon: 72.587448 },
                    { id: 'M2-10', name: 'Gandhigram', lat: 23.031396, lon: 72.561848 },
                    { id: 'M2-11', name: 'Stadium', lat: 23.051396, lon: 72.551348 },
                    { id: 'M2-12', name: 'Commerce Six Roads', lat: 23.061396, lon: 72.540848 },
                    { id: 'M2-13', name: 'Gurukul', lat: 23.066396, lon: 72.535848 },
                    { id: 'M2-14', name: 'Juna Wadaj', lat: 23.076396, lon: 72.531848 },
                    { id: 'M2-15', name: 'APMC', lat: 23.086396, lon: 72.521848 }
                ]
            }
        };
        
        return routes[routeId];
    }

    calculateDistance(point1, point2) {
        const R = 6371e3;
        const φ1 = point1.lat * Math.PI / 180;
        const φ2 = point2.lat * Math.PI / 180;
        const Δφ = (point2.lat - point1.lat) * Math.PI / 180;
        const Δλ = (point2.lon - point1.lon) * Math.PI / 180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;
    }

    addBus(busConfig) {
        if (!busConfig.id.startsWith('SBUS-')) {
            busConfig.id = `SBUS-${busConfig.id}`;
        }
        this.simulatedBuses.set(busConfig.id, busConfig);
        console.log(`✅ Added simulated bus: ${busConfig.id}`);
    }

    addMetro(metroConfig) {
        if (!metroConfig.id.startsWith('SMETRO-')) {
            metroConfig.id = `SMETRO-${metroConfig.id}`;
        }
        this.simulatedMetros.set(metroConfig.id, metroConfig);
        console.log(`✅ Added simulated metro: ${metroConfig.id}`);
    }

    removeVehicle(vehicleId) {
        if (vehicleId.startsWith('SBUS-')) {
            this.simulatedBuses.delete(vehicleId);
        } else if (vehicleId.startsWith('SMETRO-')) {
            this.simulatedMetros.delete(vehicleId);
        }
        console.log(`🗑️ Removed simulated vehicle: ${vehicleId}`);
    }

    getSimulationStatus() {
        return {
            isRunning: this.isRunning,
            busCount: this.simulatedBuses.size,
            metroCount: this.simulatedMetros.size,
            buses: Array.from(this.simulatedBuses.values()),
            metros: Array.from(this.simulatedMetros.values())
        };
    }
}

module.exports = SimulationEngine;