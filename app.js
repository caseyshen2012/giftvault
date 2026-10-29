import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase-config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: true, detectSessionInUrl: true, persistSession: true },
});

const icons = {
  box: '<path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4.5 7.7 7.5 4.2 7.5-4.2M12 12v9"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 8v6M23 11h-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  gift: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8H8.5a2.5 2.5 0 1 1 2.5-2.5V8Zm0 0h3.5A2.5 2.5 0 1 0 13 5.5V8Z"/>',
  chart: '<path d="M3 3v18h18M8 15l4-4 4 3 5-7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-7-7 7 7-7 7"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  close: '<path d="m18 6-12 12M6 6l12 12"/>',
  edit: '<path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15l-.8 5Z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/>',
  external: '<path d="M14 3h7v7m-1-6-9 9"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  sparkle: '<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"/>',
  logout: '<path d="M10 17l5-5-5-5m5 5H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
};

const icon = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.sparkle}</svg>`;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));
const safeUrl = (value) => {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
};

let session = null;
let wishlist = null;
let items = [];
let contacts = [];
let publicList = null;
let shareToken = null;
let authLoading = true;
let loadError = "";
let page = "discover";
let searchQuery = "";
let searchScope = "all";
let accountTab = "wishlist";
let authMode = "login";
const reservedInView = new Set();

const currentUser = () => session?.user || null;
const displayName = () => currentUser()?.user_metadata?.full_name || currentUser()?.email || "Your account";
const publicUrl = () => shareToken ? `${window.location.origin}/list/${shareToken}` : "";
const routeShareToken = () => {
  const match = window.location.pathname.match(/^\/list\/([0-9a-f-]{36})\/?$/i);
  return match?.[1] || null;
};

function toast(message) {
  const region = document.getElementById("toast-region");
  const element = document.createElement("div");
  element.className = "toast";
  element.textContent = message;
  region.append(element);
  window.setTimeout(() => element.remove(), 3400);
}

function avatar(label, size = "") {
  const initials = String(label || "GV").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return `<span class="avatar ${size}" aria-hidden="true">${escapeHtml(initials || "GV")}</span>`;
}

function navLink(key, label, iconName, count = "") {
  return `<button class="nav-link ${page === key ? "active" : ""}" data-action="navigate" data-page="${key}">${icon(iconName)}<span>${label}</span>${count ? `<span class="nav-count">${count}</span>` : ""}</button>`;
}

function navMarkup(mobile = false) {
  if (publicList) {
    return mobile ? "" : `<aside class="sidebar"><p class="nav-label">Shared view</p><div class="nav-list"><div class="nav-link active">${icon("gift")}<span>Wishlist</span></div></div><div class="sidebar-spacer"></div><div class="sidebar-card"><span class="sidebar-card-icon">${icon("lock", 15)}</span><strong>Reservations stay private.</strong><p>The list owner can't read reservation details or see which items are reserved.</p></div><button class="button primary" data-action="sign-in">Create your own vault ${icon("arrow", 13)}</button></aside>`;
  }
  const links = [
    navLink("discover", "Discover", "home"),
    navLink("friends", "Friends", "users", contacts.length),
    navLink("search", "Search", "search"),
    navLink("wishlist", publicList ? "Shared list" : "My wishlist", "gift"),
    ...(!publicList ? [navLink("analytics", "Insights", "chart")] : []),
  ].join("");
  return mobile
    ? `<nav class="mobile-nav" aria-label="Mobile navigation">${links}</nav>`
    : `<aside class="sidebar"><p class="nav-label">Workspace</p><nav class="nav-list" aria-label="Main navigation">${links}</nav><div class="sidebar-spacer"></div><div class="sidebar-card"><span class="sidebar-card-icon">${icon("sparkle", 15)}</span><strong>Good things, saved.</strong><p>Keep the things you love close. Share your list when the moment is right.</p></div><p class="sidebar-footer">GiftVault / Supabase</p></aside>`;
}

function headerMarkup() {
  const label = currentUser() ? displayName() : "Guest preview";
  return `<header class="topbar"><a class="brand" href="/" data-action="navigate" data-page="discover"><span class="brand-mark">${icon("box", 20)}</span><span class="brand-name">giftvault<span class="brand-period">.</span></span></a><label class="top-search">${icon("search", 17)}<input id="global-search" type="search" placeholder="Search your gifts" value="${escapeHtml(searchQuery)}" aria-label="Search your gifts" /></label><div class="top-actions"><span class="top-context">${currentUser() ? "YOUR PRIVATE VAULT" : "SHARED WISHLIST"}</span><button class="top-action" data-action="account-menu" aria-label="${currentUser() ? "Account menu" : "Sign in"}">${avatar(label)}<span class="user-name">${escapeHtml(label)}<small class="user-role">${currentUser() ? "Signed in" : "No account needed to view"}</small></span>${icon("chevron", 15)}</button></div></header>`;
}

