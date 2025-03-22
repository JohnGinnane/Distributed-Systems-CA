const grpc        = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path        = require("path");

const discoveryProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, "protos/discovery.proto"))).discovery;

let DISCOVERY_ADDRESS = "127.0.0.1:50000";
let ADDRESS           = "127.0.0.1";
let PORT              = "50001";
let serviceID         = "";

const discoveryService = new discoveryProto.DiscoveryService(DISCOVERY_ADDRESS, grpc.credentials.createInsecure());

function address() { return `${ADDRESS}:${PORT}`; }

function listServices() {
    var listServicesCall = discoveryService.listServices({});

    console.log("Listing robots:");

    listServicesCall.on("data", function (response) {
        if (response.serviceName.trim().toLowerCase() == "robot") {
            console.log(`${response.serviceID} @ ${response.serviceAddress}`);
        }
    });

    listServicesCall.on("end", function () {});

    listServicesCall.on("error", function (e) {
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
        const server = new grpc.Server();

        listServices();

        // server.addService(discoveryProto.DiscoveryService.service, {

        // });

        server.bindAsync(address(), grpc.ServerCredentials.createInsecure(), () => {
            console.log("Warehouse Service running on " + address());
            //server.start(); // No longer necessary to call this function, according to node
        })
    }
});
