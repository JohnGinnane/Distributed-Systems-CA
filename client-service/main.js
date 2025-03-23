const grpc         = require("@grpc/grpc-js");
const protoLoader  = require("@grpc/proto-loader");
const path         = require("path");
const readlineSync = require("readline-sync");

let DISCOVERY_ADDRESS = "127.0.0.1:50000";
let WAREHOUSE_ADDRESS = "127.0.0.1:50001";
let ADDRESS           = "127.0.0.1";
let PORT              = "50100";
let serviceID         = "";
let server            = null;

function address() { return `${ADDRESS}:${PORT}`; }


const discoveryProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, "../protos/discovery.proto"))).discovery;
const warehouseProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, "../protos/warehouse.proto"))).warehouse;

const discoveryService = new discoveryProto.DiscoveryService(DISCOVERY_ADDRESS, grpc.credentials.createInsecure());
const warehouseService = new warehouseProto.WarehouseService(WAREHOUSE_ADDRESS, grpc.credentials.createInsecure());

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
    discoveryService.RegisterService({
        serviceName: "client",
        serviceAddress: address()
    }, (error, response) => {
        if (error) {
            console.log("An error occurred trying to register with discovery service: ");
            console.error(error);
            return;
        }
        serviceID = response.serviceID;
        console.log(`Service registered with ID ${serviceID}`);

        // Start client server so we can control the warehouse
        server = new grpc.Server();

        server.bindAsync(address(), grpc.ServerCredentials.createInsecure(), () => {

        });
        
        let userInput = "";

        while (userInput != "0") {
            console.log("\u001B[2J\u001B[0;0f");
            console.log("test hello world");
            console.log("0 to quit");
            userInput = readlineSync.questionInt("Enter option: ").toString().trim().toLowerCase();
        }
    });
});
