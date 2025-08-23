import express from "express";
import pool from "../db.js";

const router = express.Router();

router.get("/chats-data", async (req, res) => {
  try {
    const limit = Math.min(
      Number.parseInt(req.query.limit ?? "50", 10) || 50,
      200
    );

    const { rows } = await pool.query(
      `select session_id, all_history, source, created_at
         from public.formatted_history
        order by created_at desc
        limit $1`,
      [limit]
    );

    const chats = rows.map(
      ({ session_id, all_history, source, created_at }) => ({
        session_id,
        created_at,
        source: {
          name: source?.name ?? null,
          contact: source?.contact ?? null,
          platform: source?.platform ?? null,
        },
        messages: all_history.map(({ role, content }) => ({ role, content })),
      })
    );

    res.json({ ok: true, count: chats.length, chats });
  } catch (e) {
    console.error("DB query failed:", e);
    res.status(500).json({ ok: false, error: "DB query failed" });
  }
});

export default router;
