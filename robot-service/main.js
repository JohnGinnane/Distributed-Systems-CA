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

const robotService     = new robotProto.RobotService(address(), grpc.credentials.createInsecure());
const discoveryService = new discoveryProto.DiscoveryService(DISCOVERY_ADDRESS, grpc.credentials.createInsecure());
let warehouseAddress   = ""; // Filled in later with a call to discovery service

// FUNCTIONS //
function loadItem(call, callback) {
    // Robot must be placed at location that
    // contains the item we want to load
    const itemName = call.request.itemName;
    const location = self.location;
    
    // Trying to remove item from location
}

function unloadItem(call, callback) {
    // Will drop the held item at location
}

function goToLocation(call, callback) {
    // Goes to location
    const newLocation = call.request.itemName;

    position = newLocation;

    // Wait 1000ms before reporting that we're at the location
    setTimeout(() => {
        callback(null, {});
        this.position = "";
    }, 1000);
}

// MAIN FUNCTIONALITY //

// Find first warehouse service registered with the discovery service
discoveryService.FindService({
    serviceNameOrID: "warehouse"
}, (error, response) => {
    if (error) {
        console.log("An error occurred trying to find the warehouse service: ");
        console.error(error);
        return;
    }

    if (!response) {
        console.error("No response from discovery service when finding warehouse!");
        return;
    }
    
    warehouseAddress = response.serviceAddress;
    console.log("Found warehouse service @ ", warehouseAddress);
    
    // Now that we have the warehouse let's set up the rest of the robot
    const warehouseService = new warehouseProto.WarehouseService(warehouseAddress, grpc.credentials.createInsecure());

    // Find a free port for this service
    discoveryService.GetFreePort({
        targetPort: PORT
    }, (error, response) => {
        if (error) {
            console.log("An error occurred trying to get a free port from discovery service: ");
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
                console.log("An error occurred trying to register with discovery service: ");
                console.error(error);
                return;
            }
            
            serviceID = response.serviceID;
            console.log(`Service registered with ID ${serviceID}`);
            
            // Create service after registering with discovery service
            server = new grpc.Server();

            server.addService(discoveryProto.DiscoveryService.service, {
                LoadItem:     loadItem,
                UnloadItem:   unloadItem,
                GoToLocation: goToLocation
            });

            server.bindAsync(address(), grpc.ServerCredentials.createInsecure(), () => {
                console.log("Robot Service running on " + address());
                //server.start(); // No longer necessary to call this function, according to node
            });
        });
    });
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