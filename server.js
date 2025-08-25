import dotenv from "dotenv";
dotenv.config();
import express from "express";
import n8nRouter from "./routes/n8n.js";
import publicRouter from "./routes/public.js";
import apiRouter from "./routes/api.js";
import waWebhookRouter from "./routes/waWebhook.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.static(path.join(__dirname, "public")));

// Global API key middleware for /n8n routes
const API_SECRET = process.env.API_SECRET; // array of secrets

const apiKeyMiddleware = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || !API_SECRET.includes(apiKey)) {
    return res.status(401).send("Unauthorized: Invalid or missing API key");
  }
  next();
};

// HTML routes
app.get("/chats", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "chats.html"));
});

app.use("/", waWebhookRouter);
app.use("/", publicRouter);
app.use("/n8n", apiKeyMiddleware, n8nRouter);
app.use("/api", apiKeyMiddleware, apiRouter);

const PORT = process.env.PORT || 8383;

app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
});
