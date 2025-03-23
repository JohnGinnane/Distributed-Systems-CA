const grpc         = require("@grpc/grpc-js");
const protoLoader  = require("@grpc/proto-loader");
const path         = require("path");
const readlineSync = require("readline-sync");

let DISCOVERY_ADDRESS = "127.0.0.1:50000";
let ADDRESS           = "127.0.0.1";
let PORT              = "50100";
let serviceID         = "";
let server            = null;

function address() { return `${ADDRESS}:${PORT}`; }

const discoveryProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, "protos/discovery.proto"))).discovery;
const discoveryService = new discoveryProto.DiscoveryService(DISCOVERY_ADDRESS, grpc.credentials.createInsecure());

// Find a free port for this service
discoveryService.GetFreePort({
    targetPort: PORT
}, (error, response) => {
    if (error) {
        console.log("An error occurred trying to get a free port from discovery service: ");
        console.error(error);
        return;
    } else {
        PORT = response.freePort;

        // Once we have our port we should register this server
        discoveryService.RegisterService({
            serviceName: "client",
            serviceAddress: address()
        }, (error, response) => {
            if (error) {
                console.log("An error occurred trying to register with discovery service: ");
                console.error(error);
            } else {
                serviceID = response.serviceID;
                console.log(`Service registered with ID ${serviceID}`);
            }
        })
    }
});