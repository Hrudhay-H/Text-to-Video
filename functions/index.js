const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();

// Enable CORS for all requests
app.use(cors({ origin: true }));

// Replicate API Proxy
app.all("*", async (req, res) => {
    // Get token from Firebase Config or Environment
    // Run: firebase functions:config:set replicate.token="YOUR_TOKEN"
    const apiToken = process.env.REPLICATE_API_TOKEN || functions.config().replicate?.token;

    if (!apiToken) {
        console.error("Missing REPLICATE_API_TOKEN configuration");
        res.status(500).send("Server configuration error: Missing API Token");
        return;
    }

    // Strip '/api/replicate' from the path to get the target path on Replicate API
    // Incoming request: /api/replicate/predictions -> /predictions
    const targetPath = req.path.replace(/^\/api\/replicate/, "") || req.path;
    const targetUrl = `https://api.replicate.com/v1${targetPath}`;

    console.log(`Proxying request to: ${targetUrl} [${req.method}]`);

    try {
        const response = await fetch(targetUrl, {
            method: req.method,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Token ${apiToken}`,
                // Forward other relevant headers if needed, but exclude Host
            },
            body: req.method === "POST" || req.method === "PUT" ? JSON.stringify(req.body) : undefined,
        });

        const data = await response.json();

        // Forward status code
        res.status(response.status).json(data);
    } catch (error) {
        console.error("Proxy error:", error);
        res.status(500).json({ error: "Failed to proxy request", details: error.message });
    }
});

exports.replicateProxy = functions.https.onRequest(app);
