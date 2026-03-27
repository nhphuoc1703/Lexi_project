// store online users: userId -> socketId
let onlineUsers = {};

export default function registerSocketHandlers(io) {
    io.on("connection", (socket) => {
        // when log in
        console.log("Client connected:", socket.id);
        // when registering a new user
        socket.on("register", (userId) => {
            const stringId = String(userId)
            // ensure only one active socket per user
            for (let id in onlineUsers) {
                if (id === stringId) delete onlineUsers[id];
            }
            onlineUsers[stringId] = socket.id;
            console.log(`User ${stringId} registered as socket ${socket.id}`);
        });
        // Caller sends an offer to a callee (for when intitiating calls in main.js)
        // payload: { to: calleeId, offer, from: callerId, username }
        socket.on("ring_user", ({ from, to, username }) => {
            const calleeSocketId = onlineUsers[String(to)];
            if (calleeSocketId) {
                io.to(calleeSocketId).emit("incoming_call", {
                    from,
                    to,
                    username,
                    type: "ring"
                });
            }
        });
        socket.on("call_user", ({ from, to, offer, username }) => {
            // const { to } = payload;
            const calleeSocketId = onlineUsers[String(to)];
            if (calleeSocketId) {
                // io.to(calleeSocketId).emit("incoming_call", payload);
                // io.to(calleeSocketId).emit("incoming_call", {
                io.to(calleeSocketId).emit("webrtc_offer", {
                    type: "offer",
                    from,
                    to,
                    offer,
                    username
                });
            } else {
                // optional: notify caller callee offline
                socket.emit("user_offline", { to });
            }
        });
        // Callee sends answer back to caller (for video_call.js)
        // payload: { to: callerId, answer, from: calleeId }
        socket.on("answer_call", ({ from, to, answer }) => {
            // const { to } = payload;
            const callerSocketId = onlineUsers[String(to)];
            if (callerSocketId) {
                io.to(callerSocketId).emit("answer_call", {from, answer});
            }
        });
        // relay when callee accept call
        socket.on("accept_call", ({ from, to }) => {
            const callerSocketId = onlineUsers[String(to)];
            if (callerSocketId) {
                io.to(callerSocketId).emit("call_accepted", {from});
            }
        })
        // ICE candidate relay: { to: targetId, candidate, from: myId } (for video_call.js)
        socket.on("ice_candidate", ({ to, from, candidate }) => {
            // const { to } = payload;
            const targetSocketId = onlineUsers[String(to)];
            if (targetSocketId) {
                io.to(targetSocketId).emit("ice_candidate", { from, to, candidate });
            }
        });
        // Hangup / end call relay (for video_call.js)
        // { to: otherUserId, from: myId }
        socket.on("end_call", ({ to, from }) => {
            // const { to } = payload;
            const targetSocketId = onlineUsers[String(to)];
            if (targetSocketId) {
                io.to(targetSocketId).emit("call_ended", { from, to });
            }
        });
        // when log out
        socket.on("disconnect", () => {
            for (let userId in onlineUsers) {
                if (onlineUsers[userId] === socket.id) {
                    delete onlineUsers[userId];
                    break;
                }
            }
            console.log("Client disconnected:", socket.id);
        });

    });
}

export { onlineUsers };