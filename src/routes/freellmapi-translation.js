import { Router } from "express";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const baseUrl = process.env.FREELLM_BASE_URL;
    const apiKey = process.env.FREELLM_API_KEY;

    if (!baseUrl || !apiKey) {
      return res.status(500).json({
        error: "FreeLLM configuration is missing",
      });
    }

    const { subtitle, prompt } = req.body;

    if (
      typeof subtitle !== "string" ||
      !subtitle.trim() ||
      typeof prompt !== "string" ||
      !prompt.trim()
    ) {
      return res.status(400).json({
        error: "Subtitle and prompt are required",
      });
    }

    // Parse SRT and remove timestamps
    const entries = subtitle
      .replace(/^\uFEFF/, "")
      .trim()
      .split(/\r?\n\s*\r?\n/)
      .map((block) => {
        const lines = block.split(/\r?\n/);

        if (lines.length < 3) return null;

        const id = lines[0].trim();

        const timestampIndex = lines.findIndex((line) =>
          /^\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(
            line.trim(),
          ),
        );

        if (timestampIndex === -1) return null;

        const text = lines
          .slice(timestampIndex + 1)
          .join(" ")
          .trim();

        if (!text) return null;

        return `${id}|${text}`;
      })
      .filter(Boolean);

    if (entries.length === 0) {
      return res.status(400).json({
        error: "No valid subtitle entries found",
      });
    }

    // Convert to compact subtitle format
    const compactSubtitle = entries.join("\n");

    // Send to FreeLLM
    const response = await fetch(
      `${baseUrl.replace(/\/+$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "auto",
          messages: [
            {
              role: "system",
              content: prompt,
            },
            {
              role: "user",
              content: compactSubtitle,
            },
          ],
          temperature: 0.3,
          stream: false,
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("FreeLLM Error:", data);
      return res.status(response.status).json(data);
    }

    return res.json({
      subtitle: compactSubtitle,
      result: data.choices?.[0]?.message?.content ?? "",
      totalEntries: entries.length,
    });
  } catch (error) {
    console.error("FreeLLM API Error:", error);

    return res.status(500).json({
      error: "Failed to process subtitle",
    });
  }
});

export default router;
