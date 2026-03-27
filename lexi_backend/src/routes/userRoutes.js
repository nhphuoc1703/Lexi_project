// this backend is for any operations realted to users - get basic user info, search for users (friends, new contacts), update profile, etc.
import express from "express"
import pool from "../config/db.js"
import { verifyToken } from '../middleware/authMiddleware.js'; //this is for authentication validation, to make sure looked-up accounts are validated
import bcrypt from "bcrypt";
const router = express.Router();

/**
 * GET /api/users/me
 * Get current logged-in user info
 */
router.get('/me', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, email, profile_picture FROM users WHERE id = $1',[req.user.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching user:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * GET /api/users/search?query=...
 * Search for users when adding friends
 */
router.get('/search', verifyToken, async (req, res) => {
    const { query } = req.query;
    if (!query) return res.json([]);
    try {
        const result = await pool.query(
            'SELECT id, username, profile_picture FROM users WHERE LOWER(username) LIKE LOWER($1) LIMIT 20', [`%${query}%`]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error searching users:', err);
        res.status(500).json({ message: 'Server error'});
    }
});
/**
 * PUT /api/users/profile
 * Update username, bio, or profile picture
 */
router.put('/profile', verifyToken, async (req, res) => {
    // get the new username and profile picture from the front-end through PUT HTTP method
    const { username, profile_picture } = req.body;
    try {
        // update the database with the new username and profile picture from the front-end
        const result = await pool.query(
            `UPDATE users SET username = COALESCE($1, username), profile_picture = COALESCE($2, profile_picture) WHERE id = $3 RETURNING id, username, email, display_name, profile_picture`, 
            [username, profile_picture, req.user.id]
        );
        // send message to console
        res.json({ 
            message: 'Profile updated',
            user: result.rows[0]
        });
    } catch (err) {
        console.error('Error updating user:', err);
        res.status(500).json({ message: 'Server error' });
    }
});
/**
 * PUT /api/users/email
 * Update email
 */
router.put('/email', verifyToken, async (req, res) => {
    // get the new email value from front-end through PUT HTTP method
    const { email } = req.body;
    try {
        // update the database with the new email from the front-end
        const result = await pool.query(
            `UPDATE users SET email = $1 WHERE id = $2 RETURNING id, username, email, profile_picture`,
            [email, req.user.id]
        );
        // send message to console
        res.json({ 
            message: "Email updated",
            user: result.rows[0]
        });
    } catch (err) {
        console.error("Error updating email:", err);
        res.status(500).json({ message: "Server error" });
    }
});
/**
 * PUT /api/users/password
 * Update password
 */
router.put('/password', verifyToken, async (req, res) => {
    // get the old password and new password entered in the front-end thorugh PUT HTTP method
    const { oldPassword, newPassword } = req.body;
    try {
        // get the current password in the database
        const result = await pool.query(
            `SELECT password_hash FROM users WHERE id = $1`,
            [req.user.id]
        );
        // verify if old password entered by user is correct by comparing it to the one in databsae
        const valid = await bcrypt.compare(oldPassword, result.rows[0].password_hash);
        if (!valid) {
            return res.status(400).json({ message: "Old password incorrect" });
        }
        // hash the new password user enters in
        const hashed = await bcrypt.hash(newPassword, 10);
        // update the data table with the new hashed password
        await pool.query(
            `UPDATE users SET password = $1 WHERE id = $2`,
            [hashed, req.user.id]
        );
        // send message to console
        res.json({ message: "Password updated" });
    } catch (err) {
        console.error("Error updating password:", err);
        res.status(500).json({ message: "Server error" });
    }
});
// ********* might need new endpoints: /settings/devices *************
// SAVE settings:
// PUT /api/users/settings/devices
// Authorization: Bearer token
// Body:
// {
//   "inputDevice": "mic-id",
//   "outputDevice": "speaker-id",
//   "camera": "cam-id",
//   "inputVolume": 55,
//   "outputVolume": 75
// }

// FETCH settings (for UI display):
// GET /api/users/settings/devices
// Authorization: Bearer token
// Response:
// {
//   "inputDevice": "mic-id",
//   "outputDevice": "speaker-id",
//   "camera": "cam-id",
//   "inputVolume": 55,
//   "outputVolume": 75
// }
router.put("/settings/devices", verifyToken, async (req, res) => {
    try {
        await pool.query(
        `UPDATE users SET device_settings = $1 WHERE id = $2`,
        [req.body, req.user.id]
        );

        res.json(req.body);
    } catch (err) {
        console.error("Device settings error:", err);
        res.status(500).json({ message: "Server error" });
    }
});
export default router;