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
            code:    grpc.status.ALREADY_EXISTS,
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
            code:    grpc.status.INTERNAL,
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
            code:    grpc.status.NOT_FOUND,
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
            code:    grpc.status.NOT_FOUND,
            details: `Couldn't find robot ${reportStatusRequest.serviceID}!`
        });

        return;
    }

    // Report any changes to location
    if (robots[robotIndex].location != reportStatusRequest.location) {
        console.log(`Robot ${robots[robotIndex].serviceID} is now at ${reportStatusRequest.location}`);
    }

    robots[robotIndex].status   = reportStatusRequest.status;
    robots[robotIndex].location = reportStatusRequest.location;
    robots[robotIndex].heldItem = reportStatusRequest.heldItem;
}

function getRobotStatus(call, callback) {
    const serviceID = call.request.serviceID;
    const robot = robots.find((x) => x.serviceID == serviceID);

    if (!robot) {
        callback({
            code: grpc.status.NOT_FOUND,
            details: `Couldn't find robot ${serviceID}!`
        });

        return;
    }

    callback(null, {
        serviceID: robot.serviceID,
        address:   robot.address,
        status:    robot.status,
        location:  robot.location,
        heldItem:  robot.heldItem
    });
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
                    code:    grpc.status.NOT_FOUND,
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
                code:    grpc.status.INTERNAL,
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
                location:  robot.location,
                heldItem:  robot.heldItem
            });
        }

        call.end();
    } catch (ex) {
        console.print("An error occurred listing robots: ");
        console.error(ex);
        callback({
            code:    grpc.status.INTERNAL,
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

function loadItem(call, callback) {
    const serviceID = call.request.serviceID;
    const itemName  = call.request.itemName;

    const robot = robots.find((x) => x.serviceID == serviceID);

    if (!robot) {
        callback({
            code: grpc.status.NOT_FOUND,
            details: `Robot ${serviceID} not found`
        }, null);
        
        return;
    }
    
    const location = getLocationByNameOrID(robot.location);
    if (!location) {
        callback({
            code: grpc.status.NOT_FOUND,
            details: `Location '${robot.location}' not found`
        }, null);

        return;
    }

    // Make sure the item is present in the location
    if (!location.Items.find((x) => x == itemName)) {
        callback({
            code:    grpc.status.NOT_FOUND,
            details: `Item '${itemName}' not found at '${location.Name}'`
        }, null);

        return;
    }

    robot.Service.LoadItem({
        itemName: itemName
    }, (error, response) => {
        if (error) {
            console.log(`Error loading item onto ${robot.serviceID}`);
            console.error(error);
            return;
        }
        
        // Remove item from the location
        const itemIndex = location.Items.findIndex((x) => x == itemName);

        // Somehow missing? Perhaps someone took it before us!
        if (itemIndex < -1) {
            callback({
                code:    grpc.status.NOT_FOUND,
                details: `Item '${itemName}' not found at '${location.Name}'`
            }, null);

            return;
        }
        
        location.Items.splice(itemIndex, 1);

        callback(null, null);
    });
}

function unloadItem(call, callback) {
    const serviceID = call.request.serviceID;
    
    const robot = robots.find((x) => x.serviceID == serviceID);

    // Make sure robot exists
    if (!robot) {
        callback({
            code: grpc.status.NOT_FOUND,
            details: `Robot ${serviceID} not found`
        }, null);
        
        return;
    }

    // Make sure robot was holding an item
    if (!robot.heldItem) {
        callback({
            code: grpc.status.NOT_FOUND,
            details: `Robot ${serviceID} is not holding an item`
        }, null);

        return;
    }

    // Make sure robot is at valid location
    const location = getLocationByNameOrID(robot.location);
    if (!location) {
        callback({
            code: grpc.status.NOT_FOUND,
            details: `Location '${robot.location}' not found`
        }, null);

        return;
    }
    
    // Make sure location has enough space
    if (location.Items.length >= location.MaxSize) {
        callback({
            code: grpc.status.RESOURCE_EXHAUSTED,
            details: `Location '${location.Name}' is at capacity`
        });

        return;
    }

    robot.Service.UnloadItem({ }, (error, response) => {
        if (error) {
            console.log(`Error unloading item from ${robot.serviceID}`);
            console.error(error);
            callback({
                code: grpc.status.INTERNAL,
                details: "An error occurred unloading item"
            });
            return;
        }

        // Unloading an item returns the item in question
        // in the response
        location.Items.push(response.itemName);
        callback(null, null);
    });
}

// Bi-Directional function to control a robot
// Takes requests to move, load, or unload
// Reponds with results of action
function controlRobot(call) {
    call.on("data", function(controlRobotRequest) {
        try {
            const serviceID = controlRobotRequest.serviceID;
            const action    = controlRobotRequest.action.trim().toLowerCase();
            const value     = controlRobotRequest.value.trim();

            const robot = robots.find((x) => x.serviceID == serviceID);

            var controlRobotResponse = {
                serviceID: robot.serviceID,
                location:  robot.location,
                heldItem:  robot.heldItem,
                message:   ""
            };

            // Unable to find robot
            if (!robot) {
                controlRobotResponse.message = `Couldn't find robot ${robot.serviceID}!`;
                call.write(controlRobotResponse);
                call.end();
                return;
            }

            switch (action) {
                case "move":
                    controlRobotResponse.message = `${serviceID} moving to ${value}`;
                    call.write(controlRobotResponse);

                    robot.Service.GoToLocation({
                        locationNameOrID: value
                    }, (error, response) => {
                        try {
                            if (error) {
                                // Serverside error logging
                                console.log(`Error moving robot to ${value}`);
                                console.error(error);

                                // Clientside error logging
                                controlRobotResponse.message = `Error moving robot to ${value}`;
                                call.write(controlRobotResponse);
                                call.end();
                                return;
                            }

                            controlRobotResponse.location = response.locationNameOrID;
                            controlRobotResponse.message = `${serviceID} moved to ${response.locationNameOrID}`;
                            call.write(controlRobotResponse);
                        } catch (ex) {                            
                            console.log("An error occurred while controlling a robot: ");
                            console.error(ex);
                        }
                    });

                    break;
                case "load":
                    robot.Service.LoadItem({
                        itemName: value
                    }, (error, response) => {
                        try {
                            if (error) {
                                // Serverside error logging
                                console.log(`Error loading item onto ${robot.serviceID}`);
                                console.error(error);

                                // Clientside error logging
                                controlRobotResponse.message = `Error loading item onto ${robot.serviceID}`;
                                call.write(controlRobotResponse);
                                call.end();
                                return;
                            }
                            
                            var location = getLocationByNameOrID(robot.location);

                            // make sure location exists
                            if (!location) {
                                console.log(`Location '${robot.location}' could not be found!`);

                                controlRobotResponse.message = `Error loading item onto ${robot.serviceID}`;
                                call.write(controlRobotResponse);
                                call.end();
                                return;
                            }

                            const itemIndex = location.Items.findIndex((x) => x == value);

                            // Make sure item exists
                            if (itemIndex < 0) {
                                console.log(`Item '${value}' could not be found at '${robot.location}'`);

                                controlRobotResponse.message = `Error loading item onto ${robot.serviceID}`;
                                call.write(controlRobotResponse);
                                return;
                            }

                            location.Items.splice(itemIndex, 1);
                    
                            controlRobotResponse.heldItem = value;
                            controlRobotResponse.message = `${serviceID} loaded ${value}`;
                            call.write(controlRobotResponse);
                        } catch (ex) {
                            console.log("An error occurred while controlling a robot: ");
                            console.error(ex);
                        }
                    });

                    break;
                case "unload":
                    robot.Service.UnloadItem({ }, (error, response) => {
                        try {
                            if (error) {
                                // Serverside error logging
                                console.log(`Error unloading item from ${robot.serviceID}`);
                                console.error(error);

                                // Clientside error logging
                                controlRobotResponse.message = `Error unloading item from ${robot.serviceID}`;
                                call.write(controlRobotResponse);
                                call.end();
                                return;
                            }
                    
                            // Unloading an item returns the item in question
                            // in the response
                            var location = getLocationByNameOrID(robot.location);
                            location.Items.push(response.itemName);
                            
                            controlRobotResponse.message = `${serviceID} unloaded ${controlRobotResponse.heldItem}`;
                            controlRobotResponse.heldItem = "";
                            call.write(controlRobotResponse);
                        } catch (ex) {
                            console.log("An error occurred while controlling a robot: ");
                            console.error(ex);
                        }
                    });
                    
                    break;
                case "quit":
                    call.end();
                    
                    break;                    
                default:
                    // do nothing if invalid command was sent
            }
        } catch (ex) {
            console.log("An error occurred while controlling a robot: ");
            console.error(ex);
        }
    });

    call.on("end", function() {
        call.end();
    });

    call.on("error", function(e) {
        console.log("An error occurred: ");
        console.error(e);
    })
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
            GetRobotStatus:      getRobotStatus,
            SetRobotStatus:      setRobotStatus,
            RemoveRobot:         removeRobot,
            MoveRobot:           moveRobot,
            LoadItem:            loadItem,
            UnloadItem:          unloadItem,

            AddToLocation:       addToLocation,
            RemoveFromLocation:  removeFromLocation,
            
            ListRobots:          listRobots,
            ListLocations:       listLocations,
            ListLocationItems:   listLocationItems,

            ControlRobot:        controlRobot
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