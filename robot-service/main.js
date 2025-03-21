const grpc        = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path        = require("path");

// We need to load discovery proto so this robot service and register itself
const discoveryProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, "protos/discovery.proto"))).discovery;
const robotProto     = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, "protos/robot.proto"))).robot;

let DISCOVERY_ADDRESS = "127.0.0.1:50000";
let ADDRESS           = "127.0.0.1";
let PORT              = "50001";
let serviceID         = "";

const discoveryService = new discoveryProto.DiscoveryService(DISCOVERY_ADDRESS, grpc.credentials.createInsecure());

function address() { return `${ADDRESS}:${PORT}`; }

discoveryService.registerService({
    serviceName: "robot",
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
        const server = new grpc.Server();

        // server.addService(discoveryProto.DiscoveryService.service, {

        // });

        server.bindAsync(address(), grpc.ServerCredentials.createInsecure(), () => {
            console.log("Robot Service running on " + address());
            //server.start(); // No longer necessary to call this function, according to node
        })
    }
});
