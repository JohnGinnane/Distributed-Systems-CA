const grpc         = require("@grpc/grpc-js");
const protoLoader  = require("@grpc/proto-loader");
const path         = require("path");
const uuid = require("uuid");

const discoveryProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, "../protos/discovery.proto"))).discovery;
const warehouseProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, "../protos/warehouse.proto"))).warehouse;

let DISCOVERY_ADDRESS = "127.0.0.1:50000";
let ADDRESS           = "127.0.0.1";
let PORT              = "50001";
let serviceID         = "";
let server            = null;
let locations         = [];
const MAX_SHELF_SIZE  = 20;

function generateNewID() {
    let newID = "";

    while (newID == "" || locations.find(x => x.ID == newID)) {
        newID = uuid.v4().substring(1, 5);
    }

    return newID;
}

function getLocationByNameOrID(nameOrID) {
    return locations.find(x => x.Name == nameOrID || x.ID == nameOrID);
}

// Private functions to add and remove to/from storage
function add(locationNameOrID, itemName) {
    if (!itemName) { return; }
    let loc = getLocationByNameOrID(locationNameOrID);

    // Couldn't find location
    // maybe throw error?
    if (!loc) { return; }

    if (loc.Items.length >= loc.MaxSize) {
        throw new Error(`Location ${loc.ID} is at capacity!`);
    }
    
    loc.Items.push(itemName);
}

function remove(locationNameOrID, itemName) {
    if (!itemName) { return; }
    let loc = getLocationByNameOrID(locationNameOrID);

    // Couldn't find location
    if (!loc) { return; }

    let itemIndex = loc.Items.findIndex(x => x == itemName);

    // If that item was found in that location
    if (itemIndex > -1) {
        loc.Items.split(itemIndex, 1);
    }
}

// Set up loading bay location
locations.push({
    ID: generateNewID(),
    Name: "loading_bay",
    MaxSize: MAX_SHELF_SIZE,
    Items: []
});

// Set up first shelf
locations.push({
    ID: generateNewID(),
    Name: "shelf:1",
    MaxSize: MAX_SHELF_SIZE,
    Items: []
});

// Sample data
add("loading_bay", "iPod");
add("loading_bay", "Calculator");
add("loading_bay", "Mobile Phone");
add("loading_bay", "Multimeter");
add("loading_bay", "Saxophone");
add("loading_bay", "Speaker");
add("loading_bay", "Bowl");
add("loading_bay", "Map");
add("loading_bay", "Lamp");

const discoveryService = new discoveryProto.DiscoveryService(DISCOVERY_ADDRESS, grpc.credentials.createInsecure());

function address() { return `${ADDRESS}:${PORT}`; }

function listLocationItems(call, callback) {
    const locationNameOrID = call.request.locationNameOrID;
    let loc = getLocationByNameOrID(locationNameOrID);

    // Make sure we found a location
    if (!loc) {
        callback({
            status: grpc.status.NOT_FOUND,
            details: `No location found for '${locationNameOrID}'`
        })

        return;
    }

    try {
        // Stream the location's items
        for (var i = 0; i < loc.Items.length; i++) {
            call.write({ itemName: loc.Items[i] });
        }

        call.end();
    } catch (ex) {
        // Catch exception and handle
        callback({
            status: grpc.status.INTERNAL,
            details: ex
        });
    }
}

function addToLocation(call, callback) {
    // Client side streaming
    try {
        call.on("data", (AddToLocationRequest) => {
            console.log("Incoming item:");
            console.log(AddToLocationRequest);

            const locationNameOrID = AddToLocationRequest.locationNameOrID;
            const itemName = AddToLocationRequest.itemName;

            let loc = getLocationByNameOrID(locationNameOrID);
        
            // Make sure we found a location
            if (!loc) {
                callback({
                    status: grpc.status.NOT_FOUND,
                    details: `No location found for '${locationNameOrID}'`
                })
        
                return;
            }

            add(loc.ID, itemName);
        })
    } catch (ex) {
        // Catch exception and handle
        callback({
            status: grpc.status.INTERNAL,
            details: ex
        });
    }

    call.on("end", () => {
        callback(null, {});
        // Code for when the client has finished streaming in items
    });
}

