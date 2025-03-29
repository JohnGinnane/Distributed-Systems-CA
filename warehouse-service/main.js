const grpc         = require("@grpc/grpc-js");
const protoLoader  = require("@grpc/proto-loader");
const path         = require("path");
const uuid = require("uuid");

const discoveryProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, "../protos/discovery.proto"))).discovery;
const warehouseProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, "../protos/warehouse.proto"))).warehouse;
const robotProto     = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, "../protos/robot.proto"))).robot;

let DISCOVERY_ADDRESS = "127.0.0.1:50000";
let ADDRESS           = "127.0.0.1";
let PORT              = "50001";
let serviceID         = "";
let server            = null;
let locations         = [];
const MAX_SHELF_SIZE  = 20;
let robots            = [];

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
        loc.Items.splice(itemIndex, 1);
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
            code:    grpc.status.NOT_FOUND,
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
            code:    grpc.status.INTERNAL,
            details: "Exception occurred trying to list location items"
        });
    }
}

function addToLocation(call, callback) {
    // Client side streaming
    call.on("data", (AddToLocationRequest) => {
        try {
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
        } catch (ex) {
            console.log("A non-fatal error occurred trying to add an item: ");
            console.error(ex);
    
            // Catch exception and handle
            callback({
                status: grpc.status.INTERNAL,
                details: ex
            });
        }
    });

    call.on("end", () => {
        callback(null, {});
        // Code for when the client has finished streaming in items
    });
}

function moveRobot(call, callback) {
    const moveRobotRequest = call.request;
    const robot = robots.find((x) => x.serviceID == moveRobotRequest.serviceID);

    // Unable to find robot
    if (!robot) {
        callback({
            code:    grpc.status.NOT_FOUND,
            details: `Couldn't find robot ${moveRobotRequest.serviceID}!`
        });
        
        return;
    }

    robot.Service.GoToLocation({
        locationNameOrID: moveRobotRequest.locationNameOrID
    }, (error, response) => {
        if (error) {
            console.log(`Error moving robot to ${moveRobotRequest.locationNameOrID}`);
            console.error(error);

            callback({
                code:    grpc.status.INTERNAL,
                details: "Error moving robot"
            });

            return;
        }

        callback(null, null);
    });
}

function addRobot(call, callback) {
    const robot = call.request;

    // Robot already logged in
    if (robots.find((x) => x.serviceID == robot.serviceID)) {
        callback({
            status: grpc.status.ALREADY_EXISTS,
            details: `Couldn't find robot ${reportStatusRequest.serviceID}!`
        });
        
        return;
    }

    try {
        robot.Service = new robotProto.RobotService(robot.address, grpc.credentials.createInsecure());
        console.log(`Robot ${robot.serviceID} has just come online`);
        robots.push(robot);

        // Move the robot to loading bay
        robot.Service.GoToLocation({
            locationNameOrID: "loading_bay"
        }, (error, response) => {
            if (error) {
                console.log("Error moving robot to loading_bay");
                console.error(error);
            }
        });
    } catch (ex) {
        console.log("Error trying to add robot:");
        console.error(ex);
        callback({
            status: grpc.status.INTERNAL,
            details: "Exception thrown when adding robot"
        });
    }
}

function removeRobot(call, callback) {
    const reportStatusRequest = call.request;
    const robotIndex = robots.findIndex((x) => x.serviceID == reportStatusRequest.serviceID);

    // Unable to find robot
    if (robotIndex < 0) {
        callback({
            status: grpc.status.NOT_FOUND,
            details: `Couldn't find robot ${reportStatusRequest.serviceID}!`
        });
        
        return;
    }

    const robot = robots[robotIndex];
    console.log(`Robot ${robot.serviceID} went offline. It was last seen at ${robot.location}`);
    robots.splice(robotIndex, 1);
}

function setRobotStatus(call, callback) {
    const reportStatusRequest = call.request;
    const robotIndex = robots.findIndex((x) => x.serviceID == reportStatusRequest.serviceID)

    // Unable to find robot
    if (robotIndex < 0) {
        callback({
            status: grpc.status.NOT_FOUND,
            details: `Couldn't find robot ${reportStatusRequest.serviceID}!`
        });

        return;
    }

    // Report any changes to location
    if (robots[robotIndex].location != reportStatusRequest.location) {
        console.log(`Robot ${robots[robotIndex].serviceID} is now at ${reportStatusRequest.location}`);
    }

    robots[robotIndex].status = reportStatusRequest.status;
    robots[robotIndex].location = reportStatusRequest.location;
}

function removeFromLocation(call, callback) {
    // Client side streaming
    call.on("data", (RemoveFromLocationRequest) => {
        try {
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
        } catch (ex) {
            console.log("A non-fatal error occurred trying to remove an item: ");
            console.error(ex);
    
            // Catch exception and handle
            callback({
                status: grpc.status.INTERNAL,
                details: ex
            });
        }
    })

    call.on("end", () => {
        callback(null, {});
        // Code for when the client has finished streaming in items
    });
}

function listRobots(call, callback) {
    try {
        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];

            if (!robot) { continue; }

            call.write({
                serviceID: robot.serviceID,
                address:   robot.address,
                status:    robot.status,
                location:  robot.location
            });
        }

        call.end();
    } catch (ex) {
        console.print("An error occurred listing robots: ");
        console.error(ex);
        callback({
            code: grpc.status.INTERNAL,
            details: "An error occurred listing robots"
        });
    }
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
            AddRobot:            addRobot,
            SetRobotStatus:      setRobotStatus,
            RemoveRobot:         removeRobot,
            MoveRobot:           moveRobot,

            AddToLocation:       addToLocation,
            RemoveFromLocation:  removeFromLocation,
            
            ListRobots:          listRobots,
            ListLocations:       listLocations,
            ListLocationItems:   listLocationItems
        });

        server.bindAsync(address(), grpc.ServerCredentials.createInsecure(), () => {
            console.log("Warehouse Service running on " + address());
            //server.start(); // No longer necessary to call this function, according to node

            // At this stage we should go over all robots and add them to the list
            // Call the discovery service's function
            var listServicesCall = discoveryService.listServices({});

            listServicesCall.on("data", function (response) {
                if (!response) { return; }

                if (response.serviceName.trim().toLowerCase() == "robot") {
                    addRobot({
                        request: {
                            serviceID: response.serviceID,
                            address:   response.serviceAddress
                        }
                    }, null);
                }
            });

            listServicesCall.on("end", () => { });

            listServicesCall.on("error", function (e) {
                console.log("Error identifying robot services:");
                console.error(e);
            });
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