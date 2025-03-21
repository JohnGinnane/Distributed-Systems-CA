const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");

const PROTO_PATH = path.join(__dirname, "protos/discovery.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const discoveryProto = grpc.loadPackageDefinition(packageDefinition).discovery;

const services = [];

const server = new grpc.Server();

// server.addService(discoveryProto.DiscoveryService.service, {
//     // ServiceFunction: jsFunction
// });

server.bindAsync("127.0.0.1:50000", grpc.ServerCredentials.createInsecure(), () => {
    console.log("Discovery Service running on 127.0.0.1:50000");
    server.start();
})