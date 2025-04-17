const grpc        = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path        = require("path");

// We need to load discovery proto so this robot service and register itself
const robotProto     = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, "../protos/robot.proto"))).robot;
const discoveryProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, "../protos/discovery.proto"))).discovery;
const warehouseProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, "../protos/warehouse.proto"))).warehouse;

let DISCOVERY_ADDRESS = "127.0.0.1:50000";
let ADDRESS           = "127.0.0.1";
let PORT              = "50100";
let serviceID         = "";
let server            = null;
let location          = "";
let status            = "idle";
let heldItem          = "";

function address() { return `${ADDRESS}:${PORT}`; }

const discoveryService = new discoveryProto.DiscoveryService(DISCOVERY_ADDRESS, grpc.credentials.createInsecure());
let warehouseAddress   = ""; // Filled in later with a call to discovery service
let warehouseService   = null;

// FUNCTIONS //
function log(str) {
    var today  = new Date();
    console.log("[" + today.toLocaleTimeString("en-IE") + "]", str);
}

function updateStatus() {
    try {
        warehouseService.SetRobotStatus({
            serviceID: serviceID,
            address:   address(),
            status:    status,
            location:  location,
            heldItem:  heldItem
        }, ()=>{});
    } catch (ex) {
        log("An error occurred updating robot status: ");
        console.error(ex);
    }
}

function loadItem(call, callback) {
    try {
        const itemName = call.request.itemName;
        heldItem = itemName;
        updateStatus();

        callback(null, null);
    } catch (ex) {
        log(`An error occurred trying to load '${itemName}' at ${location}`);
        console.error(ex);
    }
}

function unloadItem(call, callback) {
    try {
        const itemName = heldItem;
        heldItem = "";
        updateStatus();
        
        callback(null, {
            itemName: itemName
        });
    } catch (ex) {
        log(`An error occurred trying to unload item '${itemName}':`);
        console.error(ex);
    }
}

function goToLocation(call, callback) {
    // Goes to location
    const locationNameOrID = call.request.locationNameOrID;
    log(`Going to ${locationNameOrID}`);

    if (this.location == locationNameOrID) {
        // Immediately report back that we're at location
        callback(null, {locationNameOrID: location});
        updateStatus();
        return;
    }

    // Otherwise wait 1000ms before reporting that we're at the location
    // to simulate moving the robot
    setTimeout(() => {
        location = locationNameOrID;
        log(`Arrived at ${location}`);
        callback(null, {locationNameOrID: location});
        updateStatus();
    }, 1000);
}

// MAIN FUNCTIONALITY //

// Find first warehouse service registered with the discovery service
discoveryService.FindService({
    serviceNameOrID: "warehouse"
}, (error, response) => {
    if (error) {
        log("An error occurred trying to find the warehouse service: ");
        console.error(error);
        return;
    }

    if (!response) {
        console.error("No response from discovery service when finding warehouse!");
        return;
    }

    warehouseAddress = response.serviceAddress;
    log(`Found warehouse service @ ${warehouseAddress}`);

    // Now that we have the warehouse let's set up the rest of the robot
    warehouseService = new warehouseProto.WarehouseService(warehouseAddress, grpc.credentials.createInsecure());

    // Find a free port for this service
    discoveryService.GetFreePort({
        targetPort: PORT
    }, (error, response) => {
        if (error) {
            log("An error occurred trying to get a free port from discovery service: ");
            console.error(error);
            return;
        }
            
        PORT = response.freePort;

        // Once we have our port we should register this service
        discoveryService.registerService({
            serviceName: "robot",
            serviceAddress: address()
        }, (error, response) => {
            if (error) {
                log("An error occurred trying to register with discovery service: ");
                console.error(error);
                return;
            }
            
            serviceID = response.serviceID;
            log(`Service registered with ID ${serviceID}`);
            
            // Create service after registering with discovery service
            server = new grpc.Server();

            server.addService(robotProto.RobotService.service, {
                LoadItem:     loadItem,
                UnloadItem:   unloadItem,
                GoToLocation: goToLocation
            });
            
            server.bindAsync(address(), grpc.ServerCredentials.createInsecure(), () => {
                log(`Robot Service running on ${address()}`);
                //server.start(); // No longer necessary to call this function, according to node
                
                // Robot should tell the warehouse its online
                warehouseService.AddRobot({
                    serviceID: serviceID,
                    address:   address(),
                    status:    status,
                    location:  location
                }, ()=>{});
            });
        });
    });
});

function exitHandler() {
    // Tell the warehouse we're going offline
    try {
        if (serviceID && warehouseService) {
            warehouseService.RemoveRobot({serviceID: serviceID}, ()=>{});
        }
    } catch (ex) {
        // Don't care about exceptions at this stage
    }

    // Attempt to unregister the service
    try {
        if (serviceID && discoveryService) {
            discoveryService.UnregisterService({serviceID: serviceID}, ()=>{});
        }
    } catch (ex) { }

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