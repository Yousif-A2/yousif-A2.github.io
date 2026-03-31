
require("dotenv").config();
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
const Groq = require("groq-sdk");
const path = require("path");
// const fetch = require("node-fetch"); // Built-in fetch used

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

app.use(cors());
app.use(express.static(path.join(__dirname, "../client/dist")));

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `
You are an advanced AI assistant representing Yousif, an AI Engineer.
Your goal is to showcase Yousif's skills, projects, and experience in a fantastic, engaging way.
You are running in a voice-to-voice interface. Keep your responses concise (1-2 sentences) and conversational.
Do not use markdown or emojis in your response as it will be spoken out loud.
Be enthusiastic, professional, and slightly futuristic.
`;

wss.on("connection", (ws) => {
  console.log("Client connected");

  let deepgramLive = null;

  const setupDeepgram = () => {
    try {
      deepgramLive = deepgram.listen.live({
        model: "nova-2",
        language: "en",
        interim_results: true,
      });

      let keepAlive;

      deepgramLive.on(LiveTranscriptionEvents.Open, () => {
        console.log("Deepgram connected");
        keepAlive = setInterval(() => {
          if (deepgramLive && deepgramLive.getReadyState() === WebSocket.OPEN) {
            deepgramLive.keepAlive();
          } else {
            clearInterval(keepAlive);
          }
        }, 10000);
      });

      deepgramLive.on(LiveTranscriptionEvents.Close, (event) => {
        console.log("Deepgram disconnected — code:", event?.code, "reason:", event?.reason);
        clearInterval(keepAlive);
      });

      deepgramLive.on(LiveTranscriptionEvents.Error, (error) => {
        console.error("Deepgram error:", error);
        ws.send(JSON.stringify({ type: "error", content: "Voice connection failed" }));
        clearInterval(keepAlive);
      });

      deepgramLive.addListener(LiveTranscriptionEvents.Transcript, async (transcription) => {
        const transcript = transcription.channel?.alternatives?.[0]?.transcript;
        const detectedLang = transcription.channel?.alternatives?.[0]?.detected_language || 'en'; // Default to English if detection fails

        if (transcript && transcription.is_final) {
          console.log(`User (${detectedLang}):`, transcript);
          ws.send(JSON.stringify({ type: "transcription", content: transcript, role: 'user' }));

          // Determine System Prompt and TTS Voice based on detected language
          // Note: Deepgram Aura only supports specific languages. Falling back to English voice for Arabic if needed, 
          // or we could use 'aura-stella-en' which might handle foreign phonemes slightly better, but it will still be accented.
          // Since user chose to stick with Deepgram, we use the English voice.

          let systemPrompt = SYSTEM_PROMPT;
          let ttsModel = "aura-asteria-en";

          if (detectedLang === 'ar') {
            systemPrompt += "\nIMPORTANT: The user is speaking in Arabic. You MUST reply in Arabic. Keep it concise and natural.";
          }

          // Send to Groq
          try {
            const completion = await groq.chat.completions.create({
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: transcript }
              ],
              model: "llama-3.1-8b-instant",
            });

            const responseText = completion.choices[0]?.message?.content;
            if (responseText) {
              console.log("AI:", responseText);
              ws.send(JSON.stringify({ type: "text", content: responseText, role: 'ai' }));

              // Deepgram TTS
              try {
                const response = await fetch(`https://api.deepgram.com/v1/speak?model=${ttsModel}`, {
                  method: "POST",
                  headers: {
                    "Authorization": `Token ${process.env.DEEPGRAM_API_KEY}`,
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({ text: responseText })
                });

                if (response.ok) {
                  const arrayBuffer = await response.arrayBuffer();
                  const buffer = Buffer.from(arrayBuffer);
                  ws.send(buffer); // Send audio binary
                } else {
                  console.error("TTS Error:", await response.text());
                }
              } catch (ttsErr) {
                console.error("TTS Fetch Error:", ttsErr);
              }
            }
          } catch (err) {
            console.error("Groq error", err);
          }
        }
      });
    } catch (err) {
      console.error("Deepgram setup error:", err);
      ws.send(JSON.stringify({ type: "error", content: "Voice service unavailable" }));
    }
  };

  ws.on("message", (message) => {
    // Check for JSON control messages
    if (message instanceof Buffer && message[0] === 0x7b) {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === "start_listening") {
          setupDeepgram();
          return;
        }
        if (data.type === "stop_listening") {
          if (deepgramLive) {
            deepgramLive.finish();
            deepgramLive = null;
          }
          return;
        }
      } catch (e) { /* not JSON, treat as audio */ }
    }
    // Forward binary audio to Deepgram
    if (deepgramLive && deepgramLive.getReadyState() === WebSocket.OPEN) {
      deepgramLive.send(message);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    if (deepgramLive) {
      deepgramLive.finish();
      deepgramLive = null;
    }
  });
});

// Fallback for SPA routing
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
