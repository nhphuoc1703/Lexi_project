import express from "express"
import pool from "../config/db.js"
import { verifyToken } from '../middleware/authMiddleware.js';
import { onlineUsers } from "../socket/signaling.js";

const router = express.Router();
// SEND friend request
router.post("/send", verifyToken, async (req, res) => {
    const { senderId, receiverQuery } = req.body;  
    // receiverQuery is @username or email

    try {
        // check if the user input starts with @ or not, and removes @ if input does start with it
        const lookupValue = receiverQuery.startsWith("@") ? receiverQuery.slice(1) : receiverQuery;

        const receiverRes = await pool.query(
            `SELECT id FROM users WHERE username = $1 OR email = $1`,
            [lookupValue]
        );

        if (receiverRes.rows.length === 0)
            return res.status(404).json({ error: "User not found" });

        const receiverId = receiverRes.rows[0].id;

        if (receiverId === senderId)
            return res.status(400).json({ error: "You cannot add yourself" });

        // Check if already exists
        const check = await pool.query(
            `SELECT * FROM friend_requests 
             WHERE sender_id=$1 AND receiver_id=$2 AND status='pending'`,
            [senderId, receiverId]
        );

        if (check.rows.length > 0)
            return res.status(400).json({ error: "Request already sent" });

        const insertResult = await pool.query(
            `INSERT INTO friend_requests (sender_id, receiver_id)
             VALUES ($1, $2) RETURNING id`,
            [senderId, receiverId]
        );
        // Fetch sender username
        const senderResult = await pool.query(
            "SELECT username FROM users WHERE id = $1",
            [senderId]
        );
        const senderUsername = senderResult.rows[0]?.username || "Unknown User";
        // =============notify receiver in real-time================
        // get socket.io instance (defined in server.js)
        const io = req.io;
        const requestId = insertResult.rows[0].id;
        const receiverSocket = onlineUsers[receiverId];
        if (receiverSocket) {
            io.to(receiverSocket).emit("new_friend_request", {
                requestId,
                senderId,
                username: senderUsername
            });
        }

        res.json({ success: true, message: "Friend request sent!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error sending request" });
    }
});

// GET incoming requests
router.get("/incoming/:userId", verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT fr.id, u.username, u.display_name, u.profile_picture 
             FROM friend_requests fr
             JOIN users u ON fr.sender_id = u.id
             WHERE fr.receiver_id=$1 AND fr.status='pending'`,
            [req.params.userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error fetching incoming requests" });
    }
});

// ACCEPT request
router.post("/accept", verifyToken, async (req, res) => {
    const { requestId } = req.body;

    try {
        const reqData = await pool.query(
            `SELECT sender_id, receiver_id 
             FROM friend_requests WHERE id=$1`,
            [requestId]
        );

        if (reqData.rows.length === 0)
            return res.status(404).json({ error: "Request not found" });

        const { sender_id, receiver_id } = reqData.rows[0];

        // Add both friendship directions
        await pool.query(
            `INSERT INTO friends (user_id, friend_id) VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING`,
            [sender_id, receiver_id]
        );

        await pool.query(
            `UPDATE friend_requests SET status='accepted' WHERE id=$1`,
            [requestId]
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error accepting request" });
    }
});

// DECLINE request
router.post("/decline", verifyToken, async (req, res) => {
    const { requestId } = req.body;

    try {
        await pool.query(
            `UPDATE friend_requests SET status='declined' WHERE id=$1`,
            [requestId]
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error declining request" });
    }
});

// module.exports = router;
export default router;
