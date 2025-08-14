const inputText = document.getElementById("inputText");
const resultDiv = document.getElementById("result");

async function callGPT(actionType, text) {
  if (!API_KEY) {
    resultDiv.textContent = "No API key!";
    return;
  }

  if (!text.trim()) {
    resultDiv.textContent = "Please enter some text.";
    return;
  }

  const prompts = {
    rephrase: `Please professionally rephrase the following text to ensure it is clear, formal, and polished, suitable for communication from a Customer Success Engineer:\n${text}`,
    extend: `Please enhance the following text by elaborating on its details in a professional and formal manner appropriate for a Customer Success Engineer:\n${text}`,
    concise: `Please rewrite the following text to be concise while maintaining a formal and professional tone suitable for a Customer Success Engineer:\n${text}`
  };

  resultDiv.textContent = "Processing...";

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompts[actionType] }]
      })
    });

    const data = await response.json();
    let aiText = data.choices?.[0]?.message?.content?.trim() || "No response.";

    // Remove leading lines starting with "Extra", "List", or similar phrases
    aiText = aiText.replace(/^(Extra.*|List.*|Similar.*):?\s*\n?/i, "").trim();

    resultDiv.textContent = aiText;
  } catch (err) {
    console.error(err);
    resultDiv.textContent = "Error: " + err.message;
  }
}

// Button event listeners
document.getElementById("rephraseBtn").addEventListener("click", () => {
  callGPT("rephrase", inputText.value);
});
document.getElementById("extendBtn").addEventListener("click", () => {
  callGPT("extend", inputText.value);
});
document.getElementById("conciseBtn").addEventListener("click", () => {
  callGPT("concise", inputText.value);
});

document.getElementById("copyBtn").addEventListener("click", () => {
  navigator.clipboard.writeText(resultDiv.textContent).then(() => {
  }).catch(err => {
    console.error("Failed to copy: ", err);
  });
});
