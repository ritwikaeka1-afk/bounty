"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SupportForm } from "./SupportForm";
import { createClient } from "../../lib/supabase/client";

type InfoView = "about" | "faq" | "terms" | "guidelines" | "contact" | "suggestions";
const infoViews: InfoView[] = ["about", "faq", "terms", "guidelines", "contact", "suggestions"];
const faqs = [
 ["What are credits?", "Credits are Bounty’s internal record of reciprocal help. They are not money, a stored-value account, or a cryptocurrency."],
 ["How can I use credits?", "Set a credit reward when you post a bounty. Credits are reserved only when you accept a helper’s offer, then transfer after the task is completed and confirmed."],
 ["Can I convert credits to cash?", "No. Credits have no cash value and cannot be bought, sold, exchanged, transferred outside Bounty, or redeemed for money."],
 ["How do I earn credits?", "Complete an accepted bounty and ask the poster to confirm completion. Credits move through Bounty’s task record so balances and reviews stay tied to real exchanges."],
 ["Do credits expire?", "Credits do not expire during the beta. Bounty will give advance notice before changing that policy."],
 ["Will closing a tab sign me out?", "Closing a Bounty tab does not sign you out by itself. Your session is kept in this browser, while the 30-minute inactivity timer continues. Reopen Bounty before the timer expires to stay signed in; opening it after 30 minutes of inactivity requires a new sign-in link."],
 ["What belongs in Academic?", "Tutoring, studying, explaining concepts, editing, planning, and feedback are welcome. Do not ask anyone to complete graded coursework, exams, or assessments for you."],
 ["When can people message each other?", "Applicants can communicate about an application. Accepted task participants can use task messaging; keep exact meeting information private to participants."],
 ["What happens if a task changes or goes wrong?", "Use the task’s change, dispute, or report controls. For urgent danger, contact local emergency services rather than Bounty."],
];

