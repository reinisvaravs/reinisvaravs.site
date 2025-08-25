import express from "express";
import crypto from "crypto";

const router = express.Router();

/**
 * Verify Meta signature using APP_SECRET and raw request body
 * @param {Object} req - Express request object with rawBody
 * @param {string} appSecret - Meta app secret
 * @returns {boolean} - True if signature is valid or APP_SECRET is unset
 */
function verifyMetaSignature(req, appSecret) {
  if (!appSecret) return true;
  const sigHeader = req.headers["x-hub-signature-256"];
  if (!sigHeader || !sigHeader.startsWith("sha256=")) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(req.rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expected));
}

/**
 * GET /wa/webhook - Meta verification endpoint
 * Handles Meta's verification challenge for webhook setup
 */
router.get("/wa/webhook", (req, res) => {
  const {
    "hub.mode": mode,
    "hub.verify_token": verifyToken,
    "hub.challenge": challenge,
  } = req.query;

  if (mode === "subscribe" && verifyToken === process.env.VERIFY_TOKEN) {
    console.log("WhatsApp webhook verified successfully");
    return res.status(200).send(challenge);
  } else {
    console.log("WhatsApp webhook verification failed: invalid token or mode");
    return res.status(403).send("Forbidden");
  }
});

/**
 * POST /wa/webhook - WhatsApp message webhook
 * Receives messages from Meta, verifies signature, and forwards to n8n
 */
router.post("/wa/webhook", async (req, res) => {
  const appSecret = process.env.APP_SECRET;

  // Verify signature if APP_SECRET is set
  if (!verifyMetaSignature(req, appSecret)) {
    console.log("WhatsApp webhook: Invalid signature");
    return res.status(401).send("Unauthorized");
  }

  // Send immediate 200 response before processing
  res.status(200).send("OK");

  try {
    const { entry } = req.body;

    if (!entry || !Array.isArray(entry)) {
      console.log("WhatsApp webhook: No entry data received");
      return;
    }

    // Process each entry
    for (const entryItem of entry) {
      if (!entryItem.changes || !Array.isArray(entryItem.changes)) {
        continue;
      }

      // Process each change
      for (const change of entryItem.changes) {
        const { value } = change;

        if (!value) {
          continue;
        }

        // Skip status-only events (no messages)
        if (value.statuses && !value.messages) {
          console.log("WhatsApp webhook: Dropping status-only event");
          continue;
        }

        // Forward only real inbound user messages
        if (
          value.messages &&
          value.messages[0] &&
          value.messages[0].from_me !== true
        ) {
          console.log("WhatsApp webhook: Forwarding inbound message to n8n");

          try {
            await fetch(process.env.N8N_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ value }),
            });
            console.log("WhatsApp webhook: Message forwarded successfully");
          } catch (error) {
            console.error(
              "WhatsApp webhook: Failed to forward message to n8n:",
              error.message
            );
          }
        } else {
          console.log(
            "WhatsApp webhook: Dropping non-user message or outbound message"
          );
        }
      }
    }
  } catch (error) {
    console.error("WhatsApp webhook: Error processing webhook:", error.message);
  }
});

export default router;

/*
Local test commands:

# Verify handshake (should return 200 + 123)
curl -s "http://localhost:3000/wa/webhook?hub.mode=subscribe&hub.verify_token=$VERIFY_TOKEN&hub.challenge=123"

# Simulate inbound user message (should forward to N8N_URL)
curl -s -X POST http://localhost:3000/wa/webhook \
  -H "Content-Type: application/json" \
  -d '{"entry":[{"changes":[{"value":{"messages":[{"id":"ABCD","from":"123","from_me":false,"type":"text","text":{"body":"hi"}}]}}]}]}'
*/
