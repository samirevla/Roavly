"use client";
/* eslint-disable @next/next/no-img-element */

import {
  BadgeDollarSign,
  Check,
  Download,
  Film,
  Flag,
  Gem,
  MapPin,
  Mountain,
  Package,
  Play,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Trophy,
  Upload,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { JourneyMapPost } from "./explore-map";

type Tip = {
  id: string;
  trailId: string;
  title: string;
  description: string;
  durationSeconds: number;
  priceCents: number;
  mediaType: "video" | "photo";
  previewUrl: string;
  rating: number | null;
  reviewCount: number;
  purchased: boolean;
  creator: { displayName: string; username: string; hikeCount: number };
};

type Trail = {
  id: string;
  name: string;
  location: string;
  difficulty: string;
  distanceKm: number;
};

type Overview = {
  entitlements: { tier: "free" | "plus"; features: Record<string, boolean>; subscription: { plan: string; currentPeriodEnd: string } | null };
  credits: { total: number; used: number; remaining: number; periodEnd: string } | null;
  creator: { isVerifiedSeller: boolean; verificationCriteriaMet: Record<string, number | boolean>; balance?: { pendingCents: number; lifetimeCents: number } | null } | null;
  creatorTips: Array<{ id: string; title: string; status: string; rejectionReason: string; riskFlags: string }>;
  pricing: { defaultPriceCents: number; maxPriceCents: number; platformFeePercent: number; bundleSize: number; bundlePriceCents: number; currency: string; freeSavedTripsLimit: number; plusCreditsPerPeriod: number };
  billingReady: boolean;
  isAdmin: boolean;
};

type Purchase = {
  id: string;
  purchaseSource: string;
  purchasedAt: string;
  review: { rating: number; comment: string } | null;
  tip: { id: string; title: string; description: string; durationSeconds: number; mediaType: string; mediaUrl: string; trail: Trail | null; creator: { displayName: string; username: string } };
};

type SponsoredChallenge = { id: string; title: string; description: string; sponsorName: string; sponsorLogoUrl: string; metric: string; target: number; progress: number; complete: boolean; joined: boolean; prizeDescription: string; endDate: string };
type PartnerPlacement = { id: string; disclosure: string; headline: string; business: { name: string; category: string; websiteUrl: string; logoUrl: string } };
type AdminData = { pendingTips: Array<{ id: string; title: string; description: string; riskFlags: string }>; partners: Array<{ id: string; name: string }>; placements: unknown[]; challenges: unknown[]; ads: unknown[]; reports: unknown[] };

const emptyOverview: Overview = {
  entitlements: { tier: "free", features: {}, subscription: null }, credits: null, creator: null, creatorTips: [], isAdmin: false, billingReady: false,
  pricing: { defaultPriceCents: 99, maxPriceCents: 499, platformFeePercent: 30, bundleSize: 5, bundlePriceCents: 399, currency: "usd", freeSavedTripsLimit: 10, plusCreditsPerPeriod: 3 },
};

export function MonetizationView({ posts, showToast }: { posts: JourneyMapPost[]; showToast: (message: string) => void }) {
  const [section, setSection] = useState<"discover" | "library" | "create" | "plus">("discover");
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [trails, setTrails] = useState<Trail[]>([]);
  const [selectedTrailId, setSelectedTrailId] = useState("");
  const [tips, setTips] = useState<Tip[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [challenges, setChallenges] = useState<SponsoredChallenge[]>([]);
  const [placements, setPlacements] = useState<PartnerPlacement[]>([]);
  const [selectedTips, setSelectedTips] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [eligibility, setEligibility] = useState<{ isVerifiedSeller: boolean; canSubmitForTrail: boolean; criteria: Record<string, number | boolean> } | null>(null);
  const [admin, setAdmin] = useState<AdminData | null>(null);

  const ownPosts = useMemo(() => posts.filter((post) => post.isOwner), [posts]);

  async function loadAll() {
    setLoading(true);
    try {
      const [overviewResponse, trailsResponse, libraryResponse, challengeResponse, partnerResponse] = await Promise.all([
        fetch("/api/monetization"), fetch("/api/trails"), fetch("/api/users/me/purchased-tips"), fetch("/api/sponsored-challenges"), fetch("/api/partners"),
      ]);
      const [overviewPayload, trailsPayload, libraryPayload, challengePayload, partnerPayload] = await Promise.all([
        overviewResponse.json(), trailsResponse.json(), libraryResponse.json(), challengeResponse.json(), partnerResponse.json(),
      ]) as [Overview & { error?: string }, { trails?: Trail[]; error?: string }, { purchases?: Purchase[] }, { challenges?: SponsoredChallenge[] }, { placements?: PartnerPlacement[] }];
      if (!overviewResponse.ok) throw new Error(overviewPayload.error || "Waymark rewards could not load.");
      setOverview(overviewPayload);
      setTrails(trailsPayload.trails || []);
      setPurchases(libraryPayload.purchases || []);
      setChallenges(challengePayload.challenges || []);
      setPlacements(partnerPayload.placements || []);
      const firstTrail = selectedTrailId || trailsPayload.trails?.[0]?.id || "";
      setSelectedTrailId(firstTrail);
      if (overviewPayload.isAdmin) {
        const response = await fetch("/api/admin/monetization");
        if (response.ok) setAdmin(await response.json() as AdminData);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Waymark rewards could not load.");
    } finally { setLoading(false); }
  }

  // Initial network hydration only; later mutations call loadAll explicitly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void Promise.resolve().then(() => loadAll()); }, []);

  useEffect(() => {
    if (!selectedTrailId) return;
    let active = true;
    Promise.all([
      fetch(`/api/trails/${encodeURIComponent(selectedTrailId)}/tips`).then((response) => response.json()),
      fetch(`/api/creator-status?trailId=${encodeURIComponent(selectedTrailId)}`).then((response) => response.json()),
    ]).then(([tipPayload, statusPayload]) => {
      if (!active) return;
      setTips(tipPayload.tips || []);
      setEligibility(statusPayload);
    }).catch(() => showToast("That trail’s briefing shelf could not load."));
    return () => { active = false; };
  }, [selectedTrailId, showToast]);

  async function jsonAction(url: string, body: object, success: string) {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json() as { error?: string; checkoutUrl?: string; onboardingUrl?: string };
    if (!response.ok) { showToast(payload.error || "That action could not be completed."); return false; }
    if (payload.checkoutUrl || payload.onboardingUrl) { window.location.href = payload.checkoutUrl || payload.onboardingUrl || "/"; return true; }
    showToast(success); await loadAll(); return true;
  }

  async function createTrail(postId: string) {
    const response = await fetch("/api/trails", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ postId }) });
    const payload = await response.json() as { trail?: Trail; error?: string };
    if (!response.ok || !payload.trail) return showToast(payload.error || "That trail could not be added.");
    showToast("Trail added to the briefing marketplace.");
    await loadAll(); setSelectedTrailId(payload.trail.id);
  }

  async function buyTips(useCredit = false) {
    const ids = selectedTips.length ? selectedTips : tips.filter((tip) => !tip.purchased).slice(0, 1).map((tip) => tip.id);
    if (!ids.length) return showToast("Choose a briefing to unlock.");
    await jsonAction(`/api/tips/${ids[0]}/purchase`, { tipIds: ids.slice(1), useCredit }, useCredit ? "Credit used. The briefing is in your library." : "Checkout ready.");
    setSelectedTips([]);
  }

  return (
    <div className="revenue-hub">
      <header className="revenue-hero">
        <div><span className="eyebrow">TRAIL KNOWLEDGE, REWARDED</span><h2>Briefings from people who’ve been there.</h2><p>Preview real trail advice, unlock it once, and keep it in your library for every future trip.</p></div>
        <span className="plus-status"><Gem size={18} /> {overview.entitlements.tier === "plus" ? "Waymark+ active" : "Free explorer"}</span>
      </header>
      <nav className="revenue-tabs" aria-label="Trail tips and Waymark rewards">
        {(["discover", "library", "create", "plus"] as const).map((item) => <button key={item} className={section === item ? "active" : ""} onClick={() => setSection(item)}>{item === "discover" ? "Trail tips" : item === "library" ? `My library${purchases.length ? ` (${purchases.length})` : ""}` : item === "create" ? "Create & earn" : "Waymark+"}</button>)}
      </nav>

      {loading ? <div className="revenue-loading"><i /><i /><i /></div> : null}
      {!loading && section === "discover" && <>
        <div className="trail-picker"><label><span>Choose a trail</span><select value={selectedTrailId} onChange={(event) => { const value = event.target.value; setSelectedTrailId(value); setSelectedTips([]); if (!value) { setTips([]); setEligibility(null); } }}><option value="">Select a trail</option>{trails.map((trail) => <option key={trail.id} value={trail.id}>{trail.name} · {trail.location}</option>)}</select></label><div><strong>{tips.length} briefings</strong><small>Reviewed before they go live</small>{selectedTrailId && overview.entitlements.features.offline_maps ? <a href={`/api/trails/${selectedTrailId}/offline`}><Download size={13} /> Download offline pack</a> : null}</div></div>
        {!trails.length ? <RevenueEmpty icon={MapPin} title="No trail shelves yet" copy="Turn one of your completed, map-verified journeys into Waymark’s first trail listing." action={ownPosts.length ? "Use my latest journey" : undefined} onAction={ownPosts.length ? () => createTrail(ownPosts[0].id) : undefined} /> : !tips.length ? <RevenueEmpty icon={Film} title="No live briefings for this trail" copy="Verified creators can submit the first 2–5 minute safety-reviewed briefing." action="Create the first briefing" onAction={() => setSection("create")} /> : <div className="tip-list">{tips.map((tip) => <TipCard key={tip.id} tip={tip} currency={overview.pricing.currency} selected={selectedTips.includes(tip.id)} toggle={() => setSelectedTips((current) => current.includes(tip.id) ? current.filter((id) => id !== tip.id) : [...current, tip.id])} />)}</div>}
        {selectedTips.length > 0 && <div className="tip-cart"><span><ShoppingBag size={18} /><strong>{selectedTips.length} selected</strong><small>{selectedTips.length === overview.pricing.bundleSize ? `${formatMoney(overview.pricing.bundlePriceCents, overview.pricing.currency)} bundle` : "Checkout together"}</small></span>{overview.credits?.remaining ? <button className="secondary" disabled={selectedTips.length !== 1} onClick={() => buyTips(true)}>Use 1 credit</button> : null}<button onClick={() => buyTips(false)}>Unlock selected</button></div>}
        <SponsoredChallenges challenges={challenges} join={(id) => jsonAction("/api/sponsored-challenges", { challengeId: id }, "Challenge joined. Your existing journeys now count automatically.")} />
        {placements.length > 0 && <section className="partner-strip"><header><span>NEARBY PARTNERS</span><small>Paid placements are always labelled</small></header>{placements.map((placement) => <a key={placement.id} href={placement.business.websiteUrl} target="_blank" rel="noreferrer sponsored"><i>{placement.disclosure}</i><strong>{placement.business.name}</strong><span>{placement.headline}</span><small>{placement.business.category}</small></a>)}</section>}
      </>}

      {!loading && section === "library" && <div className="purchase-library">{purchases.length ? purchases.map((purchase) => <PurchaseCard key={purchase.id} purchase={purchase} showToast={showToast} refresh={loadAll} />) : <RevenueEmpty icon={Play} title="Your permanent briefing library is empty" copy="Anything you buy—or unlock with a Waymark+ credit—will stay here permanently." action="Browse trail tips" onAction={() => setSection("discover")} />}</div>}

      {!loading && section === "create" && <CreatorStudio trails={trails} ownPosts={ownPosts} selectedTrailId={selectedTrailId} setSelectedTrailId={setSelectedTrailId} eligibility={eligibility} overview={overview} createTrail={createTrail} showToast={showToast} refresh={loadAll} />}

      {!loading && section === "plus" && <PlusPanel overview={overview} action={(body) => jsonAction("/api/billing/checkout", body, "Opening secure checkout.")} />}

      {overview.isAdmin && admin ? <AdminRevenuePanel data={admin} showToast={showToast} refresh={loadAll} /> : null}
    </div>
  );
}

