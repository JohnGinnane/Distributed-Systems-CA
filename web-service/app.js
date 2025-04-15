var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');


var indexRouter = require('./routes/index');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Add jQuery to web
app.use('/jquery', express.static(__dirname + '/node_modules/jquery/dist/'));

app.use('/', indexRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;











const grpc           = require("@grpc/grpc-js");
const protoLoader    = require("@grpc/proto-loader");
const ws             = require("ws");
const fs             = require('fs');
// const wss            = require("wss");
const uuid           = require("uuid");
const https          = require("https");
const selfsigned     = require("selfsigned");


const webSocketClients = [];
let WAREHOUSE_ADDRESS = "127.0.0.1:50001";

const warehouseProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, "../protos/warehouse.proto"))).warehouse;
const warehouseService = new warehouseProto.WarehouseService(WAREHOUSE_ADDRESS, grpc.credentials.createInsecure());

// Set up web socket server to write warehouse data back to page
// const credential = {
//     key: fs.readFileSync('localhost.key'),
//     cert: fs.readFileSync('localhost.crt')
// }

const SSLCert =  selfsigned.generate(null, { days: 1 });
const credential = {
    key: SSLCert.private,
    cert: SSLCert.cert
}

console.log(credential);

const httpsServer = https.createServer(credential, (req, res) => {
    console.log("HTTPS Server");
});

httpsServer.on('error', (err) => {
    console.error(err)
});

httpsServer.listen(3001, () =>  {
    console.log('HTTPS running on port 3001')
});

const webSocket = new ws.Server({
    server: httpsServer
}, (e) => {
    //console.log(e);
    console.log("Web Socker Server")
});

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

webSocket.on('connection', function connection(ws) {
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

                        acknowledge();
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
                        
                        acknowledge();
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
                        
                        acknowledge();
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
    // make list of all locations during stream
    // then send to web socket client in one go
    var resp = [];

    let listLocationsCall = warehouseService.ListLocations();

    listLocationsCall.on("data", (response) => {
        if (!response) { return; }
        resp.push(response);
    });
    
    listLocationsCall.on("end", () => {
        // After stream is ended send to
        // web socket client        
        for (let k = 0; k < webSocketClients.length; k++) {
            let v = webSocketClients[k];

            if (v.readyState == ws.OPEN) {
                v.send(JSON.stringify({
                    type: "locations",
                    data: resp
                }));
            }
        }
    });

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

// Function to acknowledge when a command was ran on the warehouse
function acknowledge() {    
    for (var k = 0; k < webSocketClients.length; k++) {
        var v = webSocketClients[k];

        if (v.readyState == ws.OPEN) {
            v.send(JSON.stringify({
                type: "acknowledge"
            }));
        }
    }
}
