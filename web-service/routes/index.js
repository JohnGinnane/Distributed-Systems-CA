var express          = require('express');
var router           = express.Router();
const grpc           = require("@grpc/grpc-js");
const protoLoader    = require("@grpc/proto-loader");
const path           = require("path");
const ws             = require("ws");
const uuid           = require("uuid");

let WAREHOUSE_ADDRESS = "127.0.0.1:50001";

const warehouseProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, "../../protos/warehouse.proto"))).warehouse;
const warehouseService = new warehouseProto.WarehouseService(WAREHOUSE_ADDRESS, grpc.credentials.createInsecure());

// Set up web socket server to write warehouse data back to page
const wss = new ws.WebSocketServer({ port: 3001 });
const webSocketClients = [];

function generateNewID(length) {
    length = length || 4;

    let newID = "";

    // Keep generating new IDs until we find one that is unique
    while (newID == "" || webSocketClients.find(x => x.id == newID)) {
        // Keep appending the new ID until it's long enough
        while (newID.length < length) {
            newID += uuid.v4().replaceAll("-", "");
        }
        
        // Then truncate to match length
        newID = newID.substring(1, length+1); // Add 1 as substring doesn't include last character
    }

    return newID;
}

/* GET home page. */
router.get('/', function(req, res, next) {
    // Server side JS
    const api_key = req.query.key;

    res.render('index', {
        title:   'Warehouse Controller',
        api_key: api_key
    });
});

wss.on('connection', function connection(ws) {
    // Attach a unique ID
    if (!ws.id) {
        ws.id = generateNewID(16);
        console.log("New websocket ID:", ws.id);
    }

    // This is when the server receives a message from a client
    ws.on('message', function message(req) {
        try {
            var data = JSON.parse(req);
            var apiKey = data.key;
            var action = data.action;

            // Make sure the socket has authenticated with API key first
            // or if they are trying to authenticate then let them
            if (action != "authenticate" && ws.authenticated && ws.apiKey != apiKey) {
                console.log(`Websocket tried to call a function without authenticating!`);
                return;
            }

            // Parse the action the client wants to do
            switch (action) {
                case "authenticate":
                    // Client must authenticate before doing calls
                    warehouseService.Authenticate({
                        apiKey: apiKey
                    }, (error, response) => {
                        if (error) {
                            console.log(`Error authenticating API key '${apiKey}'`);
                            console.error(error);
                            return;
                        }

                        ws.authenticated = response.result;
                        
                        if (response.result) {
                            ws.apiKey = response.apiKey;
                            ws.authenticated = response.result;
                        } else {
                            ws.apiKey = "";
                            ws.authenticated = false;
                        }

                        var resp = {
                            type: "authenticate",
                            result: response.result
                        }

                        ws.send(JSON.stringify(resp));
                    });

                    break;

                case "listLocations":
                    listLocations(ws);
                    break;
                    
                case "listRobots":
                    listRobots(ws);
                    break;

                case "listItemLocations":
                    listItems(ws, data.data);
                    break;

                case "getRobotInformation":
                    // Get the details of the specified robot
                    getRobotInformation(ws, data.data);

                    break;

                case "moveRobot":
                    var serviceID = data.data.serviceID;
                    var locationID = data.data.locationNameOrID;

                    warehouseService.MoveRobot({
                        serviceID: serviceID,
                        locationNameOrID: locationID
                    }, (error, response) => {
                        if (error) {
                            console.log(`An error occurred moving a robot to ${locationNameOrID}`);
                            console.error(error);
                            return;
                        }

                        // ROBOTS
                        listRobots(ws);
                
                        // LOCATIONS
                        listLocations(ws);
                    });

                    break;

                case "loadItem":
                    var serviceID = data.data.serviceID;
                    var itemName = data.data.itemName;

                    warehouseService.LoadItem({
                        serviceID: serviceID,
                        itemName:  itemName
                    }, (error, response) => {
                        if (error) {
                            console.log(`An error occurred loading '${itemName}' onto robot ${serviceID}: `);
                            console.error(error);
                            return;
                        }
                        
                        // ROBOTS
                        listRobots(ws);
                
                        // LOCATIONS
                        listLocations(ws);
                    });

                    break;

                case "unloadItem":
                    var serviceID = data.data.serviceID;

                    warehouseService.UnloadItem({
                        serviceID: serviceID
                    }, (error, response) => {
                        if (error) {
                            console.log(`An error occurred unloading robot ${serviceID}: `);
                            console.error(error);
                            return;
                        }
                        
                        // ROBOTS
                        listRobots(ws);
                
                        // LOCATIONS
                        listLocations(ws)
                    });
                    
                    break;

                default:
                    break;
            }
        } catch (ex) {
            console.log("Error parsing incoming message:");
            console.error(ex);
        }
    });

    ws.on("close", (code, reason) => {
        // Remove this from the list of clients
        if (ws.id) {
            for (let k = webSocketClients.length-1; k >= 0; k--) {
                let v = webSocketClients[k];

                if (v.id == ws.id) {
                    webSocketClients.splice(k, 1);
                }
            }
        }
    });

    let found = false;

    // Check if this socket is already in our list
    for (let k = 0; k < webSocketClients.length; k++) {
        let v = webSocketClients[k];

        if (v.id == ws.id) {
            found = true;
            break;
        }
    }

    if (!found) {
        webSocketClients.push(ws);
    }
});