function TipCard({ tip, currency, selected, toggle }: { tip: Tip; currency: string; selected: boolean; toggle: () => void }) {
  const isVideo = tip.previewUrl && tip.mediaType === "video";
  return <article className={`tip-card ${selected ? "selected" : ""}`}>
    <div className="tip-preview">{isVideo ? <video src={tip.previewUrl} controls preload="metadata" playsInline /> : <img src={tip.previewUrl} alt="Trail briefing preview" />}<span>{Math.floor(tip.durationSeconds / 60)}:{String(tip.durationSeconds % 60).padStart(2, "0")}</span></div>
    <div className="tip-copy"><small><Mountain size={13} /> {tip.creator.hikeCount} journeys</small><h3>{tip.title}</h3><p>{tip.description}</p><div><span className="tip-avatar">{tip.creator.displayName.slice(0, 1)}</span><span><strong>{tip.creator.displayName}</strong><small>@{tip.creator.username}</small></span>{tip.rating ? <em><Star size={14} fill="currentColor" /> {tip.rating} ({tip.reviewCount})</em> : <em>New briefing</em>}</div></div>
    <div className="tip-buy"><strong>{formatMoney(tip.priceCents, currency)}</strong>{tip.purchased ? <span><Check size={16} /> Owned</span> : <button onClick={toggle}>{selected ? "Selected" : "Add"}</button>}</div>
  </article>;
}

