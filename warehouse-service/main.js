const grpc         = require("@grpc/grpc-js");
const protoLoader  = require("@grpc/proto-loader");
const path         = require("path");

const discoveryProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, "../protos/discovery.proto"))).discovery;
const warehouseProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, "../protos/warehouse.proto"))).warehouse;

let DISCOVERY_ADDRESS = "127.0.0.1:50000";
let ADDRESS           = "127.0.0.1";
let PORT              = "50001";
let serviceID         = "";
let server            = null;
const MAX_SHELF_SIZE  = 20;
let Shelves           = [];
let LoadingBay        = [];

// Sample data
LoadingBay.push("iPod");
LoadingBay.push("Calculator");
LoadingBay.push("Mobile Phone");
LoadingBay.push("Multimeter");
LoadingBay.push("Saxophone");
LoadingBay.push("Speaker");
LoadingBay.push("Bowl");
LoadingBay.push("Map");
LoadingBay.push("Lamp");

const discoveryService = new discoveryProto.DiscoveryService(DISCOVERY_ADDRESS, grpc.credentials.createInsecure());

function address() { return `${ADDRESS}:${PORT}`; }

function insertLoadingBay(call, callback) {
    try {
        call.on("data", (LoadingBayRequest) => {
            const itemName = LoadingBayRequest.itemName.trim();
    
            if (itemName) {
                LoadingBay.push(itemName);
                console.log(`Item '${LoadingBayRequest.itemName}' added to loading bay`);
            } else {
                // throw error if invalid name?
            }
        });
    
        call.on("end", () => {
            callback(null, { });
        })
    } catch (ex) {
        // Catch exception and handle
        callback({
            status: grpc.status.INTERNAL,
            details: ex
        });
    }
}

function listLoadingBayItems(call, callback) {
    try {
        for (var i = 0; i < LoadingBay.length; i++) {
            call.write({ itemName: LoadingBay[i] });
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

function removeLoadingBay(call, callback) {
    try {
        const itemName = call.request.itemName.trim();
        console.log(`Removing '${itemName}' from the loading bay`);

        console.log(LoadingBay);
        let itemIndex = LoadingBay.findIndex((x) => x == itemName);
        console.log(`Found index ${itemIndex}`);

        if (itemIndex > -1) {
            LoadingBay.splice(itemIndex, 1);
            console.log(`Removed one of '${itemName}' from the loading bay`);

            callback(null, { });
        } else {
            callback({
                status: grpc.status.NOT_FOUND,
                details: `Item '${itemName}' not found in loading bay`
            });
        }
    } catch (ex) {
        // Catch exception and handle
        callback({
            status: grpc.status.INTERNAL,
            details: ex
        });
    }
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
            InsertLoadingBay:    insertLoadingBay,
            RemoveLoadingBay:    removeLoadingBay,

            ListRobots:          listRobots,
            ListLoadingBayItems: listLoadingBayItems
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