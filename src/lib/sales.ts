// Pure helpers for the send/reply side of the pipeline.
const EMAIL = /[a-z0-9][a-z0-9._%+-]{0,62}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i;

/** First email address in a free-text contact field, lowercased, or "". */
export function firstEmail(contact: string): string {
  return (contact.match(EMAIL)?.[0] ?? "").toLowerCase();
}

/** "Dana R <dana@x.com>" -> "dana@x.com". */
export function senderEmail(from: string): string {
  const angle = from.match(/<([^>]+)>/)?.[1];
  return firstEmail(angle ?? from);
}

/** Keep only what the person newly wrote: drop quoted history and signatures from earlier mail. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*On .+wrote:\s*$/i.test(line) || /^-{2,}\s*Original Message/i.test(line) || /^\s*From:\s.+/i.test(line) || /^_{5,}/.test(line)) break;
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

const OPT_OUT = /\b(?:unsubscribe|remove me|take me off|stop (?:emailing|contacting|sending|messaging)|do not (?:contact|email|message)|don'?t (?:contact|email|message)|not interested|no thanks|no thank you|leave me alone)\b/i;
export function isOptOut(newText: string): boolean {
  return OPT_OUT.test(newText);
}

/** Put a demo link into a draft once, just before the sign-off when there is one. */
export function addDemoLink(body: string, url: string): string {
  if (!url || body.includes(url)) return body;
  const line = `Here is the private demo I made for you: ${url}`;
  const idx = body.search(/\n\n(?:Best regards|Thanks|Thank you|Cheers|Best),?\n/i);
  return idx >= 0 ? body.slice(0, idx) + "\n\n" + line + body.slice(idx) : body + "\n\n" + line;
}

export const REPLY_SYSTEM_PROMPT = `You write short, warm, plain-text email replies for MPLS Johnny Cage of Found It. Fix It., a local web designer who built a free website concept for the business you are replying to. The goal is to book a 15-minute call.
Rules:
- Under 120 words. Plain text only. No subject line and no signature block (both are added automatically).
- Never state a price, quote or discount. If they ask about cost, say it depends on pages and features and Johnny will give an exact quote after a quick call.
- If a booking link is provided, offer it. Otherwise ask for two times that work for them this week.
- Answer only what they actually asked, using only the context given. Do not invent facts about Johnny, his clients or results.
- Match their tone. If they are not interested, thank them politely and do not push.`;

export function buildReplyPrompt(c: {business: string; trade: string; city: string; theirReply: string; ourEmail: string; demoUrl?: string; bookingUrl?: string}): string {
  return `Business: ${c.business} (${c.trade}, ${c.city})
Demo link we sent: ${c.demoUrl ?? "(none)"}
Booking link: ${c.bookingUrl ?? "(none: ask for two times)"}

Our email to them:
"""
${c.ourEmail.slice(0, 3000)}
"""

Their reply (new text only):
"""
${c.theirReply.slice(0, 3000)}
"""

Write Johnny's reply.`;
}

export function fallbackReply(c: {bookingUrl?: string}): string {
  const next = c.bookingUrl
    ? `If it's easier, you can grab a time that works for you here: ${c.bookingUrl}`
    : "What are two times this week that work for a quick 15-minute call?";
  return `Thanks for getting back to me! I'd be glad to walk you through the concept and answer any questions. Pricing depends on the pages and features you need, so I'll give you an exact quote after a short call.\n\n${next}`;
}
