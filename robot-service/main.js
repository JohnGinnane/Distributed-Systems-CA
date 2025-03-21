const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");

const PROTO_PATH = path.join(__dirname, "protos/robot.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const robotProto = grpc.loadPackageDefinition(packageDefinition).robot;

let ADDRESS = "127.0.0.1";
let PORT    = "50000";

function addr() { return `${ADDRESS}:${PORT}`; }

const server = new grpc.Server();

// server.addService(discoveryProto.DiscoveryService.service, {

// });

server.bindAsync(addr(), grpc.ServerCredentials.createInsecure(), () => {
    console.log("Robot Service running on " + addr());
    //server.start(); // No longer necessary to call this function, according to node
})