function removeFromLocation(call, callback) {
    // Client side streaming
    try {
        call.on("data", (RemoveFromLocationRequest) => {
            console.log("Incoming item:");
            console.log(RemoveFromLocationRequest);

            const locationNameOrID = RemoveFromLocationRequest.locationNameOrID;
            const itemName = RemoveFromLocationRequest.itemName;

            let loc = getLocationByNameOrID(locationNameOrID);
        
            // Make sure we found a location
            if (!loc) {
                callback({
                    status: grpc.status.NOT_FOUND,
                    details: `No location found for '${locationNameOrID}'`
                })
        
                return;
            }

            remove(loc.ID, itemName);
        })
    } catch (ex) {
        // Catch exception and handle
        callback({
            status: grpc.status.INTERNAL,
            details: ex
        });
    }

    call.on("end", () => {
        callback(null, {});
        // Code for when the client has finished streaming in items
    });
}

function listRobots(call, callback) {
    // Call the discovery service's function
    // and stream on the robot services
    var listServicesCall = discoveryService.listServices({});

    listServicesCall.on("data", function (response) {
        if (!response) { return; }

        if (response.serviceName.trim().toLowerCase() == "robot") {
            call.write({
                serviceID:      response.serviceID,
                serviceName:    response.serviceName,
                serviceAddress: response.serviceAddress
            });
        }
    });

    listServicesCall.on("end", () => {
        // When listing services function has finished streaming
        // then end this function's stream
        call.end();
    });

    listServicesCall.on("error", function (e) {
        console.log("Error listing robots:");
        console.error(e);

        callback({
            code: grpc.status.INTERNAL,
            details: e
        });
    });
}

function listLocations(call, callback) {
    for (let i = 0; i < locations.length; i++) {
        call.write({
            locationID:        locations[i].ID,
            locationName:      locations[i].Name,
            locationItemCount: locations[i].Items.length,
            locationMaxSize:   locations[i].MaxSize
        });
    }

    call.end();
}

discoveryService.registerService({
    serviceName: "warehouse",
    serviceAddress: address()
}, (error, response) => {
    if (error) {
        console.log("An error occurred trying to register with discovery service: ");
        console.error(error);
        return;
    } else {
        serviceID = response.serviceID;
        console.log(`Service registered with ID ${serviceID}`);

        // Create service after registering with discovery service
        server = new grpc.Server();

        server.addService(warehouseProto.WarehouseService.service, {
            AddToLocation:       addToLocation,
            RemoveFromLocation:  removeFromLocation,

            ListRobots:          listRobots,
            ListLocations:       listLocations,
            ListLocationItems:   listLocationItems
        });

        server.bindAsync(address(), grpc.ServerCredentials.createInsecure(), () => {
            console.log("Warehouse Service running on " + address());
            //server.start(); // No longer necessary to call this function, according to node
        })
        
    }
});

function exitHandler() {
    // Attempt to unregister the service
    if (serviceID && discoveryService) {
        discoveryService.unregisterService({serviceID: serviceID}, (error, response) => {
            if (error) {
                // Not sure we're worried about errors unregistering at this stage
            } else {
                // Neither are we interested in the response to unregistering as we exit
            }
        });
    }

    // Stop the server, to free up the port
    if (server) {
        server.forceShutdown();
    }
}

// Handle the node.js program stopping
// Make sure to unregister the service if possible
// Inspired by https://stackoverflow.com/a/14032965
process.on("exit",              exitHandler.bind());
process.on("SIGINT",            exitHandler.bind());
process.on("SIGUSR1",           exitHandler.bind());
process.on("SIGUSR2",           exitHandler.bind());
process.on("uncaughtException", exitHandler.bind());