function wishlistCard() {
  const countClaimed = reservedInView.size;
  return `<article class="wishlist-card"><div class="wishlist-card-cover cover-sage"><span class="cover-index">GV / ${String(items.length).padStart(2, "0")}</span><span class="cover-count">${items.length} saved ideas</span></div><div class="wishlist-card-body"><div class="owner-row">${avatar(displayName(), "small")}<div class="owner-meta"><span class="owner-name">${escapeHtml(displayName())}</span><span class="owner-handle">PRIVATE COLLECTION</span></div></div><h3 class="list-name">My wishlist</h3><p class="list-detail">${countClaimed ? "A gift reserved in this session" : "Your personal collection"}</p><div class="card-footer"><span>YOUR LIST</span><button class="section-link" data-action="navigate" data-page="wishlist">View list ${icon("arrow", 12)}</button></div></div></article>`;
}

function birthdayRows(limit = 3) {
  const ordered = contacts.filter((contact) => contact.birthday)
    .sort((a, b) => daysUntil(a.birthday) - daysUntil(b.birthday)).slice(0, limit);
  if (!ordered.length) return '<div class="quiet-empty">Birthday reminders appear here when you add a friend.</div>';
  return ordered.map((person) => `<div class="birthday-row"><div class="birthday-date"><strong>${new Date(`${person.birthday}T12:00:00`).getDate()}</strong><span>${new Date(`${person.birthday}T12:00:00`).toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</span></div><div class="birthday-text"><strong>${escapeHtml(person.name)}</strong><span>${birthdayWhen(person.birthday)}</span></div>${icon("calendar", 15)}</div>`).join("");
}

function daysUntil(iso) {
  const birthday = new Date(`${iso}T12:00:00`);
  const now = new Date();
  birthday.setFullYear(now.getFullYear());
  if (birthday < new Date(now.getFullYear(), now.getMonth(), now.getDate())) birthday.setFullYear(now.getFullYear() + 1);
  return Math.ceil((birthday - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}

function birthdayWhen(iso) {
  const days = daysUntil(iso);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 8) return `In ${days} days`;
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function renderDiscover() {
  const upcoming = contacts.filter((contact) => contact.birthday && daysUntil(contact.birthday) < 31).length;
  return `<div class="page">
    <section class="hero"><div class="hero-copy"><p class="eyebrow">A better kind of wishlist</p><h1>Keep good things<br /><span>in good company.</span></h1><p>Save what you love. Share it when you're ready. Let everyone else pick the perfect moment.</p><div class="hero-actions"><button class="button primary" data-action="navigate" data-page="wishlist">Open my wishlist ${icon("arrow", 14)}</button><button class="text-action" data-action="navigate" data-page="search">Browse saved ideas</button></div></div><div class="hero-visual"><div class="glass-orbit orbit-one"></div><div class="glass-orbit orbit-two"></div><div class="clay-object"><span class="clay-object-mark">${icon("box", 44)}</span></div><span class="visual-caption">THOUGHTFULLY<br />COLLECTED</span></div><div class="hero-index">01 — 04</div></section>
    <section class="stats-row" aria-label="Your GiftVault at a glance"><div class="stat-card"><span class="stat-index">01</span><div><strong class="stat-value">${items.length}</strong><span class="stat-label">ideas saved</span></div></div><div class="stat-card"><span class="stat-index">02</span><div><strong class="stat-value">${contacts.length}</strong><span class="stat-label">friends added</span></div></div><div class="stat-card"><span class="stat-index">03</span><div><strong class="stat-value">${upcoming}</strong><span class="stat-label">birthdays soon</span></div></div></section>
    <div class="content-grid"><section><div class="section-head"><div><p class="eyebrow">The collection</p><h2>Your wishlist</h2></div><button class="section-link" data-action="navigate" data-page="wishlist">See your list ${icon("arrow", 12)}</button></div><div class="wishlist-grid">${wishlistCard()}</div><div class="section-head"><div><p class="eyebrow">Recently saved</p><h2>Good things, gathered</h2></div><button class="section-link" data-action="navigate" data-page="wishlist">Browse all ${icon("arrow", 12)}</button></div><div class="item-list">${items.slice(-3).reverse().map((item) => itemRow(item, { compact: true })).join("") || emptyState("Nothing saved yet", "Add a product link to start your collection.", "Add an idea", "add-item")}</div></section><aside><div class="birthdays-card"><div class="section-head"><div><p class="eyebrow">On the calendar</p><h2>Upcoming birthdays</h2></div><button class="section-link" data-action="navigate" data-page="friends">See all</button></div>${birthdayRows()}</div><div class="section-head"><div><p class="eyebrow">Share a little delight</p><h2>Your people</h2></div><button class="section-link" data-action="navigate" data-page="friends">Add a friend ${icon("arrow", 12)}</button></div><div class="friend-mini-row"><span class="friend-total">${String(contacts.length).padStart(2, "0")}</span><span class="page-subtitle">${contacts.length ? "friends in your circle" : "your circle starts here"}</span></div><div class="guest-card"><span class="guest-card-index">A GIFT VAULT NOTE</span><p>Gift reservations help everyone avoid the double-wrap.</p><button class="text-action" data-action="${currentUser() ? "share-list" : "sign-in"}">${currentUser() ? "Copy your share link" : "Sign in to create your list"} ${icon("arrow", 12)}</button></div></aside></div>
  </div>`;
}

function itemRow(item) {
  const externalUrl = safeUrl(item.url);
  const ownerView = !publicList;
  const reservedHere = reservedInView.has(item.id);
  return `<article class="item-row"><span class="item-art ${escapeHtml(item.color || "cover-sage")}" aria-hidden="true">${escapeHtml((item.category || "G").slice(0, 1).toUpperCase())}</span><div class="item-info"><h3>${escapeHtml(item.title)}</h3>${externalUrl ? `<a href="${escapeHtml(externalUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)} ${icon("external", 10)}</a>` : ""}<span class="item-note">${escapeHtml(item.note || item.category || "Wishlist idea")}</span></div><div class="item-actions">${ownerView ? `<button class="button secondary small" data-action="edit-item" data-item="${escapeHtml(item.id)}">${icon("edit", 12)} Edit</button><button class="button danger small" data-action="delete-item" data-item="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.title)}">${icon("trash", 12)}</button>` : reservedHere ? `<span class="badge claimed">Checked</span>` : `<button class="button secondary small" data-action="reserve" data-item="${escapeHtml(item.id)}">Reserve</button>`}</div></article>`;
}

