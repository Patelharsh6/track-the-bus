// backend/broker.js
import aedes from "aedes";
import net from "net";

const broker = aedes();
const server = net.createServer(broker.handle);

const PORT = 1883;

server.listen(PORT, () => {
  console.log(`🚀 MQTT broker running on port ${PORT}`);
});

broker.on("client", (client) => {
  console.log("Client connected:", client?.id);
});

broker.on("publish", (packet, client) => {
  if (client) {
    console.log(`📩 ${client.id} → ${packet.topic}: ${packet.payload.toString()}`);
  }
});
