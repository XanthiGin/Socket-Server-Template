const  WebSocket = require ("ws");
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const https = require('https');
const cors = require('cors');
const express = require('express');

const app = express();

const options = {
    key: fs.readFileSync('server.key'),
    cert: fs.readFileSync('server.crt')
};

const server = https.createServer(options, (req, res) => {
    // Handle regular HTTPS requests
});

server.listen(443, () => {
    console.log('HTTPS server running on port 443');
});

app.use(cors());

const wss = new WebSocket.Server({ server });

var CLIENTS=[];
var DRONES = [];
var folderName = "";
wss.on("connection", ws => {
    ws.id = uuidv4();
	ws.on("close", () => {
        CLIENTS.forEach(client => {
            console.log("WS Closed" + client.id);
        });
        if(CLIENTS.length == 1 && CLIENTS[0].id == ws.id)
            CLIENTS = [];
        else if(CLIENTS.length > 0)
            CLIENTS = CLIENTS.filter((client) => client.id == ws.id);

        if(DRONES.length == 1 && DRONES[0].id == ws.id)
            DRONES = [];
        else if(DRONES.length > 0)
            DRONES = DRONES.filter((drone) => drone.id == ws.id);

        Log("Client " + ws.id + " has disconnected!");
        CLIENTS.forEach(client => {
            console.log("---!!!" + client.id);
        });
	});
    ws.on("message", jsondata => {
        //const obj = JSON.parse(data);
        Log(`Client with WebSocketConnectionID: ${ws.id} has sent us: ${jsondata}`);
        const obj1 = JSON.parse(jsondata);
        if(obj1.hasOwnProperty('CesiumApp')){
            var CesiumObj = obj1.CesiumApp;
            switch (CesiumObj.Method){
                case "CesiumAppConnection":
                    var webSocketConnectionID = ws.id;
                    ws.Type = "CesiumApp";
                    CLIENTS.push(ws);
                    Log("Cesium App Connection with ClientID: " + CesiumObj.CesiumClientID + ", and WebSocketConnectionID: " + webSocketConnectionID + ".");
                    ws.send(JSON.stringify({WebSocketServer: "WS_Connection_OK", WebSocketConnectionID: webSocketConnectionID}));
                break;
                case "Post_Drone_Session_To_Save":
                    if(CesiumObj.hasOwnProperty('DroneObject')){
                        var droneSessionFiles = CesiumObj.DroneObject.NumericFileNames;
                        var drone_id = CesiumObj.DroneObject.Drone_id;
                        var drone_model = CesiumObj.DroneObject.Drone_model;
                        var drone_serialNumber = CesiumObj.DroneObject.Drone_serialNumber;
                        var drone_socketID = CesiumObj.DroneObject.Drone_socketID;
                        var session_date = new Date().toISOString().split('T')[0]; 
                        var server_M3U8_Folder = CesiumObj.DroneObject.Server_M3U8_Folder;
                        const folderName = "" + drone_id + "-" +  Date.now();
                        //const folderName2 = "Storage" + drone_model + drone_serialNumber + session_date + drone_socketID;
                        const folderName2 = `Storage\\${drone_model}\\${drone_serialNumber}\\${session_date}\\${drone_socketID}`;

                        var dirPath = "" + server_M3U8_Folder;
                        Log("On Post_Drone_Session_To_Save: Path: " + dirPath + ", FolderName: " + folderName);
                        fs.mkdir(folderName, (err) => {
                            if (err) {
                                console.error(`Error creating folder: ${err}`);
                                Log(`Error creating folder: ${err} on Post_Drone_Session_To_Save`);
                            } else {
                                Log(`Folder "${folderName}" created successfully on Post_Drone_Session_To_Save`);
                            }
                        });
                        
                        droneSessionFiles.push(".m3u8");
                        droneSessionFiles.forEach((fileName) => {
        
                            const sourceUrl = dirPath + fileName;
                            const destinationPath = folderName + "\\" + fileName;
                            async function downloadFile(url, destination) {
                                const response = await axios({
                                method: 'get',
                                url: url,
                                responseType: 'stream',
                                });
                        
                                // Pipe the response stream into a writable stream (createWriteStream)
                                response.data.pipe(fs.createWriteStream(destination));
                            
                                return new Promise((resolve, reject) => {
                                response.data.on('end', () => resolve(destination));
                                response.data.on('error', (error) => reject(error));
                                });
                            }
                        
                            // Use the downloadFile function and then rename the file
                            downloadFile(sourceUrl, destinationPath)
                            .then((destination) => {
                                Log("File created succesfully for Save_Drone_Session: " + destination);
                            })
                            .catch((error) => {
                                console.error('Error downloading file:', error);
                                Log('Error downloading file:', error);
                            });
                        });
        
                        //const infoToWrite = 'Drone_id: ' + drone_id + ";Drone_model: " + drone_model + ";Drone_initialBatteryPercent: " + drone_initialBatteryPercent + ";Drone_batteryPercent: " + drone_batteryPercent + ";Drone_DronePathPositions: " + drone_DronePathPositions;
                        // Write information to a text file in the destination folder
                        //fs.writeFileSync(folderName + "\\" +"info4.txt", infoToWrite, 'utf-8');
                        fs.writeFileSync(folderName + "\\" +"info.txt", CesiumObj.DroneObjectJ, 'utf-8');
                        Log(`Text file info.txt created and data written successfully`);
                    }
                break;
                case "Request_Saved_Drone_Sessions":
                    var clientID = CesiumObj.WebSocketConnectionID;
                    fs.readdir("SavedSessions", (err, files) => {
                        Log(files.toString());
                        CLIENTS.forEach(client => {
                            if(client.id == clientID){
                                var json = JSON.stringify({Files: files, WebSocketServer: "Response_GetSavedDroneSessions" });
                                client.send(json);
                            }
        
                        });
                    });
                break;
                case "Request_Selected_Folder_Files":
                    folderName = CesiumObj.FolderName;
                    var clientID = CesiumObj.WebSocketConnectionID;
                    fs.readdir("SavedSessions/" + CesiumObj.FolderName, (err, files) => {
                        Log("Foldername " + CesiumObj.FolderName);
                        Log("Files " + files);
                        var txtPath = "SavedSessions/" + CesiumObj.FolderName + "/info.txt";
                        var manifestPath = "SavedSessions/" + CesiumObj.FolderName + "/.m3u8";
                        //implement offset here
                        Log("Txt path " + txtPath);
                        Log("Manifest path " + manifestPath);
                        fs.readFile(txtPath, 'utf8', function(err, data) {
                            if (err) throw err;
                            Log("FolderName:" + folderName);
                            fs.readFile(manifestPath, 'utf8', function(err2, data2){
                                if (err2) throw err2;
                                Log("FolderName:" + folderName);
                                CLIENTS.forEach(client => {
                                    if(client.id == clientID){
                                        var json = JSON.stringify({Files: files, WebSocketServer: "Response_Selected_Folder_Files", InfoTxt: data, FolderName: folderName, Manifest: data2 });
                                        client.send(json);
                                    }
                                });
                            });
                        });
                    });
                break;
                case "Send_Message_To_Drone":
                    DRONES.forEach(drone => {
                       // if(drone.id == CesiumObj.DroneID)
                            drone.send(JSON.stringify(CesiumObj.Packet));
                        
                    });
                break;
            }
        }
        else if(obj1.hasOwnProperty('DroneApp')){
            var DroneObj = obj1.DroneApp;
            if (DroneObj.hasOwnProperty('SocketTag')){
                switch (DroneObj.SocketTag){
                    case "DroneConnection":
                        ws.Type = "Drone";
                        DRONES.push(ws);
                        console.log("Drones on conection: " + DRONES.length);
                        sendLocationToAllBrowsers(DroneObj);
                        ws.send(JSON.stringify({Packet: { Method: "DRONE_CONNECTION", StringInput: ws.id}}));

                    break;
                    case "DroneLocation":
                        sendLocationToAllBrowsers(DroneObj);
                    break;
                    case "DroneDisConnection":
                            sendLocationToAllBrowsers(DroneObj);
                            DRONES = DRONES.filter(drone => {
                                return drone.SocketID != DroneObj.SocketID;
                              });
                              console.log("Drones on disconection: " + DRONES.length);
                        break;
                }
            }
        }
        //Log("Current clients length is: " + CLIENTS.length);
	});


});

function sendLocationToAllBrowsers(jsondata) {
    //Log("Send location to all browser clients: " + CLIENTS.length);
    CLIENTS.forEach(client => {
        var json = JSON.stringify(jsondata);
        client.send(json);
    });
}


function saveMessage(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;

    fs.appendFile('app.log', logEntry, (err) => {
        if (err) {
            console.error('Failed to write to log file:', err);
        }
    });
}

function Log(message){
    saveMessage(message);
    console.log(message);
}
