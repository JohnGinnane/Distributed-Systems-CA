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

function registerService() {

}

function unregisterService() {
    
}

server.addService(discoveryProto.DiscoveryService.service, {
    RegisterService: registerService,
    UnregisterService: unregisterService
});

server.bindAsync(addr(), grpc.ServerCredentials.createInsecure(), () => {
    console.log("Discovery Service running on " + addr());
    //server.start(); // No longer necessary to call this function, according to node
})