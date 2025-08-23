import express from "express";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();

router.get("/current-date-time", async (req, res) => {
  const now = new Date().toLocaleString("sv-SE", {
    timeZone: "Europe/Riga",
    hour12: false,
  });

  const nowDateObj = new Date(now);
  const tomorrowObj = new Date(nowDateObj);
  tomorrowObj.setDate(nowDateObj.getDate() + 1);

  const todayStr = nowDateObj.toISOString().split("T")[0];
  const tomorrowStr = tomorrowObj.toISOString().split("T")[0];
  const nowFormatted = now.replace(" ", "T");

  console.log(nowFormatted, todayStr, tomorrowStr);
  res.json({
    currentDate: nowFormatted,
    today: todayStr,
    tomorrow: tomorrowStr,
  });
});

export default router;
