import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import authRoutes from "./routes/authRoutes.js";
import friendsRoutes from "./routes/friendsRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import friendRequestRoutes from "./routes/friendRequestRoutes.js"
import registerSocketHandlers, { onlineUsers } from "./socket/signaling.js";

dotenv.config();
const app = express();
const server = http.createServer(app);

// WebSockets
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
// store online users: userId -> socketId
// let onlineUsers = {};

// io.on("connection", (socket) => {
//     console.log("Client connected:", socket.id);

//     socket.on("register", (userId) => {
//         onlineUsers[userId] = socket.id;
//         console.log("Registered user:", userId);
//     });

//     socket.on("disconnect", () => {
//         for (let userId in onlineUsers) {
//             if (onlineUsers[userId] === socket.id) {
//                 delete onlineUsers[userId];
//                 break;
//             }
//         }
//         console.log("Client disconnected:", socket.id);
//     });
// });

// make io available to routes
app.use((req, res, next) => {
    req.io = io;
    // req.onlineUsers = onlineUsers;
    next();
});

app.use(cors());
app.use(express.json());

// =========Routes=========
// authentication route
app.use("/api/auth", authRoutes);
// friends route
app.use("/api/friends", friendsRoutes);
// friend requests route - for incoming and outgoing add friend requests
app.use("/api/friend-requests", friendRequestRoutes)
// user-related operations route
app.use("/api/users", userRoutes)

// start socket listeners
registerSocketHandlers(io)

server.listen(5000, () => console.log("WebSocket and Server running on port 5000"));
