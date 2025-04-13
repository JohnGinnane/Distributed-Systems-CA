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

    ws.on('message', function message(data) {
        console.log('received: %s', data);
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
        
        // List robots and locations to the client
        // Every time we open the page we want to transmit 
        // this data via web sockets

        // ROBOTS
        listRobots(ws);

        // LOCATIONS
        listLocations(ws)

        // ITEMS
        listItems(ws);
    }
});

function listRobots(ws) {
        let listRobotsCall = warehouseService.ListRobots({});

        listRobotsCall.on("data", (response) => {
            if (!response) { return; }

            for (let k = 0; k < webSocketClients.length; k++) {
                let v = webSocketClients[k];

                if (v.readyState == ws.OPEN) {
                    let resp = JSON.stringify({
                        type: "robots",
                        data: response
                    });
                    
                    v.send(resp);
                }
            }
        });

        listRobotsCall.on("end", () => {});

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

function listItems(ws) {
    let listItemsCall = warehouseService.ListLocationItems({
        locationNameOrID: "loading_bay"
    });

    listItemsCall.on("data", (response) => {
        if (!response) { return; }

        for (var k = 0; k < webSocketClients.length; k++) {
            var v = webSocketClients[k];

            if (v.readyState == ws.OPEN) {
                var resp = JSON.stringify({
                    type: "items",
                    data: response
                });

                v.send(resp);
            }
        }
    });

    listItemsCall.on("end", () => {});

    listItemsCall.on("error", (e) => {
        console.log("Error listing items:");
        console.error(e);
    });
}

module.exports = router;