function Page({ view, signedIn }: { view: InfoView; signedIn: boolean }) {
 const titles: Record<InfoView, [string, string]> = {
  about: ["About Bounty", "A campus help loop for practical skills, small favors, and reciprocal support."],
  faq: ["Frequently asked questions", "The basics of credits, tasks, privacy, and getting help."],
  terms: ["Terms of Service", "Bounty beta terms · Last updated September 15, 2026."],
  guidelines: ["Community Guidelines", "Rules that keep exchanges useful, respectful, and safe."],
  contact: ["Contact Bounty", "Get help with an account, task, safety concern, or privacy request."],
  suggestions: ["Help shape Bounty", "Share an idea for a clearer, safer, or more useful student exchange."],
 };
 const [title, lede] = titles[view];
 return <section className="public-page page-shell"><p className="eyebrow">BOUNTY · {view.toUpperCase()}</p><h1>{title}</h1><p className="public-lede">{lede}</p>
 {view === "about" && <div className="policy-grid public-grid"><article><h2>How it works</h2><p>Post a specific task and choose a credit reward. Students apply with their fit and availability. The poster selects a helper, then confirms completion so credits move to the helper.</p></article><article><h2>Built for mutual help</h2><p>Bounty is designed for a campus community, not a cash marketplace. Credits recognize time and effort while keeping exchanges reciprocal.</p></article><article><h2>Private by default</h2><p>Public task cards show only limited profile information. Exact meeting details and task conversations are limited to relevant participants.</p></article><article><h2>Independent community</h2><p>Bounty is not affiliated with or endorsed by UCLA. It is an independent student community using internal credits only.</p></article></div>}
 {view === "faq" && <div className="faq public-faq">{faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>}
 {view === "terms" && <div className="legal-copy"><h2>1. Agreement and eligibility</h2><p>By creating an account or using Bounty, you agree to these Terms. You must provide accurate account information, keep access links private, and use Bounty only where you are legally able to do so. Bounty may limit beta access, suspend an account, or remove content to protect users or the service.</p><h2>2. Internal credits</h2><p>Credits are internal, non-monetary units used only inside Bounty to record task rewards. They have no cash value and cannot be sold, bought, exchanged, withdrawn, transferred outside the platform, or used as a wage or payment instrument. Bounty may correct clear accounting errors and will give notice before material credit-policy changes.</p><h2>3. Tasks and users’ responsibilities</h2><p>Users decide whether to post, apply for, accept, complete, or cancel a task. Bounty is not the employer, agent, contractor, or guarantor of either participant. Describe tasks accurately, agree on scope before starting, and use public or otherwise appropriate locations for in-person work.</p><h2>4. Prohibited use</h2><p>Do not request or provide academic dishonesty, illegal goods or services, cash transactions, harassment, discrimination, fraud, unsafe work, sexual services, weapons, personal data misuse, passwords, or activity that infringes another person’s rights. Do not impersonate someone, manipulate reviews, or take exchanges off-platform to evade these rules.</p><h2>5. Content, privacy, and safety</h2><p>You are responsible for what you post. Do not publish private addresses, phone numbers, student IDs, credentials, or sensitive information in public content. Bounty may review task, application, message, and transaction records when responding to a report, dispute, safety issue, or legal request. In an emergency, contact local emergency services.</p><h2>6. Reports, suspension, and changes</h2><p>Use the reporting and support tools to flag a concern. Bounty may investigate, remove content, reverse an uncompleted reservation, restrict features, or suspend accounts when it reasonably believes these Terms were violated or safety requires it. These beta Terms may change; material changes will be posted with an updated date. California law governs these Terms to the extent applicable.</p></div>}
 {view === "guidelines" && <div className="policy-grid public-grid"><article><h2>Keep tasks clear</h2><p>Write a specific title, expected outcome, time estimate, and realistic credit reward. Update the task if the scope changes.</p></article><article><h2>Protect academic integrity</h2><p>Offer tutoring, editing, planning, and study support. Never complete graded work, exams, or assessed assignments for another student.</p></article><article><h2>Respect consent and safety</h2><p>Use public locations for in-person tasks when possible. Do not pressure anyone to meet, share contact details, or continue a task they decline.</p></article><article><h2>Keep details private</h2><p>Do not post addresses, IDs, passwords, private messages, or sensitive personal information. Share exact meeting details only with the selected participant.</p></article><article><h2>No cash marketplace</h2><p>Keep exchanges in internal credits. Do not sell credits, request cash, or use Bounty to arrange paid employment.</p></article><article><h2>Be respectful and accountable</h2><p>No harassment, discrimination, threats, scams, fake reviews, or retaliation. Report problems early and describe completed exchanges honestly.</p></article></div>}
 {(view === "contact" || view === "suggestions") && <div className="public-contact"><div><h2>{view === "suggestions" ? "What should change?" : "How can we help?"}</h2><p>{view === "suggestions" ? "Choose Product suggestion in the form and explain the problem, your idea, and who it would help." : "Choose Support request, Safety concern, or Report a bug. Include a task reference when it is relevant."}</p><p>For immediate danger, contact local emergency services. Bounty support is not an emergency service.</p></div><div className="panel">{signedIn ? <SupportForm /> : <><h2>Sign in to send a message</h2><p>Use the Sign in button in the header, then return here to contact support or send a suggestion.</p></>}</div></div>}
 </section>;
}

export function PublicInfoPages() {
 const [view, setView] = useState<InfoView | null>(null);
 const [main, setMain] = useState<HTMLElement | null>(null);
 const [signedIn, setSignedIn] = useState(false);
 useEffect(() => {
  const sync = () => { const next = new URLSearchParams(window.location.search).get("view"); setView(infoViews.includes(next as InfoView) ? next as InfoView : null); setMain(document.querySelector<HTMLElement>("main#content")); };
  sync(); const observer = new MutationObserver(sync); observer.observe(document.body, { childList: true, subtree: true }); window.addEventListener("popstate", sync);
  createClient().auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user))).catch(() => setSignedIn(false));
  return () => { observer.disconnect(); window.removeEventListener("popstate", sync); };
 }, []);
 useEffect(() => { if (main) main.classList.toggle("info-active", Boolean(view)); return () => main?.classList.remove("info-active"); }, [main, view]);
 return view && main ? createPortal(<Page view={view} signedIn={signedIn} />, main) : null;
}