function PurchaseCard({ purchase, showToast, refresh }: { purchase: Purchase; showToast: (message: string) => void; refresh: () => Promise<void> }) {
  const [rating, setRating] = useState(purchase.review?.rating || 5);
  const [comment, setComment] = useState(purchase.review?.comment || "");
  async function review(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(`/api/tips/${purchase.tip.id}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating, comment }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return showToast(payload.error || "Review could not be saved.");
    showToast("Thanks—your review helps the next explorer."); await refresh();
  }
  return <article className="purchase-card"><header><span><ShieldCheck size={17} /> PERMANENT ACCESS</span><small>{purchase.tip.trail?.name || "Trail briefing"}</small></header><h3>{purchase.tip.title}</h3><p>{purchase.tip.description}</p>{purchase.tip.mediaType === "video" ? <video src={purchase.tip.mediaUrl} controls playsInline preload="metadata" /> : <img src={purchase.tip.mediaUrl} alt={purchase.tip.title} />}<form onSubmit={review}><div>{[1, 2, 3, 4, 5].map((star) => <button type="button" key={star} onClick={() => setRating(star)} aria-label={`${star} stars`}><Star size={19} fill={star <= rating ? "currentColor" : "none"} /></button>)}</div><input maxLength={500} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="What should future hikers know?" /><button type="submit">{purchase.review ? "Update review" : "Leave review"}</button></form><button className="report-tip" onClick={async () => { const reason = window.prompt("What seems wrong or unsafe in this briefing?"); if (!reason) return; const response = await fetch(`/api/tips/${purchase.tip.id}/report`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) }); showToast(response.ok ? "Reported to Waymark’s safety team." : "The report could not be sent."); }}><Flag size={14} /> Report unsafe information</button></article>;
}

function CreatorStudio({ trails, ownPosts, selectedTrailId, setSelectedTrailId, eligibility, overview, createTrail, showToast, refresh }: { trails: Trail[]; ownPosts: JourneyMapPost[]; selectedTrailId: string; setSelectedTrailId: (id: string) => void; eligibility: { isVerifiedSeller: boolean; canSubmitForTrail: boolean; criteria: Record<string, number | boolean> } | null; overview: Overview; createTrail: (id: string) => void; showToast: (message: string) => void; refresh: () => Promise<void> }) {
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedTrailId || submitting) return;
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/trails/${selectedTrailId}/tips`, { method: "POST", body: form });
    const payload = await response.json() as { error?: string; message?: string };
    setSubmitting(false);
    if (!response.ok) return showToast(payload.error || "Briefing could not be submitted.");
    showToast(payload.message || "Briefing submitted for review."); event.currentTarget.reset(); await refresh();
  }
  return <div className="creator-studio"><section className="seller-gate"><span><ShieldCheck size={22} /></span><div><small>VERIFIED SELLER</small><h3>{eligibility?.isVerifiedSeller ? "Your creator access is active" : "Trust comes before selling"}</h3><p>Creators must post a map-verified completion and reach the configured friend or community-motivation threshold. Every briefing is reviewed.</p></div><i>{eligibility?.isVerifiedSeller ? "Verified" : "Not yet eligible"}</i></section>
    <div className="creator-grid"><section><h3>1. Choose a completed trail</h3><select value={selectedTrailId} onChange={(event) => setSelectedTrailId(event.target.value)}><option value="">Select trail</option>{trails.map((trail) => <option value={trail.id} key={trail.id}>{trail.name}</option>)}</select>{ownPosts.length ? <details><summary><Plus size={15} /> Add a trail from one of my journeys</summary>{ownPosts.slice(0, 10).map((post) => <button key={post.id} onClick={() => createTrail(post.id)}><MapPin size={14} /><span>{post.location}<small>{post.caption}</small></span></button>)}</details> : <p>Share a map-verified journey first.</p>}</section><section><h3>Creator earnings</h3><strong className="creator-balance">{formatMoney(overview.creator?.balance?.pendingCents || 0, overview.pricing.currency)}</strong><small>Available balance · 70% default creator share</small><button onClick={async () => { const response = await fetch("/api/creator-payouts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "onboard" }) }); const payload = await response.json() as { onboardingUrl?: string; error?: string }; if (payload.onboardingUrl) window.location.href = payload.onboardingUrl; else showToast(payload.error || "Payout setup could not start."); }}>Set up Stripe payouts</button></section></div>
    <form className="tip-upload-form" onSubmit={submit}><header><Upload size={21} /><div><small>2. CREATE THE BRIEFING</small><h3>Useful, specific and safety-aware</h3></div></header><label><span>Title</span><input name="title" required maxLength={90} placeholder="Creek crossing after heavy rain" /></label><label><span>Description</span><textarea name="description" required minLength={20} maxLength={800} placeholder="Explain the exact section, conditions and safe alternative—without encouraging shortcuts." /></label><div><label><span>Full video or photo narration</span><input name="media" type="file" required accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp,image/heic,image/heif" /></label><label><span>15-second preview or still</span><input name="preview" type="file" accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp" /></label></div><div><label><span>Duration (seconds)</span><input name="durationSeconds" type="number" min={120} max={300} defaultValue={120} /></label><label><span>Price (cents)</span><input name="priceCents" type="number" min={0} max={overview.pricing.maxPriceCents} defaultValue={overview.pricing.defaultPriceCents} /></label></div><button disabled={!eligibility?.canSubmitForTrail || submitting}>{submitting ? "Uploading…" : eligibility?.canSubmitForTrail ? "Submit for review" : "Complete verification requirements first"}</button></form>
    {overview.creatorTips.length > 0 && <section className="creator-submissions"><h3>My submissions</h3>{overview.creatorTips.map((tip) => <div key={tip.id}><span><strong>{tip.title}</strong><small>{tip.rejectionReason || "Safety review status"}</small></span><i>{tip.status.replace("_", " ")}</i></div>)}</section>}
    <GearTagger posts={ownPosts} showToast={showToast} />
  </div>;
}

function GearTagger({ posts, showToast }: { posts: JourneyMapPost[]; showToast: (message: string) => void }) {
  const [catalog, setCatalog] = useState<Array<{ id: string; brand: string; productName: string }>>([]);
  const [postId, setPostId] = useState(posts[0]?.id || ""); const [catalogId, setCatalogId] = useState("");
  useEffect(() => { fetch("/api/gear-tags").then((response) => response.json()).then((payload) => setCatalog(payload.catalog || [])).catch(() => undefined); }, []);
  return <section className="gear-tagger"><header><Package size={20} /><div><small>AFFILIATE GEAR</small><h3>Tag gear you genuinely used</h3></div></header><p>Waymark tracks outbound clicks through a disclosed affiliate redirect. The launch catalog is intentionally curated.</p><div><select value={postId} onChange={(event) => setPostId(event.target.value)}><option value="">Choose your post</option>{posts.map((post) => <option key={post.id} value={post.id}>{post.caption}</option>)}</select><select value={catalogId} onChange={(event) => setCatalogId(event.target.value)}><option value="">Choose product</option>{catalog.map((product) => <option key={product.id} value={product.id}>{product.brand} · {product.productName}</option>)}</select><button onClick={async () => { const response = await fetch("/api/gear-tags", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetType: "post", targetId: postId, catalogId }) }); const payload = await response.json() as { error?: string }; showToast(response.ok ? "Gear tag added to your post." : payload.error || "Gear tag could not be added."); }}>Add gear tag</button></div></section>;
}

