const RECIPIENT = "alice@newbeginningcc.net";
const MEETING_METHODS = new Set(["In person", "Telehealth", "No preference"]);
const COMMUNICATION_METHODS = new Set(["Phone call", "Email", "Text message"]);

interface RequestLike {
  method?: string;
  body?: Record<string, unknown> | string;
}

interface ResponseLike {
  status(code: number): ResponseLike;
  json(body: unknown): void;
}

const value = (body: Record<string, unknown>, key: string, maxLength: number) =>
  typeof body[key] === "string" ? body[key].trim().slice(0, maxLength) : "";

const escapeHtml = (input: string) =>
  input.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);

export default async function handler(req: RequestLike, res: ResponseLike) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed." });
  }

  let body: Record<string, unknown>;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
  } catch {
    return res.status(400).json({ message: "Invalid request." });
  }

  if (value(body, "company", 200)) {
    return res.status(200).json({ ok: true });
  }

  const submission = {
    firstName: value(body, "firstName", 100),
    lastName: value(body, "lastName", 100),
    phone: value(body, "phone", 30),
    email: value(body, "email", 254),
    dateOfBirth: value(body, "dateOfBirth", 10),
    insurance: value(body, "insurance", 150),
    preferredMeetingMethod: value(body, "preferredMeetingMethod", 50),
    preferredCommunicationMethod: value(body, "preferredCommunicationMethod", 50),
    preferredCounselor: value(body, "preferredCounselor", 150) || "No preference",
    message: value(body, "message", 4000),
  };

  if (Object.entries(submission).some(([key, field]) => key !== "preferredCounselor" && !field)) {
    return res.status(400).json({ message: "Please complete every required field." });
  }
  if (!/^\S+@\S+\.\S+$/.test(submission.email)) {
    return res.status(400).json({ message: "Please enter a valid email address." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(submission.dateOfBirth)) {
    return res.status(400).json({ message: "Please enter a valid date of birth." });
  }
  if (!MEETING_METHODS.has(submission.preferredMeetingMethod) || !COMMUNICATION_METHODS.has(submission.preferredCommunicationMethod)) {
    return res.status(400).json({ message: "Please select valid contact preferences." });
  }

  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  const env = runtime.process?.env ?? {};
  const apiKey = env.RESEND_API_KEY;
  const from = env.CONTACT_FROM_EMAIL;
  if (!apiKey || !from) {
    return res.status(503).json({ message: "The contact form is not configured yet. Please call the office instead." });
  }

  const rows = [
    ["Name", `${submission.firstName} ${submission.lastName}`],
    ["Phone", submission.phone],
    ["Email", submission.email],
    ["Date of birth", submission.dateOfBirth],
    ["Insurance", submission.insurance],
    ["Preferred meeting method", submission.preferredMeetingMethod],
    ["Preferred communication method", submission.preferredCommunicationMethod],
    ["Preferred counselor", submission.preferredCounselor],
    ["Message", submission.message],
  ];
  const html = rows.map(([label, field]) => `<p><strong>${escapeHtml(label)}:</strong><br>${escapeHtml(field).replace(/\n/g, "<br>")}</p>`).join("");
  const text = rows.map(([label, field]) => `${label}:\n${field}`).join("\n\n");

  try {
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [RECIPIENT],
        reply_to: submission.email,
        subject: `New website inquiry from ${submission.firstName} ${submission.lastName}`,
        html,
        text,
      }),
    });

    if (!emailResponse.ok) {
      return res.status(502).json({ message: "We could not send your message. Please call the office instead." });
    }
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(502).json({ message: "We could not send your message. Please call the office instead." });
  }
}
