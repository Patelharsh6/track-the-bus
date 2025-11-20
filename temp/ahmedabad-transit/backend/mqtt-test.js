// Simple MQTT test broker simulation
const mqtt = require('mqtt');

class MQTTTestBroker {
    constructor() {
        this.isRunning = false;
    }
    
    startTestBroker() {
        if (this.isRunning) return;
        
        console.log('🚀 Starting MQTT test broker on port 1883...');
        
        // Simulate MQTT messages for testing
        setInterval(() => {
            this.simulateBusData();
        }, 5000);
        
        this.isRunning = true;
    }
    
    simulateBusData() {
        const buses = [
            { id: 'BUS-001', lat: 23.030, lon: 72.580, route: 'R1' },
            { id: 'BUS-002', lat: 23.045, lon: 72.560, route: 'R1' },
            { id: 'BUS-003', lat: 23.050, lon: 72.620, route: 'R2' }
        ];
        
        buses.forEach(bus => {
            // Add some random movement
            bus.lat += (Math.random() - 0.5) * 0.001;
            bus.lon += (Math.random() - 0.5) * 0.001;
            
            const telemetry = {
                lat: bus.lat,
                lon: bus.lon,
                speed_kmph: (20 + Math.random() * 20).toFixed(2),
                status: 'OK',
                timestamp: new Date().toISOString()
            };
            
            // In a real scenario, this would be published to MQTT
            console.log(`📡 Simulated MQTT: ${bus.id}`, telemetry);
        });
    }
}

module.exports = MQTTTestBroker;

// Start test broker if run directly
if (require.main === module) {
    const broker = new MQTTTestBroker();
    broker.startTestBroker();
}