function PlusPanel({ overview, action }: { overview: Overview; action: (body: object) => Promise<boolean> }) {
  const benefits = [[Download, "Offline trail packs", "Keep trail facts and community notes available when signal disappears."], [ShoppingBag, `${overview.pricing.plusCreditsPerPeriod} trail-tip credits monthly`, "Creators still receive a fixed payout when you redeem a credit."], [BadgeDollarSign, "No browsing ads", "Paid briefings, checkout and onboarding are always ad-free for everyone."], [Sparkles, "Advanced planning + badge", "Unlimited saves, richer route tools and an Explorer+ profile mark."]] as const;
  return <section className="plus-panel"><div className="plus-card"><span><Gem size={25} /></span><small>WAYMARK+</small><h2>{overview.entitlements.tier === "plus" ? "More trail time, already unlocked." : "Plan deeper. Carry less uncertainty."}</h2><p>The social feed, posting, friends and journeys stay free. Waymark+ funds creator credits and premium planning tools.</p>{overview.entitlements.tier === "plus" ? <strong>Active · {overview.credits?.remaining || 0} credits remaining</strong> : <div><button disabled={!overview.billingReady} onClick={() => action({ plan: "monthly" })}>Choose monthly</button><button disabled={!overview.billingReady} className="secondary" onClick={() => action({ plan: "annual" })}>Choose annual</button></div>}{!overview.billingReady && <em>Stripe product prices must be connected before checkout can open.</em>}</div><div className="plus-benefits">{benefits.map(([Icon, title, copy]) => <article key={title}><Icon size={20} /><div><strong>{title}</strong><p>{copy}</p></div></article>)}</div></section>;
}