function listRobots(ws) {
    // Make a list of all server streamed robots
    // and send in one batch to the web socket client
    var resp = [];

    let listRobotsCall = warehouseService.ListRobots({});

    listRobotsCall.on("data", (response) => {
        if (!response) { return; }
        resp.push(response);
    });

    listRobotsCall.on("end", () => {
        // Once we finished streaming the data
        // lets push it to the client
        for (let k = 0; k < webSocketClients.length; k++) {
            let v = webSocketClients[k];

            if (v.readyState == ws.OPEN) {
                v.send(JSON.stringify({
                    type: "robots",
                    data: resp
                }));
            }
        }
    });

    listRobotsCall.on("error", (e) => {
        console.log("Error listing robots:");
        console.error(e);
    });
}

function listLocations(ws) {
    let listLocationsCall = warehouseService.ListLocations();

    listLocationsCall.on("data", (response) => {
        if (!response) { return; }

        for (let k = 0; k < webSocketClients.length; k++) {
            let v = webSocketClients[k];

            if (v.readyState == ws.OPEN) {
                let resp = JSON.stringify({
                    type: "locations",
                    data: response
                });

                v.send(resp);
            }
        }
    });
    
    listLocationsCall.on("end", () => {});

    listLocationsCall.on("error", (e) => {
        console.log("Error listing locations:");
        console.error(e);
    });
}

function listItems(ws, locationNameOrID) {
    var resp = [];

    let listItemsCall = warehouseService.ListLocationItems({
        locationNameOrID: locationNameOrID || "loading_bay"
    });

    listItemsCall.on("data", (response) => {
        if (!response) { return; }

        resp.push(response);
    });

    listItemsCall.on("end", () => {
        // Once we finished streaming the data
        // lets push it to the client
        for (var k = 0; k < webSocketClients.length; k++) {
            var v = webSocketClients[k];

            if (v.readyState == ws.OPEN) {
                v.send(JSON.stringify({
                    type: "items",
                    data: resp
                }));
            }
        }
    });

    listItemsCall.on("error", (e) => {
        console.log("Error listing items:");
        console.error(e);
    });
}

function getRobotInformation(ws, serviceID) {
    warehouseService.GetRobotStatus({
        serviceID: serviceID
    }, (error, response) => {
        if (error) {
            console.log(`An error occurred getting status of robot ${serviceID}: `);
            console.error(error);
            return;
        }

        var resp = JSON.stringify({
            type: "robot",
            data: response
        });
        
        ws.send(resp);
    });
}

module.exports = router;
