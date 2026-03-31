require("dotenv").config();
const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

const setupDeepgram = () => {
    console.log("Testing Deepgram Live Connection with Correct Events...");

    try {
        const deepgramLive = deepgram.listen.live({
            model: "nova-2",
            language: "en-US",
            smart_format: true,
            vad_events: true,
        });

        let keepAlive;

        deepgramLive.on(LiveTranscriptionEvents.Open, () => {
            console.log("Deepgram connected successfully!");
            keepAlive = setInterval(() => {
                console.log("Sending KeepAlive...");
                deepgramLive.keepAlive();
            }, 5000);

            // Simulate keeping open for a bit
            setTimeout(() => {
                console.log("Closing connection...");
                clearInterval(keepAlive);
                deepgramLive.finish();
            }, 10000);
        });

        deepgramLive.on(LiveTranscriptionEvents.Close, () => {
            console.log("Deepgram disconnected");
            clearInterval(keepAlive);
        });

        deepgramLive.on(LiveTranscriptionEvents.Error, (error) => {
            console.error("Deepgram error:", error);
            clearInterval(keepAlive);
        });

        deepgramLive.on(LiveTranscriptionEvents.Transcript, (data) => {
            console.log("Transcript received:", JSON.stringify(data, null, 2));
        });

    } catch (err) {
        console.error("Deepgram setup error:", err);
    }
};

setupDeepgram();
