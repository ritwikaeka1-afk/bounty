"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "../lib/supabase/client";
import { createTemplatedBounty, submitProposal, updateMyProfileDetails, uploadBountyImages, uploadProfileAvatar } from "../lib/marketplace";
import { SupportForm } from "./components/SupportForm";

type Tab = "home" | "browse" | "post" | "tasks" | "profile" | "help" | "confirmation";
type Template = { id: string; category: string; subcategory: string; title: string; guidance: string; default_reward_credits: number; required_skills: string[]; requires_location: boolean };
type Bounty = { id: string | number; title: string; description: string; category: string; reward: number; when: string; location?: string; skills: string[] };
const templates: Template[] = [
  { id: "calc", category: "Academic", subcategory: "Tutoring", title: "Calculus study session", guidance: "Review assigned concepts and practice problems with a peer tutor.", default_reward_credits: 60, required_skills: ["Calculus", "Tutoring"], requires_location: false },
  { id: "resume", category: "Academic", subcategory: "Writing", title: "Resume or cover-letter review", guidance: "Get structured feedback on a career document.", default_reward_credits: 25, required_skills: ["Writing", "Career"], requires_location: false },
  { id: "interview", category: "Career", subcategory: "Interview prep", title: "Practice interview session", guidance: "Run a mock interview and receive actionable notes.", default_reward_credits: 45, required_skills: ["Interviewing", "Career"], requires_location: false },
  { id: "photo", category: "Creative", subcategory: "Photography", title: "Student event photography", guidance: "Photograph an approved student organization event.", default_reward_credits: 45, required_skills: ["Photography"], requires_location: true },
  { id: "pickup", category: "Errands", subcategory: "Campus help", title: "On-campus item pickup", guidance: "Pick up a permitted item at an agreed campus location.", default_reward_credits: 30, required_skills: ["Campus navigation"], requires_location: true },
  { id: "tech", category: "Tech", subcategory: "Tech support", title: "Basic device setup help", guidance: "Help with permitted software settings or device setup.", default_reward_credits: 35, required_skills: ["Technology support"], requires_location: true }
];
const demoBounties: Bounty[] = [
  { id: 1, title: "Calculus study session", description: "Help review integration techniques before a midterm.", category: "Academic", reward: 60, when: "Tomorrow", skills: ["Calculus", "Tutoring"] },
  { id: 2, title: "Student event photography", description: "Take candid photos at an approved organization event.", category: "Creative", reward: 45, when: "Fri, 6:30 PM", location: "Kerckhoff Hall", skills: ["Photography"] },
  { id: 3, title: "On-campus item pickup", description: "Small permitted pickup at an agreed meeting point.", category: "Errands", reward: 30, when: "This weekend", location: "North Campus", skills: ["Campus navigation"] }
];
const mapUrl = (place: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;

export default function BountyApp() {
  const [tab, setTab] = useState<Tab>("home");
  const [email, setEmail] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginMessage, setLoginMessage] = useState("");
  const [auth, setAuth] = useState({ email: "", name: "", major: "", year: "" });
  const [catalog, setCatalog] = useState(templates);
  const [bounties, setBounties] = useState(demoBounties);
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("Recommended");
  const [selected, setSelected] = useState<Template | null>(null);
  const [post, setPost] = useState({ details: "", date: "", time: "", location: "", address: "" });
  const [images, setImages] = useState<File[]>([]);
  const [bid, setBid] = useState<Bounty | null>(null);
  const [confirmation, setConfirmation] = useState<{ title: string; reward: number } | null>(null);
  const [profile, setProfile] = useState({ name: "", major: "", year: "", bio: "", skills: "", interests: "", experience: "beginner" as "beginner" | "intermediate" | "advanced", avatar: "" });

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setEmail(session?.user.email ?? null));
    supabase.from("bounty_templates").select("id, category, subcategory, title, guidance, default_reward_credits, required_skills, requires_location").eq("is_active", true).then(({ data }) => { if (data?.length) setCatalog(data); });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!email) return;
    const supabase = createClient();
    supabase.from("profiles").select("display_name, major, graduation_year, bio, skills, interests, experience, avatar_url").maybeSingle().then(({ data }) => {
      if (data) setProfile({ name: data.display_name, major: data.major ?? "", year: data.graduation_year?.toString() ?? "", bio: data.bio ?? "", skills: (data.skills ?? []).join(", "), interests: (data.interests ?? []).join(", "), experience: data.experience, avatar: data.avatar_url ?? "" });
    });
  }, [email]);

  const visible = useMemo(() => bounties.filter(b => filter === "All" || b.category === filter).sort((a, b) => sort === "Highest reward" ? b.reward - a.reward : a.reward - b.reward), [bounties, filter, sort]);
  const categories = ["All", ...Array.from(new Set(catalog.map(t => t.category)))];
  const needSignIn = (next: Tab) => { if (!email) { setLoginOpen(true); return; } setTab(next); };

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!auth.email.endsWith("@ucla.edu") || !auth.name || !auth.major || !auth.year) { setLoginMessage("Enter your UCLA email, name, major, and graduation year."); return; }
    const { error } = await createClient().auth.signInWithOtp({ email: auth.email, options: { emailRedirectTo: window.location.origin, data: { display_name: auth.name } } });
    setLoginMessage(error ? error.message : "Check your UCLA email for your one-time sign-in link.");
  }
  async function publish(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || post.details.length < 20) return;
    try {
      let id = "";
      if (selected.id.length > 10) {
        const due = post.date ? new Date(`${post.date}T${post.time || "23:59"}`).toISOString() : undefined;
        id = await createTemplatedBounty(selected.id, post.details, post.location, post.address, due);
        if (images.length) await uploadBountyImages(id, images);
      }
      setBounties(current => [{ id: id || Date.now(), title: selected.title, description: post.details, category: selected.category, reward: selected.default_reward_credits, when: post.date || "Flexible", location: post.location || undefined, skills: selected.required_skills }, ...current]);
      setConfirmation({ title: selected.title, reward: selected.default_reward_credits }); setPost({ details: "", date: "", time: "", location: "", address: "" }); setImages([]); setTab("confirmation");
    } catch (error) { alert(error instanceof Error ? error.message : "Unable to publish this bounty."); }
  }
  async function sendBid(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!bid) return;
    const message = new FormData(e.currentTarget).get("message")?.toString() ?? "";
    try { if (typeof bid.id === "string") await submitProposal(bid.id, message); setBid(null); alert("Your offer was sent."); } catch (error) { alert(error instanceof Error ? error.message : "Unable to send offer."); }
  }
  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    try { await updateMyProfileDetails({ displayName: profile.name, bio: profile.bio, skills: split(profile.skills), interests: split(profile.interests), experience: profile.experience, major: profile.major, graduationYear: profile.year ? Number(profile.year) : null, avatarUrl: profile.avatar }); alert("Profile saved."); } catch (error) { alert(error instanceof Error ? error.message : "Unable to save profile."); }
  }
  async function selectAvatar(file?: File) {
    if (!file) return;
    try {
      const avatar = await uploadProfileAvatar(file);
      setProfile(current => ({ ...current, avatar }));
    } catch (error) { alert(error instanceof Error ? error.message : "Unable to upload image."); }
  }

  return <main className="bounty-app">
    <header className="topbar"><button className="wordmark" onClick={() => setTab("home")}>bounty<span>✦</span></button><nav>{(["home", "browse", "post", "tasks", "profile", "help"] as Tab[]).map(item => <button key={item} onClick={() => item === "post" || item === "tasks" || item === "profile" ? needSignIn(item) : setTab(item)} className={tab === item ? "active" : ""}>{label(item)}</button>)}</nav><button className="sign-button" onClick={() => email ? setTab("profile") : setLoginOpen(true)}>{email ? "My profile" : "Sign in"}</button></header>
    {tab === "home" && <section className="simple-home"><p className="eyebrow">UCLA STUDENT MARKETPLACE</p><h1>Need a hand?<br/><em>Post a bounty.</em></h1><p>Safe, approved campus tasks. Verified students. Internal credits only.</p><div><button className="primary" onClick={() => needSignIn("post")}>Post a task</button><button className="text-button" onClick={() => setTab("browse")}>Browse bounties →</button></div><section className="home-cards"><article><b>Post safely</b><span>Choose an approved task template.</span></article><article><b>Offer your skills</b><span>Bid on work that fits your experience.</span></article><article><b>Earn credits</b><span>Credits stay inside Bounty.</span></article></section></section>}
    {tab === "browse" && <section className="page-shell"><div className="page-title"><div><p className="eyebrow">MARKETPLACE</p><h2>Find work that fits you.</h2></div><button className="primary" onClick={() => needSignIn("post")}>Post a task</button></div><div className="filterbar"><div>{categories.map(c => <button className={filter === c ? "chip selected" : "chip"} onClick={() => setFilter(c)} key={c}>{c}</button>)}</div><select value={sort} onChange={e => setSort(e.target.value)}><option>Recommended</option><option>Highest reward</option></select></div><div className="listing-grid">{visible.map(b => <article className="listing" key={b.id}><span className="category">{b.category}</span><h3>{b.title}</h3><p>{b.description}</p><div className="skill-list">{b.skills.map(skill => <i key={skill}>{skill}</i>)}</div>{b.location && <a href={mapUrl(b.location)} target="_blank" rel="noreferrer">⌖ {b.location} · Map ↗</a>}<footer><span>{b.when}</span><strong>✦ {b.reward}</strong><button onClick={() => { if (!email) setLoginOpen(true); else setBid(b); }}>Offer help</button></footer></article>)}</div></section>}
    {tab === "post" && <section className="page-shell post-page"><div className="page-title"><div><p className="eyebrow">POST A BOUNTY</p><h2>What do you need?</h2><p>Start with an approved task type, then make the details clear.</p></div></div><form onSubmit={publish}><div className="post-layout"><div><label>1. Choose a task type<select required value={selected?.id ?? ""} onChange={e => setSelected(catalog.find(t => t.id === e.target.value) ?? null)}><option value="">Select a category and task</option>{catalog.map(t => <option key={t.id} value={t.id}>{t.category} · {t.subcategory} — {t.title}</option>)}</select></label>{selected && <aside className="recommendation"><b>Recommended: ✦ {selected.default_reward_credits}</b><span>{selected.guidance}</span><small>Helpful skills: {selected.required_skills.join(", ")}</small></aside>}<label>2. Short description<textarea required minLength={20} maxLength={3000} value={post.details} onChange={e => setPost({ ...post, details: e.target.value })} placeholder="Describe what you need, what success looks like, and any useful context." /></label><div className="field-row"><label>Needed date<input type="date" value={post.date} onChange={e => setPost({ ...post, date: e.target.value })} /></label><label>Needed time<input type="time" value={post.time} onChange={e => setPost({ ...post, time: e.target.value })} /></label></div>{selected?.requires_location && <><label>UCLA place or landmark<input value={post.location} onChange={e => setPost({ ...post, location: e.target.value })} placeholder="e.g. Powell Library" /></label><label>Meeting/address details<input value={post.address} onChange={e => setPost({ ...post, address: e.target.value })} placeholder="Optional; share only what is necessary" /></label></>}<label>Reference photos (up to 4)<input type="file" accept="image/*" multiple onChange={e => setImages(Array.from(e.target.files ?? []).slice(0, 4))} /></label>{images.length > 0 && <p className="upload-note">{images.length} photo{images.length > 1 ? "s" : ""} ready to upload after posting.</p>}</div><aside className="post-summary"><p className="eyebrow">YOUR BOUNTY</p><h3>{selected?.title ?? "Choose a task type"}</h3><strong>✦ {selected?.default_reward_credits ?? "—"} credits</strong><p>Credits are held only when you accept a qualified student’s offer.</p><button className="primary" type="submit" disabled={!selected}>Publish bounty</button><small>No payments or cash value. Custom categories are disabled for safety.</small></aside></div></form></section>}
    {tab === "tasks" && <section className="page-shell"><div className="page-title"><div><p className="eyebrow">MY TASKS</p><h2>Keep work moving.</h2><p>Offers, accepted work, and completed bounties will appear here.</p></div><button className="primary" onClick={() => setTab("post")}>Post another task</button></div><div className="empty-state"><b>No active tasks yet.</b><span>Post an approved task or offer help on one from the marketplace.</span><button className="text-button" onClick={() => setTab("browse")}>Browse bounties →</button></div></section>}
    {tab === "help" && (
  <section className="page-shell">
    <div className="page-title">
      <div>
        <p className="eyebrow">HELP & SAFETY</p>
        <h2>How can we help?</h2>
        <p>
          Send a support request, suggest an improvement, or report a safety concern.
          If someone is in immediate danger, call 911 or local emergency services.
        </p>
      </div>
    </div>

    <SupportForm />
  </section>
)}
    {tab === "profile" && <section className="page-shell profile-page"><div className="page-title"><div><p className="eyebrow">YOUR PROFILE</p><h2>Show why you’re a good fit.</h2><p>Profiles help bounty posters evaluate relevant skills—not personal information.</p></div></div><form onSubmit={saveProfile} className="profile-form"><div className="avatar-edit"><img src={profile.avatar || "https://placehold.co/128x128/e8efe1/315542?text=You"} alt="Profile" /><label>Profile photo<input type="file" accept="image/*" onChange={e => selectAvatar(e.target.files?.[0])} /></label></div><div className="form-fields"><div className="field-row"><label>Name<input required value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} /></label><label>Major<input value={profile.major} onChange={e => setProfile({ ...profile, major: e.target.value })} placeholder="e.g. Computer Science" /></label></div><div className="field-row"><label>Graduation year<input type="number" min="2024" max="2040" value={profile.year} onChange={e => setProfile({ ...profile, year: e.target.value })} /></label><label>Experience<select value={profile.experience} onChange={e => setProfile({ ...profile, experience: e.target.value as typeof profile.experience })}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label></div><label>Bio<textarea maxLength={500} value={profile.bio} onChange={e => setProfile({ ...profile, bio: e.target.value })} placeholder="Coursework, clubs, or relevant experience." /></label><label>Skills (comma-separated)<input value={profile.skills} onChange={e => setProfile({ ...profile, skills: e.target.value })} placeholder="Calculus, design, photography" /></label><label>Interests (comma-separated)<input value={profile.interests} onChange={e => setProfile({ ...profile, interests: e.target.value })} placeholder="Sustainability, music, hiking" /></label><button className="primary" type="submit">Save profile</button></div></form></section>}
    {tab === "confirmation" && confirmation && <section className="confirmation"><span>✓</span><p className="eyebrow">BOUNTY PUBLISHED</p><h2>{confirmation.title}</h2><strong>✦ {confirmation.reward} recommended credits</strong><p>Your bounty is live for verified UCLA students. Review offers by skills and experience, then accept one to hold the internal credits for the accepted task.</p><div><button className="primary" onClick={() => setTab("tasks")}>View my tasks</button><button className="text-button" onClick={() => setTab("browse")}>Browse marketplace →</button></div></section>}
    {loginOpen && <div className="modal-backdrop"><form className="modal signup" onSubmit={sendLink}><button className="close" type="button" onClick={() => setLoginOpen(false)}>×</button><p className="eyebrow">UCLA STUDENT ACCESS</p><h2>Create your Bounty profile</h2><p>We use your UCLA email to keep the marketplace student-only.</p><label>UCLA email<input type="email" required value={auth.email} onChange={e => setAuth({ ...auth, email: e.target.value })} placeholder="name@ucla.edu" /></label><div className="field-row"><label>Name<input required value={auth.name} onChange={e => setAuth({ ...auth, name: e.target.value })} /></label><label>Major<input required value={auth.major} onChange={e => setAuth({ ...auth, major: e.target.value })} /></label></div><label>Graduation year<input type="number" min="2024" max="2040" required value={auth.year} onChange={e => setAuth({ ...auth, year: e.target.value })} /></label><button className="primary submit" type="submit">Send secure sign-in link</button>{loginMessage && <small>{loginMessage}</small>}</form></div>}
    {bid && <div className="modal-backdrop"><form className="modal" onSubmit={sendBid}><button className="close" type="button" onClick={() => setBid(null)}>×</button><p className="eyebrow">OFFER HELP</p><h2>{bid.title}</h2><p>Explain the skills and experience you bring. Do not share passwords, payment details, or sensitive information.</p><label>Your message<textarea name="message" required minLength={10} placeholder="I have experience with… and I’m available…" /></label><button className="primary submit" type="submit">Send offer</button></form></div>}
    <footer className="site-footer"><span className="wordmark">bounty<span>✦</span></span><span>Independent UCLA student community · Internal credits only · Not affiliated with or endorsed by UCLA</span></footer>
  </main>;
}

const split = (text: string) => text.split(",").map(value => value.trim()).filter(Boolean);
const label = (tab: string) => ({
  home: "Home",
  browse: "Browse",
  post: "Post",
  tasks: "My tasks",
  profile: "Profile",
  help: "Help",
}[tab] ?? tab);