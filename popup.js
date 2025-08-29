const lastCommentText = document.getElementById("lastCommentText");
const myResponseText = document.getElementById("myResponseText");
const resultDiv = document.getElementById("result");

const ticketInput = document.getElementById("ticketInput");
const loadCommentBtn = document.getElementById("loadCommentBtn");

function getZendeskConfig() {
  // Expect these to be defined in config.js
  // ZD_SUBDOMAIN: e.g., "pantheon"
  // ZD_EMAIL: your Zendesk login email
  // ZD_API_TOKEN: your Zendesk API token
  return {
    subdomain: typeof ZD_SUBDOMAIN !== "undefined" ? ZD_SUBDOMAIN : "",
    email: typeof ZD_EMAIL !== "undefined" ? ZD_EMAIL : "",
    token:
      typeof ZD_API_TOKEN !== "undefined" && ZD_API_TOKEN
        ? ZD_API_TOKEN
        : (typeof ZENDESK_API_TOKEN !== "undefined" ? ZENDESK_API_TOKEN : "")
  };
}

function buildZendeskAuthHeader() {
  const { email, token } = getZendeskConfig();
  if (!email || !token) return null;
  const cred = `${email}/token:${token}`;
  // btoa is fine for ASCII; Zendesk emails are ASCII
  return "Basic " + btoa(cred);
  // If your email has non-ASCII chars, replace btoa with a UTF-8 base64 encoder.
}

function parseTicketIdFromInput(raw) {
  const text = (raw || "").trim();
  if (!text) return null;
  // If it's a full URL like https://your.zendesk.com/agent/tickets/12345
  const match = text.match(/tickets\/(\d+)/);
  if (match) return match[1];
  // If it's just digits, return as is
  if (/^\d+$/.test(text)) return text;
  return null;
}

async function fetchLastZendeskComment(ticketId) {
  const cfg = getZendeskConfig();
  if (!cfg.subdomain) {
    resultDiv.textContent = "Zendesk subdomain (ZD_SUBDOMAIN) is not set in config.js.";
    return null;
  }
  const auth = buildZendeskAuthHeader();
  if (!auth) {
    resultDiv.textContent = "Zendesk email/token (ZD_EMAIL, ZD_API_TOKEN) are not set in config.js.";
    return null;
  }

  // Use cursor pagination and explicit descending sort by created_at so newest comment is first
  const url = `https://${cfg.subdomain}.zendesk.com/api/v2/tickets/${ticketId}/comments.json?sort=-created_at&page[size]=1`;

  resultDiv.textContent = "Fetching last Zendesk comment...";

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": auth,
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Zendesk API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    const comments = data.comments || [];
    if (comments.length === 0) {
      resultDiv.textContent = "No comments found on that ticket.";
      return null;
    }

    // API returned newest first due to sort_order=desc and page[size]=1
    const last = comments[0];
    // Prefer plain text body; fall back to html_body stripped if needed
    let body = last.body || "";
    if (!body && last.html_body) {
      const tmp = document.createElement("div");
      tmp.innerHTML = last.html_body;
      body = tmp.textContent || tmp.innerText || "";
    }
    return body.trim();
  } catch (e) {
    console.error(e);
    resultDiv.textContent = "Error fetching comment: " + e.message;
    return null;
  }
}

async function callGPT(actionType) {
  if (!API_KEY) {
    resultDiv.textContent = "No API key!";
    return;
  }

  const lastComment = (lastCommentText?.value || "").trim();
  const draft = (myResponseText?.value || "").trim();

  if (!lastComment) {
    resultDiv.textContent = "No last comment loaded yet.";
    return;
  }
  if (!draft) {
    resultDiv.textContent = "Please write your draft response.";
    return;
  }

  const baseInstruction = {
    rephrase: "Professionally polish the draft so it is clear, formal, and concise for a Customer Success Engineer.",
    extend: "Professionally enhance the draft with additional clarity and useful details while staying concise and relevant.",
    concise: "Professionally rewrite the draft to be more concise while preserving key details and action items.",
    empathy: "Professionally rewrite the draft with empathy and supportive tone appropriate for a Customer Success Engineer."
  }[actionType] || "Professionally polish the draft.";

  const system = "You are an expert Customer Success Engineer. Respond ONLY with the improved body text (no subject lines, no preambles).";
  const user = `Context: This reply is to a customer's latest ticket comment.\n\nLast comment from customer:\n\"\"\"\n${lastComment}\n\"\"\"\n\nMy draft reply:\n\"\"\"\n${draft}\n\"\"\"\n\nTask: ${baseInstruction}\nConstraints: Keep it professional, accurate, and friendly. Do not invent facts. Do not add a subject line.`;

  resultDiv.textContent = "Rephrasing with GPT...";

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });

    const data = await response.json();
    let aiText = data.choices?.[0]?.message?.content?.trim() || "No response.";

    // Remove any stray prefixes like "Summary:" etc.
    aiText = aiText.replace(/^(Extra.*|List.*|Similar.*|Summary.*|Notes.*):?\s*\n?/i, "").trim();

    resultDiv.textContent = aiText;
  } catch (err) {
    console.error(err);
    resultDiv.textContent = "Error: " + err.message;
  }
}

// Button event listeners
document.getElementById("rephraseBtn").addEventListener("click", () => {
  callGPT("rephrase");
});
document.getElementById("extendBtn").addEventListener("click", () => {
  callGPT("extend");
});
document.getElementById("conciseBtn").addEventListener("click", () => {
  callGPT("concise");
});
document.getElementById("empathyBtn").addEventListener("click", () => {
  callGPT("empathy");
});

if (loadCommentBtn) {
  loadCommentBtn.addEventListener("click", async () => {
    const ticketId = parseTicketIdFromInput(ticketInput ? ticketInput.value : "");
    if (!ticketId) {
      resultDiv.textContent = "Enter a valid Zendesk ticket URL or numeric ID.";
      return;
    }
    const body = await fetchLastZendeskComment(ticketId);
    if (body) {
      lastCommentText.value = body;
      resultDiv.textContent = "Loaded the latest comment.";
    }
  });
}

// On popup open, try to read the active tab URL and auto-load latest comment
document.addEventListener("DOMContentLoaded", () => {
  try {
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const url = tabs?.[0]?.url || "";
        if (!url) return;
        if (ticketInput) ticketInput.value = url;
        const ticketId = parseTicketIdFromInput(url);
        if (ticketId) {
          const body = await fetchLastZendeskComment(ticketId);
          if (body) {
            lastCommentText.value = body;
            resultDiv.textContent = "Loaded the latest comment from the active Zendesk tab.";
          }
        }
      });
    }
  } catch (e) {
    console.warn("Could not auto-read tab URL:", e);
  }
});

document.getElementById("copyBtn").addEventListener("click", () => {
  navigator.clipboard.writeText(resultDiv.textContent).then(() => {
    resultDiv.textContent = "Copied to clipboard.";
  }).catch(err => {
    console.error("Failed to copy: ", err);
  });
});
