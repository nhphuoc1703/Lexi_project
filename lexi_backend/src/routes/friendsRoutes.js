// const express = require("express");
// const pool = require("../config/db.js");
import express from "express"
import pool from "../config/db.js"

const router = express.Router();
// GET friends list for a user
router.get("/:userId", async (req, res) => {
    const { userId } = req.params;

    try {
        const result = await pool.query(
            `SELECT 
                u.id,
                u.username,
                u.display_name,
                u.profile_picture
            FROM friends f
            JOIN users u ON u.id = f.friend_id
            WHERE f.user_id = $1`,
            [userId]
        );

        res.json(result.rows);
    } catch(err) {
        console.error("Error fetching friends:", err);
        res.status(500).json({ error: "Failed to load friends list" });
    }
});

// module.exports = router;
export default router;