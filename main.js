const http = require("http");
const express = require("express");
const app = express();

app.use(express.static("public"));
// require("dotenv").config();

const serverPort = process.env.PORT || 3000;
const server = http.createServer(app);
const WebSocket = require("ws");

let keepAliveId;
var DRONES = [];
var CESIUM_APPS = [];

const wss =
  process.env.NODE_ENV === "production"
    ? new WebSocket.Server({ server })
    : new WebSocket.Server({ port: 5001 });

server.listen(serverPort);
console.log(`Server started on port ${serverPort} in stage ${process.env.NODE_ENV}`);
wss.getUniqueID = function () {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    }
    return s4() + s4() + '-' + s4();
};
wss.on("connection", function (ws, req) {
  const params = new URLSearchParams(req.url.split('?')[1]);
  const client_type = params.get('client_type');
  const client_id = params.get('client_id');
  ws.id = wss.getUniqueID();
  ws.client_id = client_id;
  ws.client_type = client_type;
  if(client_type == "DRONE")
    DRONES.push(ws);
  else if(client_type == "CESIUM_APP")
    CESIUM_APPS.push(ws);
  console.log("Connection Opened");
  console.log("Client size: ", wss.clients.size + ", Current token id: " + ws.id + ", Current client id: " +  client_id + ", Current client type: " +  client_type);

  if (wss.clients.size === 1) {
    console.log("first connection. starting keepalive");
    keepServerAlive();
  }

  ws.on("message", (data) => {
    let stringifiedData = data.toString();
    if (stringifiedData === 'ping') {
      console.log('keepAlive');
      return;
    }
    broadcast(ws, stringifiedData, false);
  });

  ws.on("close", (data) => {
    console.log("closing connection for client with client id:" + ws.id + ", and type:" + ws.client_type);
    console.log('DRONES LENGTH: ' + DRONES.length + ', CESIUM_APPS LENGTH: ' + CESIUM_APPS.length);
    if(ws.client_type == "DRONE"){
      let index = DRONES.findIndex(w => w.id === ws.id);
      if (index !== -1) {
        DRONES.splice(index, 1);
      }
    }
    else if(ws.client_type == "CESIUM_APP"){
      let index = CESIUM_APPS.findIndex(w => w.id === ws.id);
      if (index !== -1) {
        CESIUM_APPS.splice(index, 1);
      }
    }
         console.log('DRONES LENGTH: ' + DRONES.length + ', CESIUM_APPS LENGTH: ' + CESIUM_APPS.length); 
    if (wss.clients.size === 0) {
      console.log("last client disconnected, stopping keepAlive interval");
      clearInterval(keepAliveId);
    }
  });
});

// Implement broadcast function because of ws doesn't have it
const broadcast = (ws, message, includeSelf) => {
  if (includeSelf) {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  } else {
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
};

/**
 * Sends a ping message to all connected clients every 50 seconds
 */
 const keepServerAlive = () => {
  keepAliveId = setInterval(() => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send('ping');
      }
    });
  }, 50000);
};


app.get('/', (req, res) => {
    res.send('Hello World!');
});
