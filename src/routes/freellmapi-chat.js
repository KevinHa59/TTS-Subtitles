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

    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Message is required",
      });
    }

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
              role: "user",
              content: message,
            },
          ],
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
      message: data.choices?.[0]?.message?.content ?? "",
    });
  } catch (error) {
    console.error("FreeLLM API Error:", error);

    return res.status(500).json({
      error: "Failed to call FreeLLM",
    });
  }
});

export default router;