function renderFriends() {
  const birthdays = contacts.filter((contact) => contact.birthday).sort((a, b) => daysUntil(a.birthday) - daysUntil(b.birthday));
  return `<div class="page"><div class="page-heading"><div><p class="eyebrow">Your circle</p><h1>Friends & birthdays</h1><p class="page-subtitle">Add people you know to keep their important dates close.</p></div><button class="button primary" data-action="add-friend">${icon("plus", 15)} Add a friend</button></div><div class="section-head"><div><p class="eyebrow">People you added</p><h2>Your circle <span class="result-count">(${contacts.length})</span></h2></div></div><div class="people-grid">${contacts.map(personCard).join("") || emptyState("Your circle starts here", "Add a real contact to keep a birthday reminder. Contacts are private to your account.", "Add a friend", "add-friend")}</div><div class="section-head"><div><p class="eyebrow">A date to remember</p><h2>Coming up</h2></div><span class="result-count">${birthdays.length} birthdays saved</span></div><div class="birthdays-list">${birthdays.map((person) => `<article class="birthday-feature"><div class="birthday-date"><strong>${new Date(`${person.birthday}T12:00:00`).getDate()}</strong><span>${new Date(`${person.birthday}T12:00:00`).toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</span></div>${avatar(person.name)}<div><h3>${escapeHtml(person.name)}</h3><p>${birthdayWhen(person.birthday)}</p></div></article>`).join("") || '<div class="quiet-empty">Add a birthday to your circle and it will appear here.</div>'}</div></div>`;
}

function personCard(person) {
  return `<article class="person-card"><div class="person-top">${avatar(person.name)}<div><h3>${escapeHtml(person.name)}</h3><p class="handle">${escapeHtml(person.location || "Private contact")}</p></div></div><div class="person-meta"><span>${person.birthday ? "Birthday" : "Added"}</span><strong>${person.birthday ? new Date(`${person.birthday}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : new Date(person.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</strong></div><div class="card-footer"><span>PRIVATE CONTACT</span><button class="button danger small" data-action="remove-friend" data-user="${escapeHtml(person.id)}">Remove</button></div></article>`;
}

function renderSearch() {
  const query = searchQuery.trim().toLowerCase();
  const matchingContacts = contacts.filter((person) => !query || `${person.name} ${person.location}`.toLowerCase().includes(query));
  const matchingItems = items.filter((item) => !query || `${item.title} ${item.category} ${item.note}`.toLowerCase().includes(query));
  const showPeople = searchScope === "all" || searchScope === "people";
  const showItems = searchScope === "all" || searchScope === "wishlists";
  return `<div class="page"><div class="page-heading"><div><p class="eyebrow">Find something meaningful</p><h1>Search your vault</h1><p class="page-subtitle">Search your saved ideas and the contacts you added.</p></div></div><label class="search-panel">${icon("search", 19)}<input id="page-search" type="search" placeholder="Search products, categories, or friends" value="${escapeHtml(searchQuery)}" aria-label="Search GiftVault" /><span class="result-count">${query ? "RESULTS" : ""}</span></label><div class="filter-row"><button class="filter-chip ${searchScope === "all" ? "active" : ""}" data-action="search-scope" data-scope="all">Everything</button><button class="filter-chip ${searchScope === "people" ? "active" : ""}" data-action="search-scope" data-scope="people">People</button><button class="filter-chip ${searchScope === "wishlists" ? "active" : ""}" data-action="search-scope" data-scope="wishlists">Wishlist ideas</button></div>${showPeople ? `<div class="section-head"><div><p class="eyebrow">Your contacts</p><h2>${query ? "People" : "People you added"}</h2></div><span class="result-count">${matchingContacts.length} contacts</span></div><div class="people-grid">${matchingContacts.map(personCard).join("") || '<div class="quiet-empty">Contacts you add will appear here.</div>'}</div>` : ""}${showItems ? `<div class="section-head"><div><p class="eyebrow">Your collection</p><h2>${query ? "Matching ideas" : "Wishlist ideas"}</h2></div><span class="result-count">${matchingItems.length} ideas</span></div><div class="item-list">${matchingItems.map((item) => itemRow(item)).join("") || emptyState("No matching ideas", "Try another search or add a new product link.", "", "")}</div>` : ""}</div>`;
}

function renderWishlist() {
  if (publicList) return renderProfile();
  const reservedCount = reservedInView.size;
  return `<div class="page"><div class="page-heading"><div><p class="eyebrow">Your collection / private preview</p><h1>My wishlist</h1><p class="page-subtitle">Keep the things you love in one easy place. Share a public link when someone asks what you'd like.</p></div><button class="button primary" data-action="add-item">${icon("plus", 15)} Add an idea</button></div><section class="account-card">${avatar(displayName(), "large")}<div class="account-meta"><h2>Your wishlist</h2><p>SYNCED TO YOUR ACCOUNT · ${items.length} ${items.length === 1 ? "idea" : "ideas"}</p></div><button class="button secondary small" data-action="share-list">${icon("copy", 13)} Copy share link</button></section><div class="share-panel"><div><span class="eyebrow">PUBLIC SHARE LINK</span><p>${escapeHtml(publicUrl() || "Create your wishlist to generate a share link.")}</p></div><button class="button secondary small" data-action="share-list">Copy link</button></div><div class="tab-row"><button class="tab-button ${accountTab === "wishlist" ? "active" : ""}" data-action="account-tab" data-tab="wishlist">All ideas (${items.length})</button><button class="tab-button ${accountTab === "claimed" ? "active" : ""}" data-action="account-tab" data-tab="claimed">Reservations sent (${reservedCount})</button></div><div class="item-list">${items.map((item) => itemRow(item)).join("") || emptyState("Your list is a blank page", "Add a product link to start a collection that feels like you.", "Add your first idea", "add-item")}</div><p class="demo-note" style="margin-top:17px">Reservation details are private by database policy. This owner view cannot read or display reservations.</p></div>`;
}

function renderProfile() {
  const title = publicList.title || "Shared wishlist";
  const listItems = publicList.items || [];
  return `<div class="page"><div class="page-heading"><div><p class="eyebrow">Shared list / guest view</p><h1>${escapeHtml(title)}</h1><p class="page-subtitle">Reserve a gift to help keep the surprise. No account is needed.</p></div><span class="badge">${icon("lock", 11)} Public link</span></div><section class="account-card">${avatar(title, "large")}<div class="account-meta"><h2>${escapeHtml(title)}</h2><p>${listItems.length} ${listItems.length === 1 ? "idea" : "ideas"} · RESERVATIONS ARE PRIVATE</p></div></section><div class="item-list">${listItems.map((item) => itemRow(item)).join("") || emptyState("No ideas yet", "This wishlist is waiting for a few good things.", "", "")}</div><p class="demo-note" style="margin-top:17px">The owner cannot read reservation names or item reservation status. After you submit, only you see a temporary confirmation in this browser session.</p></div>`;
}

function renderAnalytics() {
  const counts = {};
  items.forEach((item) => { counts[item.category] = (counts[item.category] || 0) + 1; });
  const categories = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return `<div class="page"><div class="page-heading"><div><p class="eyebrow">Your account / insights</p><h1>Your vault, at a glance.</h1><p class="page-subtitle">A private overview of the wishlist data saved to your account.</p></div><span class="badge">${icon("chart", 11)} PRIVATE</span></div><div class="analytics-grid"><article class="analytics-card"><span class="stat-label">Wishlist ideas</span><strong class="stat-value">${items.length}</strong><p class="trend">Synced to your account</p></article><article class="analytics-card"><span class="stat-label">Contacts</span><strong class="stat-value">${contacts.length}</strong><p class="trend">Private to your account</p></article><article class="analytics-card"><span class="stat-label">Share link</span><strong class="stat-value">${shareToken ? "Active" : "—"}</strong><p class="trend">Public list · private reservations</p></article></div><div class="analytics-lower"><section class="analytics-panel"><h2>Ideas by category</h2>${categories.map(([name, count]) => `<div class="bar-row"><span>${escapeHtml(name)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(count / Math.max(...categories.map((entry) => entry[1])) * 100)}%"></div></div><strong>${count}</strong></div>`).join("") || '<div class="quiet-empty">Categories appear when you save ideas.</div>'}</section><section class="analytics-panel"><h2>Data & privacy</h2><p class="analytics-copy">Your wishlist and contacts are stored in Supabase and protected by account-level Row Level Security. Reservation rows are not readable by the browser client.</p></section></div></div>`;
}

function renderAuth() {
  const isSignup = authMode === "signup";
  const isRecovery = authMode === "recovery";
  const heading = isRecovery ? "Choose a new password" : isSignup ? "Create your account" : "Welcome back";
  return `<main class="main"><section class="page sign-in-page"><div class="hero sign-in-hero"><div class="hero-copy"><p class="eyebrow">GiftVault / your personal vault</p><h1>${isSignup ? "Start a wishlist of your own." : isRecovery ? "One more step to your vault." : "A little space for what you love."}</h1><p>${isSignup ? "Create an account to save ideas and share them with the people you love." : isRecovery ? "Choose a new password for your account." : "Sign in to your account to find your saved ideas, all in one place."}</p></div><div class="hero-visual"><div class="clay-object"><span class="clay-object-mark">${icon("box", 44)}</span></div></div></div><section class="analytics-panel auth-panel"><div class="section-head"><div><p class="eyebrow">Email account</p><h2>${heading}</h2></div><span class="result-count">SECURE SIGN IN</span></div><form id="auth-form">${isSignup ? '<div class="form-field"><label for="auth-name">Your name</label><input id="auth-name" name="name" maxlength="80" autocomplete="name" placeholder="Name" /></div>' : ""}${isRecovery ? "" : '<div class="form-field"><label for="auth-email">Email</label><input id="auth-email" name="email" type="email" required autocomplete="email" placeholder="you@domain.com" /></div>'}<div class="form-field"><label for="auth-password">${isRecovery ? "New password" : "Password"}</label><input id="auth-password" name="password" type="password" required minlength="8" autocomplete="${isSignup || isRecovery ? "new-password" : "current-password"}" placeholder="At least 8 characters" /></div><p class="auth-error" id="auth-error" role="alert"></p><div class="modal-actions"><button type="submit" class="button primary">${isSignup ? "Create account" : isRecovery ? "Update password" : "Sign in"} ${icon("arrow", 13)}</button></div></form><div class="auth-foot">${isRecovery ? "" : isSignup ? "Already have an account?" : "New to GiftVault?"} ${isRecovery ? "" : `<button class="text-action" data-action="auth-mode" data-mode="${isSignup ? "login" : "signup"}">${isSignup ? "Sign in" : "Create account"}</button>`}${!isSignup && !isRecovery ? '<button class="text-action reset-link" data-action="reset-password">Forgot password?</button>' : ""}</div></section></section></main>`;
}

function renderLoading() {
  return `<main class="main"><section class="page"><div class="hero"><div class="hero-copy"><p class="eyebrow">GiftVault / Supabase</p><h1>Opening your vault.</h1><p>Connecting to your account and loading saved ideas.</p></div><div class="hero-visual"><div class="clay-object"><span class="clay-object-mark">${icon("box", 44)}</span></div></div></div></section></main>`;
}

function emptyState(title, message, buttonText, action) {
  return `<div class="empty-state"><span class="empty-icon">${icon("sparkle", 21)}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p>${buttonText ? `<button class="button secondary small" data-action="${escapeHtml(action)}">${escapeHtml(buttonText)}</button>` : ""}</div>`;
}

function renderError() {
  return `<div class="page"><div class="page-heading"><div><p class="eyebrow">Connection issue</p><h1>We couldn't load your vault.</h1><p class="page-subtitle">${escapeHtml(loadError)}</p></div><button class="button secondary" data-action="retry-load">Try again</button></div></div>`;
}

function render() {
  if (authLoading) {
    document.getElementById("app").innerHTML = `<div class="app-shell">${renderLoading()}</div>`;
    return;
  }
  if (authMode === "recovery") {
    document.getElementById("app").innerHTML = `<div class="app-shell">${renderAuth()}</div>`;
    return;
  }
  if (shareToken && loadError && !publicList) {
    document.getElementById("app").innerHTML = `<div class="app-shell">${headerMarkup()}${renderError()}</div>`;
    return;
  }
  if (!currentUser() && !publicList) {
    document.getElementById("app").innerHTML = `<div class="app-shell">${renderAuth()}</div>`;
    return;
  }
  if (loadError && !publicList) {
    document.getElementById("app").innerHTML = `<div class="app-shell">${headerMarkup()}${renderError()}</div>`;
    return;
  }
  const view = publicList ? renderProfile()
    : page === "discover" ? renderDiscover()
      : page === "friends" ? renderFriends()
        : page === "search" ? renderSearch()
          : page === "wishlist" ? renderWishlist()
            : page === "analytics" ? renderAnalytics()
              : renderDiscover();
  document.getElementById("app").innerHTML = `<div class="app-shell">${headerMarkup()}<div class="layout">${navMarkup()}<main class="main">${view}</main></div>${navMarkup(true)}</div>`;
}

function showModal(markup) {
  document.getElementById("modal-root").innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal" role="dialog" aria-modal="true">${markup}</section></div>`;
  document.querySelector(".modal input")?.focus();
}

function closeModal() {
  document.getElementById("modal-root").innerHTML = "";
}

function openAccountMenu() {
  if (!currentUser()) {
    publicList = null;
    shareToken = null;
    window.history.replaceState(null, "", "/");
    authMode = "login";
    render();
    return;
  }
  showModal(`<div class="modal-head"><div><p class="eyebrow">Your account</p><h2>${escapeHtml(displayName())}</h2><p>${escapeHtml(currentUser().email || "")}</p></div><button class="icon-button" data-action="close-modal" aria-label="Close">${icon("close", 16)}</button></div><div class="account-choice">${avatar(displayName())}<span><strong>Signed in securely</strong><small>Wishlist and contacts sync with Supabase</small></span></div><div class="modal-actions"><button class="button quiet" data-action="sign-out">${icon("logout", 14)} Sign out</button><button class="button primary" data-action="close-modal">Done</button></div>`);
}

function openAddItem(item = null) {
  const editing = Boolean(item);
  showModal(`<div class="modal-head"><div><p class="eyebrow">${editing ? "Edit this idea" : "Add to your wishlist"}</p><h2>${editing ? "Update your saved idea" : "Save something you love"}</h2><p>Add a product title and the link where it can be found.</p></div><button class="icon-button" data-action="close-modal" aria-label="Close">${icon("close", 16)}</button></div><form id="item-form" data-item-id="${editing ? escapeHtml(item.id) : ""}"><div class="form-field"><label for="item-title">What is it?</label><input id="item-title" name="title" required maxlength="120" placeholder="e.g. Handmade ceramic vase" value="${escapeHtml(item?.title || "")}" /></div><div class="form-field"><label for="item-url">Product link</label><input id="item-url" name="url" required type="url" placeholder="https://…" value="${escapeHtml(item?.url || "")}" /><span class="form-help">Use a direct product link. GiftVault doesn't sell products or track prices.</span></div><div class="form-field"><label for="item-category">Category</label><select id="item-category" name="category"><option>Home</option><option>Books</option><option>Kitchen</option><option>Outdoors</option><option>Accessories</option><option>Stationery</option><option>Wellness</option><option>Other</option></select></div><div class="form-field"><label for="item-note">Note <span class="form-help">(optional)</span></label><input id="item-note" name="note" maxlength="80" placeholder="Color, size, or a little detail" value="${escapeHtml(item?.note || "")}" /></div><div class="modal-actions"><button type="button" class="button quiet" data-action="close-modal">Cancel</button><button type="submit" class="button primary">${editing ? "Save changes" : "Add to wishlist"}</button></div></form>`);
  if (item) document.getElementById("item-category").value = item.category || "Home";
}

function openAddFriend() {
  showModal(`<div class="modal-head"><div><p class="eyebrow">Your circle</p><h2>Add someone you know</h2><p>Save a real contact and optional birthday to your account.</p></div><button class="icon-button" data-action="close-modal" aria-label="Close">${icon("close", 16)}</button></div><form id="friend-form"><div class="form-field"><label for="friend-name">Name</label><input id="friend-name" name="name" required maxlength="80" placeholder="Friend's name" /></div><div class="form-field"><label for="friend-birthday">Birthday <span class="form-help">(optional)</span></label><input id="friend-birthday" name="birthday" type="date" /></div><div class="form-field"><label for="friend-location">City <span class="form-help">(optional)</span></label><input id="friend-location" name="location" maxlength="80" placeholder="City, country" /></div><div class="modal-actions"><button type="button" class="button quiet" data-action="close-modal">Cancel</button><button type="submit" class="button primary">Add contact</button></div></form>`);
}

function openReserve(itemId) {
  const item = publicList?.items.find((entry) => entry.id === itemId);
  if (!item) return;
  showModal(`<div class="modal-head"><div><p class="eyebrow">A thoughtful gesture</p><h2>Reserve this gift</h2><p>${escapeHtml(item.title)}. Share your name or email so the reservation can be recognized.</p></div><button class="icon-button" data-action="close-modal" aria-label="Close">${icon("close", 16)}</button></div><form id="reserve-form" data-item-id="${escapeHtml(itemId)}"><div class="form-field"><label for="reserve-name">Name <span class="form-help">(optional)</span></label><input id="reserve-name" name="name" maxlength="100" placeholder="Your name" /></div><div class="form-field"><label for="reserve-email">Email <span class="form-help">(optional)</span></label><input id="reserve-email" name="email" type="email" maxlength="254" placeholder="you@example.com" /></div><p class="form-help">Enter at least one. Reservation details are never shown to the wishlist owner.</p><p class="auth-error" id="reserve-error" role="alert"></p><div class="modal-actions"><button type="button" class="button quiet" data-action="close-modal">Cancel</button><button type="submit" class="button primary">Send reservation</button></div></form>`);
}

async function loadOwnedData() {
  const user = currentUser();
  if (!user) return;
  loadError = "";
  const { data: list, error: listError } = await supabase
    .from("wishlists")
    .select("id,title,share_token")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (listError) throw listError;
  if (!list) {
    const { data: created, error: createError } = await supabase
      .from("wishlists")
      .insert({ owner_id: user.id })
      .select("id,title,share_token")
      .single();
    if (createError) throw createError;
    wishlist = created;
  } else {
    wishlist = list;
  }
  shareToken = wishlist.share_token;
  const [itemsResult, contactsResult] = await Promise.all([
    supabase.from("wishlist_items").select("id,wishlist_id,title,url,category,note,sort_order,created_at").eq("wishlist_id", wishlist.id).order("sort_order").order("created_at"),
    supabase.from("contacts").select("id,name,birthday,location,created_at").order("name"),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (contactsResult.error) throw contactsResult.error;
  items = itemsResult.data || [];
  contacts = contactsResult.data || [];
}

async function loadPublicList(token) {
  const { data: rows, error } = await supabase.rpc("get_public_wishlist", { p_share_token: token });
  if (error) throw error;
  if (!rows?.length) {
    publicList = null;
    return false;
  }
  publicList = {
    id: rows[0].wishlist_id,
    title: rows[0].wishlist_title,
    items: rows.filter((row) => row.item_id).map((row) => ({
      id: row.item_id,
      title: row.item_title,
      url: row.item_url,
      category: row.category,
      note: row.note,
      created_at: row.created_at,
      sort_order: row.sort_order,
    })),
  };
  shareToken = token;
  return true;
}

async function refreshData() {
  authLoading = true;
  loadError = "";
  render();
  try {
    if (shareToken && window.location.pathname.startsWith("/list/")) {
      await loadPublicList(shareToken);
      if (!publicList) loadError = "This share link is invalid or no longer available.";
    }
    if (currentUser() && !window.location.pathname.startsWith("/list/")) await loadOwnedData();
  } catch (error) {
    console.error("Could not load GiftVault data.", error);
    loadError = error.message || "Please check your connection and try again.";
  } finally {
    authLoading = false;
    render();
  }
}

async function shareWishlist() {
  if (!shareToken) {
    toast("Your share link is not ready yet.");
    return;
  }
  const url = publicUrl();
  try {
    await navigator.clipboard.writeText(url);
    toast("Share link copied.");
  } catch (error) {
    console.error("Could not copy the wishlist link.", error);
    window.prompt("Copy your wishlist link:", url);
  }
}

async function submitAuth(event) {
  event.preventDefault();
  const form = event.target;
  const values = new FormData(form);
  const email = String(values.get("email") || "").trim();
  const password = String(values.get("password") || "");
  const errorElement = document.getElementById("auth-error");
  errorElement.textContent = "";
  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    if (authMode === "signup") {
      const name = String(values.get("name") || "").trim();
      const { data: result, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      if (!result.session) {
        errorElement.textContent = "Check your email for a confirmation link, then return here to sign in.";
      } else if (authMode === "recovery") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        window.history.replaceState(null, "", window.location.pathname);
        authMode = "login";
        toast("Password updated. You can sign in with your new password.");
        render();
      } else {
        toast("Account created. Your wishlist is ready.");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (error) {
    errorElement.textContent = error.message || "Authentication failed. Please try again.";
  } finally {
    submitButton.disabled = false;
  }
}

async function submitItem(event) {
  event.preventDefault();
  if (!wishlist || !currentUser()) return;
  const formData = new FormData(event.target);
  const title = String(formData.get("title") || "").trim();
  const url = safeUrl(String(formData.get("url") || "").trim());
  if (!title || !url) {
    toast("Enter an item title and a valid http or https product link.");
    return;
  }
  const category = String(formData.get("category") || "Other");
  const values = {
    wishlist_id: wishlist.id,
    title,
    url,
    category,
    note: String(formData.get("note") || "").trim(),
  };
  const itemId = event.target.dataset.itemId;
  const result = itemId
    ? await supabase.from("wishlist_items").update(values).eq("id", itemId).eq("wishlist_id", wishlist.id)
    : await supabase.from("wishlist_items").insert(values);
  if (result.error) {
    toast(`Could not save this idea: ${result.error.message}`);
    return;
  }
  closeModal();
  await refreshData();
  page = "wishlist";
  render();
  toast(itemId ? "Wishlist idea updated." : "Added to your wishlist.");
}

async function submitContact(event) {
  event.preventDefault();
  if (!currentUser()) return;
  const formData = new FormData(event.target);
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const { error } = await supabase.from("contacts").insert({
    owner_id: currentUser().id,
    name,
    birthday: String(formData.get("birthday") || "") || null,
    location: String(formData.get("location") || "").trim(),
  });
  if (error) {
    toast(`Could not add this contact: ${error.message}`);
    return;
  }
  closeModal();
  await refreshData();
  page = "friends";
  render();
  toast(`${name} added to your circle.`);
}

async function submitReservation(event) {
  event.preventDefault();
  if (!shareToken || !publicList) return;
  const formData = new FormData(event.target);
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  if (!name && !email) {
    document.getElementById("reserve-error").textContent = "Enter a name or email to continue.";
    return;
  }
  const { error } = await supabase.rpc("reserve_wishlist_item", {
    p_share_token: shareToken,
    p_item_id: event.target.dataset.itemId,
    p_name: name || null,
    p_email: email || null,
  });
  if (error) {
    document.getElementById("reserve-error").textContent = error.message || "Could not submit this reservation.";
    return;
  }
  reservedInView.add(event.target.dataset.itemId);
  closeModal();
  render();
  toast("Request processed. If the item was available, it is now reserved; prior status stays private.");
}

function setAuthMode(mode) {
  authMode = mode;
  render();
}

async function handleAction(button) {
  const action = button.dataset.action;
  if (action === "navigate") {
    page = button.dataset.page;
    if (page === "wishlist" && publicList) {
      render();
      return;
    }
    render();
  } else if (action === "account-menu" || action === "sign-in") openAccountMenu();
  else if (action === "close-modal") closeModal();
  else if (action === "auth-mode") setAuthMode(button.dataset.mode);
  else if (action === "add-item") openAddItem();
  else if (action === "edit-item") openAddItem(items.find((item) => item.id === button.dataset.item));
  else if (action === "delete-item") {
    const item = items.find((entry) => entry.id === button.dataset.item);
    if (item && window.confirm(`Remove "${item.title}" from your wishlist?`)) {
      const { error } = await supabase.from("wishlist_items").delete().eq("id", item.id).eq("wishlist_id", wishlist.id);
      if (error) {
        toast(`Could not remove this idea: ${error.message}`);
        return;
      }
      await refreshData();
      page = "wishlist";
      render();
      toast("Idea removed from your wishlist.");
    }
  } else if (action === "reserve") openReserve(button.dataset.item);
  else if (action === "remove-friend") {
    const { error } = await supabase.from("contacts").delete().eq("id", button.dataset.user);
    if (error) {
      toast(`Could not remove this contact: ${error.message}`);
      return;
    }
    await refreshData();
    page = "friends";
    render();
    toast("Contact removed.");
  } else if (action === "search-scope") {
    searchScope = button.dataset.scope;
    render();
    document.getElementById("page-search")?.focus();
  } else if (action === "account-tab") {
    accountTab = button.dataset.tab;
    render();
  } else if (action === "share-list") await shareWishlist();
  else if (action === "guest-preview") {
    window.location.href = publicUrl();
  } else if (action === "reset-password") {
    const email = window.prompt("Enter your account email to receive a password reset link:");
    if (!email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    toast(error ? `Could not send reset email: ${error.message}` : "If that account exists, a reset link is on its way.");
  } else if (action === "sign-out") {
    closeModal();
    const { error } = await supabase.auth.signOut();
    if (error) toast(`Could not sign out: ${error.message}`);
  } else if (action === "retry-load") await refreshData();
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.tagName === "A") event.preventDefault();
  if (button.dataset.action === "modal-backdrop" && event.target !== button) return;
  if (button.dataset.action === "modal-backdrop") closeModal();
  else void handleAction(button);
});

document.addEventListener("submit", (event) => {
  if (event.target.id === "auth-form") void submitAuth(event);
  else if (event.target.id === "item-form") void submitItem(event);
  else if (event.target.id === "friend-form") void submitContact(event);
  else if (event.target.id === "reserve-form") void submitReservation(event);
});

document.addEventListener("input", (event) => {
  if (event.target.id === "global-search") {
    searchQuery = event.target.value;
    if (event.target.value && page !== "search") {
      page = "search";
      render();
      document.getElementById("page-search")?.focus();
    } else if (page === "search") {
      const cursor = event.target.selectionStart;
      render();
      const input = document.getElementById("page-search");
      input?.focus();
      input?.setSelectionRange(cursor, cursor);
    }
  } else if (event.target.id === "page-search") {
    searchQuery = event.target.value;
    const cursor = event.target.selectionStart;
    render();
    const input = document.getElementById("page-search");
    input?.focus();
    input?.setSelectionRange(cursor, cursor);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.target.id === "global-search" && event.key === "Enter") {
    event.preventDefault();
    searchQuery = event.target.value;
    page = "search";
    render();
    document.getElementById("page-search")?.focus();
  }
  if (event.key === "Escape") closeModal();
});

document.addEventListener("click", (event) => {
  if (event.target.closest("#global-search")) return;
  if (event.target.closest(".top-search") && page !== "search") {
    page = "search";
    render();
    document.getElementById("page-search")?.focus();
  }
});

async function start() {
  shareToken = routeShareToken();
  if (new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery") authMode = "recovery";
  try {
    const { data: authData, error } = await supabase.auth.getSession();
    if (error) throw error;
    session = authData.session;
    authLoading = false;
    if (shareToken) {
      try {
        await loadPublicList(shareToken);
        if (!publicList) loadError = "This share link is invalid or no longer available.";
      } catch (error) {
        loadError = error.message || "Could not open this shared wishlist.";
      }
    }
    if (currentUser() && !shareToken) {
      try {
        await loadOwnedData();
      } catch (error) {
        console.error("Could not load the signed-in user's data.", error);
        loadError = error.message || "Could not load your wishlist.";
      }
    }
    render();
    supabase.auth.onAuthStateChange((_event, nextSession) => {
      const previousId = currentUser()?.id;
      session = nextSession;
      if (session?.user.id !== previousId) void refreshData();
      else render();
    });
  } catch (error) {
    console.error("Could not initialize Supabase.", error);
    authLoading = false;
    loadError = error.message || "Could not connect to Supabase.";
    render();
  }
}

void start();
