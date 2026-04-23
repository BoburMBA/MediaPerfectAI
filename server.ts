import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 9110;

  app.use(express.json());

  // Proxy endpoint to handle AI Image Generation (Bypasses CORS)
  app.post("/api/ai/generate-image", async (req, res) => {
    const { config, prompt } = req.body;

    if (!config || !prompt) {
      return res.status(400).json({ error: "Missing config or prompt" });
    }

    try {
      if (config.provider === 'minimax') {
        const url = "https://api.minimax.io/v1/image_generation";
        const directRes = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
          },
          body: JSON.stringify({
            model: config.model || "image-01",
            prompt: prompt,
            aspect_ratio: "1:1",
            response_format: "base64"
          })
        });
        
        if (!directRes.ok) {
           const errText = await directRes.text();
           throw new Error(`Minimax API Error: ${directRes.status} ${errText}`);
        }
        const data = await directRes.json();
        const base64Img = data.data?.image_base64?.[0];
        if (base64Img) {
           return res.json({ url: `data:image/jpeg;base64,${base64Img}` });
        } else {
           throw new Error("No image data returned from Minimax " + JSON.stringify(data));
        }
      } else if (config.provider === 'openai') {
        const openai = new OpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseUrl || "https://api.openai.com/v1",
        });

        try {
          const response = await openai.images.generate({
            model: config.model,
            prompt: prompt,
            n: 1,
            size: "1024x1024",
          });
          return res.json({ url: response.data[0].url });
        } catch (openaiErr: any) {
          // If the provider throws a 404, they might not support the standard /images/generations path 
          // (common with Minimax, LocalAI variants, etc).
          // We attempt a generic fallback POST to the exact baseUrl they provided.
          if (openaiErr.status === 404 && config.baseUrl && !config.baseUrl.includes('api.openai.com')) {
            console.log("OpenAI path 404. Attempting raw direct fetch to:", config.baseUrl);
            try {
              const directRes = await fetch(config.baseUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${config.apiKey}`
                },
                body: JSON.stringify({
                  model: config.model,
                  prompt: prompt,
                  n: 1,
                  size: "1024x1024"
                })
              });
              
              if (directRes.ok) {
                const data = await directRes.json();
                const imageUrl = data.data?.[0]?.url || data.url || data.image_url;
                if (imageUrl) return res.json({ url: imageUrl });
              }
            } catch (fallbackErr) {
              console.error("Direct fallback failed:", fallbackErr);
            }
          }
          throw openaiErr;
        }
      } else {
        // Fallback or pollinations handled client-side or here
        const seed = Math.floor(Math.random() * 1000000);
        const encodedPrompt = encodeURIComponent(prompt);
        const url = `https://pollinations.ai/p/${encodedPrompt}?width=1024&height=1024&seed=${seed}&model=flux`;
        res.json({ url });
      }
    } catch (error: any) {
      console.error("AI Generation Proxy Error:", error);
      res.status(500).json({ 
        error: error.message || "Failed to generate image via proxy",
        details: error.response?.data || error
      });
    }
  });

  // Proxy endpoint to handle AI Music Generation (Bypasses CORS)
  app.post("/api/ai/generate-music", async (req, res) => {
    const { config, payload } = req.body;

    if (!config || !payload) {
      return res.status(400).json({ error: "Missing config or payload" });
    }

    try {
      const url = config.baseUrl || "https://api.minimax.io/v1/music_generation";
      const directRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model || "music-2.6",
          prompt: payload.prompt || "",
          ...(payload.lyrics && { lyrics: payload.lyrics }),
          output_format: "url",
          audio_setting: {
            sample_rate: 44100,
            bitrate: 256000,
            format: "mp3"
          }
        })
      });

      if (!directRes.ok) {
         const errText = await directRes.text();
         throw new Error(`API Error: ${directRes.status} ${errText}`);
      }

      const data = await directRes.json();

      if (data.base_resp && data.base_resp.status_code !== 0) {
        throw new Error(`Minimax API Error: ${data.base_resp.status_msg || data.base_resp.status_code}`);
      }

      if (data.data?.audio) {
        return res.json({ url: data.data.audio });
      } else if (data.data?.audio_base64) {
        return res.json({ url: `data:audio/mp3;base64,${data.data.audio_base64}` });
      } else if (data.url) {
        return res.json({ url: data.url });
      }

      throw new Error("No audio returned from API. Response: " + JSON.stringify(data).substring(0, 500));
    } catch (error: any) {
      console.error("AI Music Proxy Error:", error);
      res.status(500).json({
        error: error.message || "Failed to generate music via proxy"
      });
    }
  });

  // Proxy endpoint to handle AI Lyrics Generation (Bypasses CORS)
  app.post("/api/ai/generate-lyrics", async (req, res) => {
    const { config, prompt } = req.body;

    if (!config || !prompt) {
      return res.status(400).json({ error: "Missing config or prompt" });
    }

    try {
      if (config.provider === 'minimax') {
        const url = "https://api.minimax.io/v1/lyrics_generation";
        const directRes = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
          },
          body: JSON.stringify({
            mode: "write_full_song",
            prompt: prompt
          })
        });

        if (!directRes.ok) {
          const errText = await directRes.text();
          throw new Error(`API Error: ${directRes.status} ${errText}`);
        }

        const data = await directRes.json();

        if (data.base_resp && data.base_resp.status_code !== 0) {
          throw new Error(`Minimax API Error: ${data.base_resp.status_msg || data.base_resp.status_code}`);
        }

        const lyrics = data.lyrics;
        if (!lyrics) throw new Error("No lyrics returned. Response: " + JSON.stringify(data));

        return res.json({
          text: lyrics,
          song_title: data.song_title || "",
          style_tags: data.style_tags || ""
        });
      } else {
        // Fallback for custom or gemini
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
           model: "gemini-2.5-pro",
           contents: [
             { role: "user", parts: [{ text: `Write professional song lyrics for the following style/prompt: ${prompt}. Only return the lyrics.` }] }
           ]
        });
        return res.json({ text: response.text });
      }
    } catch (error: any) {
      console.error("AI Lyrics Proxy Error:", error);
      res.status(500).json({
        error: error.message || "Failed to generate lyrics via proxy"
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
