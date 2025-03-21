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

    console.log(`Creating service ${serviceName} at ${serviceAddress}`);

    // Make sure service name is valid

    // Make sure service address is valid and not in use

    // Store in services array
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