function SponsoredChallenges({ challenges, join }: { challenges: SponsoredChallenge[]; join: (id: string) => Promise<boolean> }) {
  if (!challenges.length) return null;
  return <section className="sponsored-challenges"><header><div><span>COMMUNITY CHALLENGES</span><h3>Move together, without a leaderboard.</h3></div></header><div>{challenges.map((challenge) => { const percent = Math.min(100, Math.round(challenge.progress / challenge.target * 100)); return <article key={challenge.id}><i>Sponsored by {challenge.sponsorName}</i><Trophy size={23} /><h3>{challenge.title}</h3><p>{challenge.description}</p><div><span style={{ width: `${percent}%` }} /></div><strong>{challenge.progress} / {challenge.target} {challenge.metric.replace("_", " ")}</strong>{challenge.prizeDescription && <small>{challenge.prizeDescription}</small>}<button disabled={challenge.joined} onClick={() => join(challenge.id)}>{challenge.joined ? challenge.complete ? "Completed" : "Joined" : "Join challenge"}</button></article>; })}</div></section>;
}

function AdminRevenuePanel({ data, showToast, refresh }: { data: AdminData; showToast: (message: string) => void; refresh: () => Promise<void> }) {
  const [form, setForm] = useState<Record<string, string>>({});
  async function submit(action: string, extra: Record<string, unknown> = {}) { const response = await fetch("/api/admin/monetization", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...form, ...extra }) }); const payload = await response.json() as { error?: string }; showToast(response.ok ? "Revenue admin change saved." : payload.error || "Admin change failed."); if (response.ok) { setForm({}); await refresh(); } }
  const field = (name: string, placeholder: string, type = "text") => <input type={type} value={form[name] || ""} onChange={(event) => setForm({ ...form, [name]: event.target.value })} placeholder={placeholder} />;
  return <details className="revenue-admin"><summary><ShieldCheck size={18} /> Revenue & safety admin <small>{data.pendingTips.length} briefings pending</small></summary><section><h3>Seller verification</h3><div className="admin-form">{field("userEmail", "Creator account email", "email")}<button onClick={() => submit("verify_creator")}>Verify seller manually</button></div></section><section><h3>Briefing moderation</h3>{data.pendingTips.length ? data.pendingTips.map((tip) => <div key={tip.id}><span><strong>{tip.title}</strong><small>{tip.description}</small><em>Flags: {tip.riskFlags}</em></span><button onClick={() => fetch(`/api/admin/tips/${tip.id}/moderate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "approve", notes: "Reviewed against Waymark safety guidance." }) }).then(() => refresh())}>Approve</button><button className="secondary" onClick={() => { const notes = window.prompt("Rejection reason"); if (notes) fetch(`/api/admin/tips/${tip.id}/moderate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reject", notes }) }).then(() => refresh()); }}>Reject</button></div>) : <p>No briefings waiting.</p>}</section><section><h3>Local partner</h3><div className="admin-form">{field("name", "Business name")}{field("category", "Category")}{field("websiteUrl", "https://business.example")}{field("logoUrl", "Logo URL (optional)")}<button onClick={() => submit("create_partner", { billingStatus: "active" })}>Create active partner</button></div></section><section><h3>Partner placement</h3><div className="admin-form"><select value={form.businessId || ""} onChange={(event) => setForm({ ...form, businessId: event.target.value })}><option value="">Partner</option>{data.partners.map((partner) => <option value={partner.id} key={partner.id}>{partner.name}</option>)}</select>{field("headline", "Placement headline")}{field("startDate", "Start", "datetime-local")}{field("endDate", "End", "datetime-local")}<button onClick={() => submit("create_placement")}>Schedule placement</button></div></section><section><h3>Sponsored challenge</h3><div className="admin-form">{field("title", "Challenge title")}{field("description", "Description")}{field("sponsorName", "Sponsor")}{field("target", "Target", "number")}{field("startDate", "Start", "datetime-local")}{field("endDate", "End", "datetime-local")}<button onClick={() => submit("create_challenge", { metric: "minutes", rules: "Progress uses qualifying Waymark journey posts.", status: "live" })}>Publish challenge</button></div></section><section><h3>Native ad campaign</h3><div className="admin-form">{field("advertiserName", "Advertiser")}{field("headline", "Headline")}{field("destinationUrl", "Destination URL")}{field("startDate", "Start", "datetime-local")}{field("endDate", "End", "datetime-local")}<button onClick={() => submit("create_ad", { status: "live" })}>Publish disclosed ad</button></div></section></details>;
}

function RevenueEmpty({ icon: Icon, title, copy, action, onAction }: { icon: typeof MapPin; title: string; copy: string; action?: string; onAction?: () => void }) { return <div className="revenue-empty"><span><Icon size={28} /></span><h3>{title}</h3><p>{copy}</p>{action && onAction ? <button onClick={onAction}>{action}</button> : null}</div>; }
function formatMoney(cents: number, currency: string) { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(cents / 100); }
