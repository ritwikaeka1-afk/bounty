"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const samples = [
 { category: "Academic", title: "Review my sociology paper outline", credits: 5, meta: "Remote · 45 min" },
 { category: "Career", title: "Practice behavioral interview questions", credits: 4, meta: "Remote · 30 min" },
 { category: "Creative", title: "Clean up a club event flyer", credits: 3, meta: "Remote · 40 min" },
 { category: "Errands", title: "Pick up a library hold before 5", credits: 2, meta: "In person · 20 min" },
 { category: "Tech", title: "Fix a personal website layout bug", credits: 6, meta: "Remote · 60 min" },
];

export function LandingEnhancements() {
 const [home, setHome] = useState<HTMLElement | null>(null);
 const [footer, setFooter] = useState<HTMLElement | null>(null);
 useEffect(() => {
  const findTargets = () => {
   const view = new URLSearchParams(window.location.search).get("view");
   setHome(["browse", "post", "tasks", "profile", "help", "credits", "inbox", "detail"].includes(view || "") ? null : document.querySelector<HTMLElement>(".home-section"));
   setFooter(document.querySelector<HTMLElement>(".site-footer"));
  };
  findTargets();
  const observer = new MutationObserver(findTargets);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("popstate", findTargets);
  return () => { observer.disconnect(); window.removeEventListener("popstate", findTargets); };
 }, []);

 return <>{home && createPortal(<section className="landing-extras" aria-label="Explore Bounty">
  <form className="landing-search" action="/" method="get"><input type="hidden" name="view" value="browse" /><label><span>Task keyword</span><input name="q" type="search" placeholder="Essay edit, resume review, moving help" /></label><label><span>Category</span><select name="category" defaultValue="All"><option value="All">All categories</option><option>Academic</option><option>Career</option><option>Creative</option><option>Errands</option><option>Tech</option><option>Physical</option><option>Events</option></select></label><button className="primary">Search bounties</button></form>
  <div className="trust-bar" aria-label="Bounty trust principles"><span><strong>Internal credits</strong> only</span><span><strong>Private details</strong> after acceptance</span><span><strong>Reviews</strong> after completion</span></div>
  <div className="sample-heading"><div><p className="eyebrow">SAMPLE DATA</p><h2>What an open bounty looks like.</h2></div><p>These examples show the format. They are not live listings.</p></div>
  <div className="sample-grid">{samples.map(sample => <article className={`sample-card sample-${sample.category.toLowerCase()}`} key={sample.category}><div><span className="category">{sample.category}</span><strong>{sample.credits} credits</strong></div><h3>{sample.title}</h3><p>{sample.meta}</p><small>Sample listing</small></article>)}</div>
 </section>, home)}{footer && createPortal(<nav className="footer-extras" aria-label="More Bounty links"><a href="/">About</a><a href="/?view=help">FAQ</a><a href="/?view=help#terms">Terms of Service</a><a href="/?view=help#guidelines">Community Guidelines</a><a href="/?view=help">Contact</a></nav>, footer)}</>;
}

