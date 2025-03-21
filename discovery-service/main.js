const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");

const PROTO_PATH = path.join(__dirname, "protos/discovery.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const discoveryProto = grpc.loadPackageDefinition(packageDefinition).discovery;

let ADDRESS = "127.0.0.1";
let PORT    = "50000";

function addr() { return `${ADDRESS}:${PORT}`; }

const services = [];

const server = new grpc.Server();

const registerService = (call, callback) => {
    const serviceName = call.request.serviceName;
    const serviceAddress = call.request.serviceAddress;

    console.log(`Creating service '${serviceName}' at ${serviceAddress}`);

    // Make sure service name is valid
    if (!serviceName) {
        var errMsg = `Service name '${serviceName}' is not valid!`;
        console.error(errMsg);
        callback({
            code: grpc.status.INVALID_ARGUMENT,
            details: errMsg
        });

        return;
    }

    // Make sure service address is valid and not in use
    if (!serviceAddress) {
        var errMsg = `Service address '${serviceName}' is not valid!`;
        console.error(errMsg);
        callback({
            code: grpc.status.INVALID_ARGUMENT,
            details: errMsg
        });

        return;
    }

    if (services.find((x) => x.serviceAddress == serviceAddress)) {
        var errMsg = `Service address ${serviceAddress} is already registered!`;
        console.error(errMsg);
        callback({
            code: grpc.status.ALREADY_EXISTS,
            details: errMsg
        });

        return;
    }

    // Store in services array
    services.push({
        serviceName: serviceName,
        serviceAddress: serviceAddress
    });
    
    // All good on discovery, respond to service
    callback(null, {status: 1});
}

const unregisterService = (call, callback) => {
    const serviceName = call.request.serviceName;

    // Make sure service exists

    // Remove from services array
}

server.addService(discoveryProto.DiscoveryService.service, {
    RegisterService: registerService,
    UnregisterService: unregisterService
});

server.bindAsync(addr(), grpc.ServerCredentials.createInsecure(), () => {
    console.log("Discovery Service running on " + addr());
    //server.start(); // No longer necessary to call this function, according to node
})