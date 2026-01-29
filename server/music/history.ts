import { pool } from "../db";
import { Track } from "./queue";

export interface HistoryEntry {
    id: number;
    guild_id: string;
    title: string;
    url: string;
    duration: string;
    requested_by: string;
    played_at: Date;
}

export async function addToHistory(guildId: string, track: Track) {
    try {
        // Insert new track
        await pool.query(
            `INSERT INTO music_history (guild_id, title, url, duration, requested_by)
       VALUES ($1, $2, $3, $4, $5)`,
            [guildId, track.title, track.url, track.duration, track.requestedBy]
        );

        // Prune old tracks (keep last 10)
        // We can do this by deleting IDs not in the top 10 desc
        await pool.query(
            `DELETE FROM music_history 
       WHERE guild_id = $1 AND id NOT IN (
         SELECT id FROM music_history 
         WHERE guild_id = $1 
         ORDER BY played_at DESC 
         LIMIT 10
       )`,
            [guildId]
        );
    } catch (err) {
        console.error("Failed to add to history:", err);
    }
}

export async function getHistory(guildId: string): Promise<HistoryEntry[]> {
    try {
        const res = await pool.query(
            `SELECT * FROM music_history 
       WHERE guild_id = $1 
       ORDER BY played_at DESC 
       LIMIT 10`,
            [guildId]
        );
        return res.rows;
    } catch (err) {
        console.error("Failed to get history:", err);
        return [];
    }
}

export async function getTrackById(id: number): Promise<HistoryEntry | null> {
    try {
        const res = await pool.query(
            `SELECT * FROM music_history WHERE id = $1`,
            [id]
        );
        return res.rows[0] || null;
    } catch (err) {
        console.error("Failed to get track by ID:", err);
        return null;
    }
}
