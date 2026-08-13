import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// ------------------------------------------------------------
// Supabase設定：差し替える場合は、この3行だけを変更してください。
// Publishable keyはブラウザ公開用です。秘密鍵（service_role）は置かないでください。
// ------------------------------------------------------------
const SUPABASE_URL = "https://xtzwpybdcvokamrhpbtc.supabase.co";
const SUPABASE_REST_URL = "https://xtzwpybdcvokamrhpbtc.supabase.co/rest/v1/";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Vo6HQLzhxN_4Vd2pSM0KZQ_8uZVXwaU";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const IS_PREVIEW_MODE = new URLSearchParams(location.search).get("preview") === "1";
const FISH_ASSET_URL = "./assets/fish-watercolor.png";
const PROFILE_FIELDS = "user_id,grade,major,interests,fish_type,bio,created_at,updated_at";
const PROFILE_PUBLIC_FIELDS = "user_id,grade,major,interests,fish_type,bio";
const PROFILE_FIELDS_WITHOUT_BIO = "user_id,grade,major,interests,fish_type,created_at,updated_at";
const PROFILE_PUBLIC_FIELDS_WITHOUT_BIO = "user_id,grade,major,interests,fish_type";
const PROFILE_FIELDS_WITHOUT_INTERESTS = "user_id,grade,major,fish_type,created_at,updated_at";
const PROFILE_PUBLIC_FIELDS_WITHOUT_INTERESTS = "user_id,grade,major,fish_type";
const POST_BASE_FIELDS = "id,user_id,title,body,category,post_type,like_count,created_at,updated_at";
const MAX_LAKE_FISH = 12;
const MAX_LAKE_POSTS = 4;
const AQUARIUM_PRESENCE_TTL_SECONDS = 90;
const AQUARIUM_HEARTBEAT_INTERVAL_MS = 25000;
const AQUARIUM_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const AQUARIUM_REACTION_VISIBLE_MS = 7000;
const AQUARIUM_GLOBAL_REACTION_COOLDOWN_MS = 4000;
const AQUARIUM_DIRECT_REACTION_COOLDOWN_MS = 3000;
const AQUARIUM_SAME_TARGET_COOLDOWN_MS = 10000;

const AQUARIUM_STATUS = {
  social: { label: "交流OK", className: "status-social" },
  break: { label: "休憩中", className: "status-break" },
  observe: { label: "見るだけ", className: "status-observe" },
};

const AQUARIUM_REACTIONS = {
  hello: "こんにちは",
  starting: "湖に来ました",
  new_bottle: "新しいボトルを流しました。よかったら見てね！",
  question_bottle: "質問のボトルを流しました。知っていたら教えてください！",
  info_bottle: "情報のボトルを流しました。よかったら見てください！",
  share_interest_1: "興味分野を共有しました",
  share_interest_2: "興味分野を共有しました",
  share_interest_3: "興味分野を共有しました",
  good_work: "またね",
  taking_break: "少し離れます",
  together: "よろしくね",
  same_field: "同じ分野です",
  support: "応援しています",
  interesting: "その分野、気になります",
  view_bottles: "ボトルも見てみたいです",
  good_work_direct: "また話そう",
};

const BOTTLE_ANNOUNCEMENT_CODES = new Set(["new_bottle", "question_bottle", "info_bottle"]);

const FISH = {
  coral: { filter: "hue-rotate(0deg) saturate(.9)" },
  aqua: { filter: "hue-rotate(150deg) saturate(.55) brightness(.9)" },
  lemon: { filter: "hue-rotate(54deg) saturate(.62) brightness(1.05)" },
  lilac: { filter: "hue-rotate(230deg) saturate(.5)" },
  mint: { filter: "hue-rotate(115deg) saturate(.45) brightness(.98)" },
  peach: { filter: "hue-rotate(345deg) saturate(.62) brightness(1.05)" },
};

const CATEGORY_COLORS = {
  授業: "#e7f7f4",
  研究: "#f0edfb",
  就活: "#fff0eb",
  イベント: "#fff7dd",
};

const FIELD_GROUPS = [
  ["情報・AI", ["情報", "プログラミング", "ソフトウェア", "コンピュータ", "ai", "人工知能", "データ", "機械学習", "アルゴリズム"]],
  ["ロボット・機械", ["ロボット", "機械", "制御", "メカトロ", "航空", "自動車", "設計"]],
  ["生命・医療", ["生命", "生物", "バイオ", "医療", "薬学", "細胞", "遺伝", "農学"]],
  ["化学・材料", ["化学", "材料", "物質", "応用化学", "高分子", "有機", "無機"]],
  ["建築・環境", ["建築", "都市", "環境", "土木", "防災", "デザイン"]],
  ["数学・物理", ["数学", "数理", "物理", "宇宙", "天文", "量子", "統計"]],
];

const state = {
  session: null,
  user: null,
  profile: null,
  isAdmin: false,
  adminData: null,
  adminLoadedRange: "",
  reportTarget: null,
  analyticsImpressions: new Set(),
  aquariumPresence: [],
  aquariumReactions: [],
  aquariumPreferences: {
    participate_as_fish: true,
    receive_reactions: true,
    default_status: "social",
  },
  aquariumAvailable: true,
  aquariumPresenceJoined: false,
  mutedUserIds: new Set(),
  selectedFishPresence: null,
  lastAquariumActivityAt: Date.now(),
  aquariumIdle: false,
  posts: [],
  replies: [],
  myPosts: [],
  likedPostIds: new Set(),
  selectedCategory: "all",
  postSearchQuery: "",
  postOwnership: "all",
  selectedPostId: null,
  editingReplyId: null,
  replyingToReplyId: null,
  realtimeChannel: null,
  aquariumHeartbeatId: null,
  aquariumExpiryTimerId: null,
  reactionExpiryTimerId: null,
  lastAquariumReactionAt: 0,
  lastAquariumReactionTargetAt: new Map(),
  lastAnnouncedAquariumReactionId: null,
  interestsColumnAvailable: true,
  bioColumnAvailable: true,
  analyticsProfileColumnsAvailable: true,
  postFieldTagsColumnAvailable: true,
  postExternalUrlColumnAvailable: true,
  postExternalSiteNameColumnAvailable: true,
  threadedRepliesAvailable: true,
  routeVersion: 0,
  realtimeReloadTimer: null,
  realtimeReloadKinds: new Set(),
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

function parseInterests(value) {
  const source = Array.isArray(value) ? value : String(value ?? "").split(/[、,，]/);
  return [...new Set(source.map((item) => String(item).trim()).filter(Boolean))].slice(0, 8);
}

const LAKE_NAME_COLORS = ["珊瑚色", "水色", "若草色", "月白", "藤色", "桃色", "琥珀色", "浅葱色"];
const LAKE_NAME_MOTIFS = ["ひれ", "しずく", "さざ波", "こもれび", "水草", "小石", "みなも", "泡"];

function lakeVisitName(presence) {
  if (!presence || presence.user_id === state.user?.id) return "あなたの魚";
  const visitKey = String(presence.joined_at ?? "").slice(0, 16);
  const seed = Math.abs(hashNumber(`${presence.user_id}:${visitKey}`));
  const color = LAKE_NAME_COLORS[seed % LAKE_NAME_COLORS.length];
  const motif = LAKE_NAME_MOTIFS[Math.floor(seed / LAKE_NAME_COLORS.length) % LAKE_NAME_MOTIFS.length];
  return `${color}の${motif}`;
}

function threadParticipantLabels(postId) {
  const post = state.posts.find((item) => item.id === postId);
  const participants = [...new Set(state.replies
    .filter((reply) => reply.post_id === postId && reply.sender_user_id !== post?.user_id)
    .map((reply) => reply.sender_user_id))].sort();
  return new Map(participants.map((userId, index) => [userId, `魚${String.fromCharCode(65 + index)}`]));
}

function threadAuthorLabel(userId, postId, labels = threadParticipantLabels(postId)) {
  if (userId === state.user?.id) return "あなた";
  const post = state.posts.find((item) => item.id === postId);
  if (post?.user_id === userId) return "投稿した魚";
  return labels.get(userId) ?? "湖の魚";
}

function reactionText(messageCode, profile = null) {
  const slotMatch = String(messageCode ?? "").match(/^share_interest_([1-3])$/);
  if (slotMatch) {
    const interests = parseInterests(profile?.interests);
    const fallback = String(profile?.major ?? "").trim();
    const interest = interests[Number(slotMatch[1]) - 1] || (Number(slotMatch[1]) === 1 ? fallback : "");
    return interest ? `${interest}に興味があります` : AQUARIUM_REACTIONS[messageCode];
  }
  return AQUARIUM_REACTIONS[messageCode] ?? "湖から合図が届きました";
}

function parseFieldTags(value) {
  const source = Array.isArray(value) ? value : String(value ?? "").split(/[、,，]/);
  return [...new Set(source.map((item) => String(item).trim()).filter(Boolean))].slice(0, 5);
}

function normalizeSearchText(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function searchablePostText(post) {
  return normalizeSearchText([
    post.title,
    post.body,
    post.category,
    post.post_type,
    post.external_url,
    post.external_site_name,
    ...parseFieldTags(post.field_tags),
    post.profile?.major,
    ...(post.profile?.interests ?? []),
  ].filter(Boolean).join(" "));
}

function renderTextWithLinks(container, value) {
  const text = String(value ?? "");
  const urlPattern = /https?:\/\/[^\s<>"']+/gi;
  let cursor = 0;
  container.replaceChildren();

  for (const match of text.matchAll(urlPattern)) {
    const rawUrl = match[0];
    const trailing = rawUrl.match(/[.,!?;:、。！？）)\]}]+$/)?.[0] ?? "";
    const linkText = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
    if (match.index > cursor) container.append(document.createTextNode(text.slice(cursor, match.index)));

    try {
      const url = new URL(linkText);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("unsupported protocol");
      const link = document.createElement("a");
      link.className = "post-external-link";
      link.href = url.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.referrerPolicy = "no-referrer";
      link.setAttribute("aria-label", `${url.hostname}を新しいタブで開く`);
      const icon = document.createElement("i");
      icon.className = "ph ph-arrow-square-out";
      icon.setAttribute("aria-hidden", "true");
      link.append(document.createTextNode(linkText), icon);
      container.append(link);
    } catch {
      container.append(document.createTextNode(linkText));
    }

    if (trailing) container.append(document.createTextNode(trailing));
    cursor = match.index + rawUrl.length;
  }

  if (cursor < text.length) container.append(document.createTextNode(text.slice(cursor)));
}

function validateExternalUrlInput(input) {
  const rawValue = input.value.trim();
  const normalizedUrl = normalizeExternalUrl(rawValue);
  input.setCustomValidity(rawValue && !normalizedUrl ? "http:// または https:// から始まるURLを入力してください。" : "");
  return normalizedUrl;
}

function renderPostExternalLink(container, value, siteName = "") {
  const href = normalizeExternalUrl(value);
  container.replaceChildren();
  container.hidden = !href;
  if (!href) return;

  const url = new URL(href);
  const link = document.createElement("a");
  link.className = "post-primary-link";
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.referrerPolicy = "no-referrer";
  const displayName = normalizeExternalSiteName(siteName) || "公式・参考サイト";
  link.setAttribute("aria-label", `${displayName}を新しいタブで開く`);
  link.addEventListener("click", () => {
    const post = state.posts.find((item) => item.id === state.selectedPostId);
    if (post) trackAnalyticsEvent("external_link_click", { page_key: "board", content_type: "bottle", content_id: post.id });
  });

  const icon = document.createElement("span");
  icon.className = "post-primary-link-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = '<i class="ph ph-link-simple"></i>';

  const copy = document.createElement("span");
  copy.className = "post-primary-link-copy";
  const label = document.createElement("strong");
  label.textContent = displayName;
  const host = document.createElement("small");
  host.textContent = `${url.hostname.replace(/^www\./, "")} を開く`;
  copy.append(label, host);

  const arrow = document.createElement("i");
  arrow.className = "ph ph-arrow-up-right";
  arrow.setAttribute("aria-hidden", "true");
  link.append(icon, copy, arrow);
  container.append(link);
}

function setBottleGuideCompact(compact) {
  const guide = $("#bottleGuideToggle");
  if (!guide) return;
  guide.classList.toggle("is-compact", compact);
  guide.setAttribute("aria-expanded", String(!compact));
  const icon = $(".bottle-guide-icon", guide);
  icon?.classList.toggle("ph-x", !compact);
  icon?.classList.toggle("ph-info", compact);
}

function initializeBottleGuide() {
  let compact = false;
  try {
    compact = localStorage.getItem("manabium:bottle-guide-seen") === "1";
  } catch {
    compact = false;
  }
  setBottleGuideCompact(compact);
}

function applyPostSearch(value, resetCategory = false) {
  state.postSearchQuery = String(value ?? "").trim();
  const input = $("#postSearchInput");
  const clearButton = $("#clearPostSearchButton");
  input.value = state.postSearchQuery;
  clearButton.hidden = !state.postSearchQuery;

  if (resetCategory) {
    state.selectedCategory = "all";
    $$(".category-chip", $("#categoryFilters")).forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.category === "all");
    });
  }
  renderPosts();
}

function normalizeProfile(profile) {
  return profile ? { ...profile, interests: parseInterests(profile.interests) } : profile;
}

function normalizeExternalUrl(value) {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) return "";
  try {
    const url = new URL(rawValue);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function normalizeExternalSiteName(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function normalizePost(post) {
  return post ? {
    ...post,
    field_tags: parseFieldTags(post.field_tags),
    external_url: normalizeExternalUrl(post.external_url),
    external_site_name: normalizeExternalSiteName(post.external_site_name),
  } : post;
}

function createClientUuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.random() * 16 | 0;
    return (character === "x" ? random : (random & 3) | 8).toString(16);
  });
}

  const analyticsContext = (() => {
  let visitorId;
  let isFirstVisit = false;
  try {
    visitorId = localStorage.getItem("manabium:visitor-id");
    if (!visitorId) {
      visitorId = createClientUuid();
      localStorage.setItem("manabium:visitor-id", visitorId);
      isFirstVisit = true;
    }
  } catch {
    visitorId = createClientUuid();
    isFirstVisit = true;
  }
  let visitCount = 0;
  try {
    visitCount = Number(localStorage.getItem("manabium:visit-count")) || 0;
    localStorage.setItem("manabium:visit-count", String(visitCount + 1));
  } catch {
    visitCount = isFirstVisit ? 0 : 1;
  }
  let sessionId;
  try {
    sessionId = sessionStorage.getItem("manabium:analytics-session") || createClientUuid();
    sessionStorage.setItem("manabium:analytics-session", sessionId);
  } catch {
    sessionId = createClientUuid();
  }
  const params = new URLSearchParams(location.search);
  const currentOrigin = location.origin;
  let referrerHost = "";
  try {
    const referrer = document.referrer ? new URL(document.referrer) : null;
    referrerHost = referrer && referrer.origin !== currentOrigin ? referrer.hostname : "";
  } catch { referrerHost = ""; }
  return {
    visitorId,
    sessionId,
    isFirstVisit,
    visitCount,
    landingPage: `${location.pathname}${location.search}${location.hash}`.slice(0, 160),
    referrerHost,
    utmSource: params.get("utm_source"),
    utmMedium: params.get("utm_medium"),
    utmCampaign: params.get("utm_campaign"),
    utmContent: params.get("utm_content"),
    utmTerm: params.get("utm_term"),
  };
})();

async function trackAnalyticsEvent(eventType, attributes = {}) {
  if (IS_PREVIEW_MODE || location.protocol === "file:") return;
  try {
    const headers = { "Content-Type": "application/json" };
    if (state.session?.access_token) headers.Authorization = `Bearer ${state.session.access_token}`;
    await fetch("/api/events", {
      method: "POST",
      headers,
      keepalive: true,
      body: JSON.stringify({
        session_id: analyticsContext.sessionId,
        visitor_id: analyticsContext.visitorId,
        landing_page: analyticsContext.landingPage,
        referrer_host: analyticsContext.referrerHost,
        utm_source: analyticsContext.utmSource,
        utm_medium: analyticsContext.utmMedium,
        utm_campaign: analyticsContext.utmCampaign,
        utm_content: analyticsContext.utmContent,
        utm_term: analyticsContext.utmTerm,
        is_first_visit: analyticsContext.isFirstVisit,
        is_returning_visit: analyticsContext.visitCount > 0,
        events: [{ client_event_id: createClientUuid(), event_type: eventType, ...attributes }],
      }),
    });
    analyticsContext.isFirstVisit = false;
  } catch (error) {
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") console.debug("Analytics unavailable", error);
  }
}

async function loadAdminRole() {
  state.isAdmin = false;
  if (!state.user || IS_PREVIEW_MODE) {
    $$(".admin-only").forEach((element) => { element.hidden = true; });
    return;
  }
  const { data, error } = await supabase.rpc("is_current_user_admin");
  if (!error && data === true) state.isAdmin = true;
  if (error && !/is_current_user_admin|schema cache|function/i.test(String(error.message ?? ""))) console.error("Admin role lookup failed", error);
  $$(".admin-only").forEach((element) => { element.hidden = !state.isAdmin; });
}

function isMissingInterestsColumn(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("interests") && (message.includes("schema cache") || message.includes("column"));
}

function isMissingBioColumn(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("bio") && (message.includes("schema cache") || message.includes("column"));
}

function isMissingAquariumSchema(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return ["aquarium_presence", "aquarium_preferences", "aquarium_reactions", "aquarium_mutes"]
    .some((table) => message.includes(table))
    && (message.includes("schema cache") || message.includes("relation") || message.includes("table"));
}

function isMissingPostFieldTagsColumn(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("field_tags") && (message.includes("schema cache") || message.includes("column"));
}

function isMissingPostExternalUrlColumn(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("external_url") && (message.includes("schema cache") || message.includes("column"));
}

function isMissingPostExternalSiteNameColumn(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("external_site_name") && (message.includes("schema cache") || message.includes("column"));
}

function postSelectFields() {
  return [
    POST_BASE_FIELDS,
    state.postFieldTagsColumnAvailable ? "field_tags" : "",
    state.postExternalUrlColumnAvailable ? "external_url" : "",
    state.postExternalSiteNameColumnAvailable ? "external_site_name" : "",
  ].filter(Boolean).join(",");
}

function disableUnavailablePostColumn(error) {
  if (isMissingPostExternalSiteNameColumn(error) && state.postExternalSiteNameColumnAvailable) {
    state.postExternalSiteNameColumnAvailable = false;
    return true;
  }
  if (isMissingPostExternalUrlColumn(error) && state.postExternalUrlColumnAvailable) {
    state.postExternalUrlColumnAvailable = false;
    return true;
  }
  if (isMissingPostFieldTagsColumn(error) && state.postFieldTagsColumnAvailable) {
    state.postFieldTagsColumnAvailable = false;
    return true;
  }
  return false;
}

function isSchoolGrade(grade) {
  return /^(中学|高校)/.test(String(grade ?? ""));
}

function isUniversityGrade(grade) {
  return /^(大学|大学院)/.test(String(grade ?? ""));
}

function syncEducationFields(mode) {
  const isEdit = mode === "edit";
  const grade = $(`#${isEdit ? "editGrade" : "profileGrade"}`).value;
  const majorField = $(`#${isEdit ? "editMajorField" : "profileMajorField"}`);
  const majorLabel = $(`#${isEdit ? "editMajorLabel" : "profileMajorLabel"}`);
  const majorInput = $(`#${isEdit ? "editMajor" : "profileMajor"}`);
  const interestsLabel = $(`#${isEdit ? "editInterestsLabel" : "profileInterestsLabel"}`);
  const interestsHint = $(`#${isEdit ? "editInterestsHint" : "profileInterestsHint"}`);
  const interestsInput = $(`#${isEdit ? "editInterests" : "profileInterests"}`);
  const schoolGrade = isSchoolGrade(grade);
  const universityGrade = isUniversityGrade(grade);

  majorField.hidden = schoolGrade;
  majorField.parentElement.classList.toggle("single-column", schoolGrade);
  majorInput.required = universityGrade;
  majorLabel.textContent = universityGrade ? "専攻分野" : "専攻・学びたい分野";
  majorInput.placeholder = universityGrade ? "例：情報工学" : "例：情報・建築・生命科学";
  interestsInput.required = schoolGrade;
  const graduationField = $(`#${isEdit ? "editGraduationYearField" : "profileGraduationYearField"}`);
  if (graduationField) graduationField.hidden = !isUniversityGrade(grade);
  interestsLabel.textContent = schoolGrade ? "興味のある分野" : "興味分野";
  interestsHint.textContent = schoolGrade
    ? "（1つ以上・カンマ区切り・最大8個）"
    : "（カンマ区切り・最大8個）";
}

function isMissingParentReplyColumn(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("parent_reply_id") && (message.includes("schema cache") || message.includes("column"));
}

function searchableProfileText(profile) {
  return [profile?.major, ...(profile?.interests ?? [])].filter(Boolean).join(" ").normalize("NFKC").toLowerCase();
}

function profileFieldGroups(profile) {
  const text = searchableProfileText(profile);
  return FIELD_GROUPS
    .filter(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))
    .map(([label]) => label);
}

function profileSimilarity(profile, reference = state.profile) {
  if (!profile || !reference) return 0;
  if (profile.user_id === reference.user_id) return 1000;

  const profileMajor = String(profile.major ?? "").normalize("NFKC").toLowerCase().replace(/\s/g, "");
  const referenceMajor = String(reference.major ?? "").normalize("NFKC").toLowerCase().replace(/\s/g, "");
  let score = 0;
  if (profileMajor && profileMajor === referenceMajor) score += 80;
  else if (profileMajor && referenceMajor && (profileMajor.includes(referenceMajor) || referenceMajor.includes(profileMajor))) score += 36;

  const profileInterests = parseInterests(profile.interests).map((item) => item.normalize("NFKC").toLowerCase());
  const referenceInterests = parseInterests(reference.interests).map((item) => item.normalize("NFKC").toLowerCase());
  referenceInterests.forEach((interest) => {
    if (profileInterests.includes(interest)) score += 28;
    else if (searchableProfileText(profile).includes(interest)) score += 12;
  });

  const referenceGroups = new Set(profileFieldGroups(reference));
  profileFieldGroups(profile).forEach((group) => {
    if (referenceGroups.has(group)) score += 22;
  });
  return score;
}

function activeAquariumPresence() {
  const cutoff = Date.now() - AQUARIUM_PRESENCE_TTL_SECONDS * 1000;
  return state.aquariumPresence.filter((presence) => (
    new Date(presence.heartbeat_at).getTime() >= cutoff
  ));
}

function visibleAquariumPresence() {
  const presence = activeAquariumPresence().filter((item) => (
    item.user_id === state.user?.id || !state.mutedUserIds.has(item.user_id)
  ));
  if (presence.length <= MAX_LAKE_FISH) return presence;

  return presence
    .map((item) => ({ item, score: profileSimilarity(item.profile) }))
    .sort((a, b) => b.score - a.score || new Date(b.item.heartbeat_at) - new Date(a.item.heartbeat_at))
    .slice(0, MAX_LAKE_FISH)
    .map(({ item }) => item);
}

function postRelevance(post) {
  const ageHours = Math.max(0, (Date.now() - new Date(post.created_at).getTime()) / 3600000);
  const recency = Math.max(0, 30 - ageHours / 12);
  const fieldTags = parseFieldTags(post.field_tags);
  const normalizedTags = fieldTags.map((tag) => tag.normalize("NFKC").toLowerCase());
  const profileTerms = [state.profile?.major, ...(state.profile?.interests ?? [])]
    .filter(Boolean)
    .map((term) => String(term).normalize("NFKC").toLowerCase());
  const text = `${fieldTags.join(" ")} ${post.title} ${post.body}`.normalize("NFKC").toLowerCase();
  let topicScore = 0;
  profileTerms.forEach((normalized) => {
    if (normalizedTags.some((tag) => tag === normalized || tag.includes(normalized) || normalized.includes(tag))) topicScore += 34;
    if (normalized && text.includes(normalized)) topicScore += 18;
  });
  profileFieldGroups(state.profile).forEach((group) => {
    const keywords = FIELD_GROUPS.find(([label]) => label === group)?.[1] ?? [];
    if (keywords.some((keyword) => text.includes(keyword))) topicScore += 10;
  });
  return profileSimilarity(post.profile) + topicScore + recency;
}

function visibleLakePosts() {
  const posts = [...state.posts];
  if (posts.length <= MAX_LAKE_POSTS) return posts;

  return posts
    .map((post) => ({
      post,
      score: postRelevance(post) - (post.user_id === state.user?.id ? 1000 : 0),
    }))
    .sort((a, b) => b.score - a.score || new Date(b.post.created_at) - new Date(a.post.created_at))
    .slice(0, MAX_LAKE_POSTS)
    .map(({ post }) => post);
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  $("#toastRegion").append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function readableError(error) {
  const message = String(error?.message ?? error ?? "不明なエラー");
  const lower = message.toLowerCase();

  if (lower.includes("invalid login credentials")) return "メールアドレスまたはパスワードが違います。";
  if (lower.includes("email not confirmed")) return "確認メールのリンクを開いてからログインしてください。";
  if (lower.includes("user already registered")) return "このメールアドレスは登録済みです。";
  if (lower.includes("password should be")) return "パスワードは8文字以上にしてください。";
  if (lower.includes("post_replies") && lower.includes("schema cache")) return "返信機能のデータ設定が古い状態です。管理者へお知らせください。";
  if (lower.includes("reaction target cooldown")) return "同じ相手への連続送信を防いでいます。少し待ってから送ってください。";
  if (lower.includes("reaction cooldown")) return "連続送信を防いでいます。少し待ってから送ってください。";
  if (lower.includes("target is observing only")) return "「見るだけ」の魚には個別リアクションを送れません。";
  if (lower.includes("target is not receiving reactions")) return "相手はリアクション受信をオフにしています。";
  if (lower.includes("reaction is muted")) return "ミュート設定により送信できません。";
  if (lower.includes("invalid aquarium-wide message") || lower.includes("invalid direct reaction")) return "新しい定型文を使うためのSupabase追加SQLがまだ反映されていません。";
  if (lower.includes("target is not active") || lower.includes("not active in the aquarium")) return "相手が湖を離れたため送信できませんでした。";
  if (lower.includes("duplicate key") || error?.code === "23505") return "同じ操作が重複しました。画面を更新してください。";
  if (lower.includes("failed to fetch") || lower.includes("network")) return "通信できませんでした。接続を確認して、もう一度お試しください。";
  if (error?.code === "42501") return "この操作を行う権限がありません。ログイン状態を確認してください。";
  return message;
}

function setButtonLoading(button, loading) {
  button.disabled = loading;
  button.classList.toggle("is-loading", loading);
  button.setAttribute("aria-busy", String(loading));
}

function setAuthMode(mode) {
  const isLogin = mode === "login";
  $("#loginForm").hidden = !isLogin;
  $("#signupForm").hidden = isLogin;
  $("#loginTab").classList.toggle("active", isLogin);
  $("#signupTab").classList.toggle("active", !isLogin);
  $("#loginTab").setAttribute("aria-selected", String(isLogin));
  $("#signupTab").setAttribute("aria-selected", String(!isLogin));
}

function openAuthDialog(mode = "signup") {
  setAuthMode(mode === "login" ? "login" : "signup");
  openDialog("authDialog");
  window.setTimeout(() => {
    const inputId = mode === "login" ? "loginEmail" : "signupEmail";
    document.getElementById(inputId)?.focus({ preventScroll: true });
  }, 80);
}

function initializePublicHomepage() {
  const publicSite = $("#authView");
  const publicHeader = $("#publicHeader");
  if (!publicSite || !publicHeader) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  publicSite.classList.toggle("public-motion-ready", !reduceMotion);

  const parallaxScenes = $$('[data-parallax-scene]', publicSite);
  const depthNavLinks = $$('#publicDepthNav a[href^="#"]', publicSite);
  const depthSections = depthNavLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);
  let scrollFrame = 0;
  const updateHeader = () => {
    publicHeader.classList.toggle("is-scrolled", window.scrollY > 28);
    const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    publicHeader.style.setProperty("--public-scroll-progress", String(Math.min(1, window.scrollY / scrollable)));
    publicSite.style.setProperty("--public-hero-shift", reduceMotion ? "0px" : `${Math.min(48, window.scrollY * 0.065).toFixed(1)}px`);

    if (!reduceMotion) {
      parallaxScenes.forEach((scene) => {
        const rect = scene.getBoundingClientRect();
        const distance = (rect.top + rect.height / 2 - window.innerHeight / 2) / window.innerHeight;
        const progress = Math.max(-1, Math.min(1, distance));
        scene.style.setProperty("--public-parallax-slow", `${(progress * -13).toFixed(1)}px`);
        scene.style.setProperty("--public-parallax-fast", `${(progress * -27).toFixed(1)}px`);
      });
    }

    if (depthSections.length) {
      let activeSection = depthSections[0];
      depthSections.forEach((section) => {
        if (section.getBoundingClientRect().top <= window.innerHeight * 0.52) activeSection = section;
      });
      depthNavLinks.forEach((link) => {
        link.classList.toggle("is-current", link.getAttribute("href") === `#${activeSection.id}`);
      });
    }
    scrollFrame = 0;
  };
  updateHeader();
  window.addEventListener("scroll", () => {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(updateHeader);
  }, { passive: true });

  const publicNavLinks = $$('a[href^="#"]', publicHeader)
    .filter((link) => link.getAttribute("href") !== "#publicTop");
  const publicNavSections = publicNavLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);
  if ("IntersectionObserver" in window && publicNavSections.length) {
    const navObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        publicNavLinks.forEach((link) => {
          link.classList.toggle("is-current", link.getAttribute("href") === `#${entry.target.id}`);
        });
      });
    }, { rootMargin: "-38% 0px -54%", threshold: 0 });
    publicNavSections.forEach((section) => navObserver.observe(section));
  }

  const revealTargets = $$('[data-reveal]', publicSite);
  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealTargets.forEach((target) => target.classList.add("is-visible"));
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -9%", threshold: 0.12 },
    );
    revealTargets.forEach((target) => observer.observe(target));
  }

  const supportsFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!reduceMotion && supportsFinePointer) {
    let animationFrame = 0;
    publicSite.addEventListener("pointermove", (event) => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        const x = (event.clientX / window.innerWidth - 0.5) * 2;
        const y = (event.clientY / window.innerHeight - 0.5) * 2;
        publicSite.style.setProperty("--public-pointer-x", x.toFixed(3));
        publicSite.style.setProperty("--public-pointer-y", y.toFixed(3));
        publicSite.style.setProperty("--public-cursor-x", `${event.clientX}px`);
        publicSite.style.setProperty("--public-cursor-y", `${event.clientY}px`);
        animationFrame = 0;
      });
    });

    const lakeCard = $("#publicLakeCard", publicSite);
    lakeCard?.addEventListener("pointermove", (event) => {
      const rect = lakeCard.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      lakeCard.style.setProperty("--public-card-tilt-x", `${((0.5 - y) * 7).toFixed(2)}deg`);
      lakeCard.style.setProperty("--public-card-tilt-y", `${((x - 0.5) * 8).toFixed(2)}deg`);
      lakeCard.style.setProperty("--public-card-glow-x", `${(x * 100).toFixed(1)}%`);
      lakeCard.style.setProperty("--public-card-glow-y", `${(y * 100).toFixed(1)}%`);
      lakeCard.style.setProperty("--public-card-glow-opacity", "1");
      lakeCard.style.setProperty("--public-card-layer-x-slow", `${((x - 0.5) * -7).toFixed(1)}px`);
      lakeCard.style.setProperty("--public-card-layer-y-slow", `${((y - 0.5) * -6).toFixed(1)}px`);
      lakeCard.style.setProperty("--public-card-layer-x-fast", `${((x - 0.5) * -15).toFixed(1)}px`);
      lakeCard.style.setProperty("--public-card-layer-y-fast", `${((y - 0.5) * -12).toFixed(1)}px`);
    });
    lakeCard?.addEventListener("pointerleave", () => {
      [
        "--public-card-tilt-x",
        "--public-card-tilt-y",
        "--public-card-layer-x-slow",
        "--public-card-layer-y-slow",
        "--public-card-layer-x-fast",
        "--public-card-layer-y-fast",
      ].forEach((property) => lakeCard.style.removeProperty(property));
      lakeCard.style.setProperty("--public-card-glow-opacity", "0");
    });

    $$(".public-button", publicSite).forEach((button) => {
      button.addEventListener("pointermove", (event) => {
        const rect = button.getBoundingClientRect();
        button.style.setProperty("--magnet-x", `${((event.clientX - rect.left - rect.width / 2) * 0.1).toFixed(1)}px`);
        button.style.setProperty("--magnet-y", `${((event.clientY - rect.top - rect.height / 2) * 0.13).toFixed(1)}px`);
      });
      button.addEventListener("pointerleave", () => {
        button.style.setProperty("--magnet-x", "0px");
        button.style.setProperty("--magnet-y", "0px");
      });
    });

    $$(".public-need-card, .public-safety-grid article", publicSite).forEach((card) => {
      card.addEventListener("pointermove", (event) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--public-hover-x", `${event.clientX - rect.left}px`);
        card.style.setProperty("--public-hover-y", `${event.clientY - rect.top}px`);
      });
    });
  }

  $$(".public-button", publicSite).forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      if (reduceMotion) return;
      const rect = button.getBoundingClientRect();
      const ripple = document.createElement("span");
      ripple.className = "public-button-ripple";
      ripple.style.left = `${event.clientX - rect.left}px`;
      ripple.style.top = `${event.clientY - rect.top}px`;
      button.append(ripple);
      ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
    });
  });

  const rippleCanvas = $("#publicRippleCanvas", publicSite);
  const hero = $("#publicTop", publicSite);
  if (rippleCanvas && hero && !reduceMotion) {
    const context = rippleCanvas.getContext("2d");
    const ripples = [];
    let canvasWidth = 0;
    let canvasHeight = 0;
    let canvasScale = 1;
    let heroVisible = true;
    let rippleFrame = 0;
    let lastFrameTime = performance.now();
    let lastTrailAt = 0;

    const resizeRippleCanvas = () => {
      const rect = hero.getBoundingClientRect();
      canvasScale = Math.min(window.devicePixelRatio || 1, 1.25);
      canvasWidth = Math.max(1, Math.round(rect.width));
      canvasHeight = Math.max(1, Math.round(rect.height));
      rippleCanvas.width = Math.round(canvasWidth * canvasScale);
      rippleCanvas.height = Math.round(canvasHeight * canvasScale);
      context.setTransform(canvasScale, 0, 0, canvasScale, 0, 0);
    };

    const addWaterRipple = (clientX, clientY, strength = 1) => {
      const rect = hero.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (x < 0 || x > rect.width || y < 0 || y > rect.height) return;
      ripples.push({ x, y, radius: 8, life: 1, speed: 50 + strength * 24, strength });
      if (ripples.length > 10) ripples.shift();
    };

    const drawWaterRipples = (time) => {
      if (time - lastFrameTime < 1000 / 30) {
        if (heroVisible) rippleFrame = window.requestAnimationFrame(drawWaterRipples);
        return;
      }
      const delta = Math.min(0.034, Math.max(0.001, (time - lastFrameTime) / 1000));
      lastFrameTime = time;
      context.clearRect(0, 0, canvasWidth, canvasHeight);
      context.globalCompositeOperation = "screen";
      ripples.forEach((ripple) => {
        ripple.radius += ripple.speed * delta;
        ripple.life -= delta * (0.29 + ripple.strength * 0.035);
        const alpha = Math.max(0, ripple.life);
        for (let ring = 0; ring < 3; ring += 1) {
          const ringRadius = ripple.radius + ring * 15;
          context.beginPath();
          context.ellipse(ripple.x, ripple.y, ringRadius * 1.8, ringRadius * 0.46, 0, 0, Math.PI * 2);
          context.strokeStyle = ring === 0
            ? `rgba(78, 139, 149, ${alpha * 0.34})`
            : `rgba(240, 255, 252, ${alpha * (0.31 - ring * 0.055)})`;
          context.lineWidth = Math.max(0.7, 1.8 - ring * 0.35);
          context.shadowColor = `rgba(255, 255, 255, ${alpha * 0.28})`;
          context.shadowBlur = 7;
          context.stroke();
        }
        context.shadowBlur = 0;
      });
      for (let index = ripples.length - 1; index >= 0; index -= 1) {
        if (ripples[index].life <= 0) ripples.splice(index, 1);
      }
      if (heroVisible) rippleFrame = window.requestAnimationFrame(drawWaterRipples);
    };

    const startRippleCanvas = () => {
      if (rippleFrame) return;
      lastFrameTime = performance.now();
      rippleFrame = window.requestAnimationFrame(drawWaterRipples);
    };
    const stopRippleCanvas = () => {
      window.cancelAnimationFrame(rippleFrame);
      rippleFrame = 0;
    };

    resizeRippleCanvas();
    if ("ResizeObserver" in window) new ResizeObserver(resizeRippleCanvas).observe(hero);
    new IntersectionObserver((entries) => {
      heroVisible = entries.some((entry) => entry.isIntersecting);
      if (heroVisible) startRippleCanvas();
      else stopRippleCanvas();
    }, { threshold: 0.01 }).observe(hero);

    hero.addEventListener("pointerdown", (event) => addWaterRipple(event.clientX, event.clientY, 1.4));
    if (supportsFinePointer) {
      hero.addEventListener("pointermove", (event) => {
        if (performance.now() - lastTrailAt < 95) return;
        lastTrailAt = performance.now();
        addWaterRipple(event.clientX, event.clientY, 0.45);
      });
    }
    window.setInterval(() => {
      if (!heroVisible) return;
      const rect = hero.getBoundingClientRect();
      addWaterRipple(rect.left + rect.width * (0.22 + Math.random() * 0.65), rect.top + rect.height * (0.25 + Math.random() * 0.55), 0.7);
    }, 2400);
  }

  const sceneSignal = $("#publicSceneSignal", publicSite);
  if (sceneSignal && !reduceMotion) {
    const messages = [
      "新しいボトルを流しました！",
      "情報・AIに興味があります",
      "湖にいる間だけの呼び名です",
    ];
    let messageIndex = 0;
    window.setInterval(() => {
      sceneSignal.classList.remove("is-changing");
      window.requestAnimationFrame(() => {
        messageIndex = (messageIndex + 1) % messages.length;
        sceneSignal.textContent = messages[messageIndex];
        sceneSignal.classList.add("is-changing");
      });
    }, 4200);
  }
}

function togglePasswordVisibility(button) {
  const input = document.getElementById(button.dataset.passwordToggle);
  if (!input) return;

  const shouldShow = input.type === "password";
  input.type = shouldShow ? "text" : "password";
  button.setAttribute("aria-pressed", String(shouldShow));
  button.setAttribute("aria-label", shouldShow ? "パスワードを隠す" : "パスワードを表示");

  const icon = $("i", button);
  icon?.classList.toggle("ph-eye", !shouldShow);
  icon?.classList.toggle("ph-eye-slash", shouldShow);
}

function showOnly(viewName) {
  $("#authView").hidden = viewName !== "auth";
  $("#onboardingView").hidden = viewName !== "onboarding";
  $("#appView").hidden = viewName !== "app";
  if (viewName !== "auth") closeDialog("authDialog");
}

function routeFromLocation() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash.startsWith("post=")) return { page: "board", postId: hash.slice(5) };
  if (hash === "lake") return { page: "aquarium", postId: null };
  if (["board", "mypage", "aquarium", "admin"].includes(hash)) return { page: hash, postId: null };
  return { page: "aquarium", postId: null };
}

function upsertLocalOwnPresence(status = "social") {
  if (!state.user || !state.profile) return;
  const now = new Date().toISOString();
  const current = state.aquariumPresence.find((item) => item.user_id === state.user.id);
  const next = {
    user_id: state.user.id,
    status: AQUARIUM_STATUS[status] ? status : "social",
    focus_topic: null,
    joined_at: current?.joined_at ?? now,
    heartbeat_at: now,
    updated_at: now,
    profile: state.profile,
  };
  state.aquariumPresence = [next, ...state.aquariumPresence.filter((item) => item.user_id !== state.user.id)];
  state.aquariumPresenceJoined = true;
  renderAquarium();
}

async function enterAquariumPage() {
  state.lastAquariumActivityAt = Date.now();
  state.aquariumIdle = false;
  state.aquariumPreferences.participate_as_fish = true;
  const ownPresence = state.aquariumPresence.find((item) => item.user_id === state.user?.id);
  upsertLocalOwnPresence(ownPresence?.status ?? state.aquariumPreferences.default_status ?? "social");
  try {
    await saveAquariumPreferences({ participate_as_fish: true });
    await ensureAquariumPresence();
  } catch (error) {
    console.error("Aquarium entry failed", error);
    showToast(`湖への接続を確認できませんでした: ${readableError(error)}`, "error");
  }
}

function showPage(pageName, updateHash = true) {
  if (!state.session) return;
  const allowed = state.isAdmin ? ["aquarium", "board", "mypage", "admin"] : ["aquarium", "board", "mypage"];
  const requestedPage = pageName === "home" ? "aquarium" : pageName;
  const nextPage = allowed.includes(requestedPage) ? requestedPage : "aquarium";
  const previousPage = $("#appView").dataset.activePage;

  $("#appView").dataset.activePage = nextPage;

  $$('[data-page]').forEach((page) => {
    const active = page.dataset.page === nextPage;
    page.hidden = !active;
    page.classList.toggle("active", active);
  });
  $$('[data-view]').forEach((button) => {
    const active = button.dataset.view === nextPage;
    button.classList.toggle("active", active);
    if (active) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
  if (updateHash) {
    const nextUrl = new URL(location.href);
    nextUrl.hash = nextPage === "aquarium" ? "lake" : nextPage;
    history.replaceState(null, "", nextUrl);
  }
  if (previousPage === "aquarium" && nextPage !== "aquarium") {
    void leaveAquariumPresence("navigation");
  } else if (nextPage === "aquarium") {
    void enterAquariumPage();
    maybeShowAquariumIntro();
  }
  if (nextPage === "admin") void loadAdminDashboard();
  if (nextPage === "board") renderPosts();
  trackAnalyticsEvent("page_view", { page_key: nextPage });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindStaticEvents() {
  $("#loginTab").addEventListener("click", () => setAuthMode("login"));
  $("#signupTab").addEventListener("click", () => setAuthMode("signup"));
  $$('[data-auth-open]').forEach((button) => {
    button.addEventListener("click", () => openAuthDialog(button.dataset.authOpen));
  });
  initializePublicHomepage();
  $$('[data-password-toggle]').forEach((button) => {
    button.addEventListener("click", () => togglePasswordVisibility(button));
  });
  $("#loginForm").addEventListener("submit", login);
  $("#signupForm").addEventListener("submit", signup);
  $("#profileForm").addEventListener("submit", saveInitialProfile);
  $("#editProfileForm").addEventListener("submit", saveEditedProfile);
  $("#profileGrade").addEventListener("change", () => syncEducationFields("profile"));
  $("#editGrade").addEventListener("change", () => syncEducationFields("edit"));
  syncEducationFields("profile");
  syncEducationFields("edit");

  $$('[data-view]').forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.view));
  });
  $$('[data-view-link]').forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      showPage(link.dataset.viewLink);
    });
  });

  $("#refreshLakeButton").addEventListener("click", async () => {
    if (!IS_PREVIEW_MODE) await loadAquariumData();
    else renderAquarium();
    showToast("湖を更新しました。", "success");
  });
  $("#replyLily").addEventListener("click", openLatestUnreadReply);
  $("#replyInboxButton").addEventListener("click", openLatestUnreadReply);
  $("#closeFishDrawer").addEventListener("click", () => {
    $("#fishDrawer").hidden = true;
    state.selectedFishPresence = null;
  });
  $$("[data-aquarium-status]").forEach((button) => {
    button.addEventListener("click", async () => setAquariumStatus(button.dataset.aquariumStatus));
  });
  $("#receiveReactionsToggle").addEventListener("change", handleReactionPreferenceToggle);
  $("#aquariumQuickMessages").addEventListener("click", (event) => {
    const button = event.target.closest("[data-global-reaction]");
    if (button) void sendAquariumReaction(button.dataset.globalReaction);
  });
  $("#drawerReactionButtons").addEventListener("click", (event) => {
    const button = event.target.closest("[data-direct-reaction]");
    if (button && state.selectedFishPresence) {
      void sendAquariumReaction(button.dataset.directReaction, state.selectedFishPresence.user_id);
    }
  });
  $("#muteFishButton").addEventListener("click", toggleSelectedFishMute);
  $("#mutedUsersList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-unmute-user]");
    if (button) void unmuteUser(button.dataset.unmuteUser);
  });
  $("#closeAquariumIntroButton").addEventListener("click", closeAquariumIntro);

  $("#openComposerButton").addEventListener("click", openComposer);
  $("#postForm").addEventListener("submit", submitPost);
  $("#postExternalUrl").addEventListener("input", (event) => validateExternalUrlInput(event.currentTarget));
  $("#postExternalSiteName").addEventListener("input", () => validateExternalUrlInput($("#postExternalUrl")));
  $("#postBody").addEventListener("input", () => {
    $("#postCharacterCount").textContent = String($("#postBody").value.length);
  });
  $("#categoryFilters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.selectedCategory = button.dataset.category;
    $$(".category-chip", $("#categoryFilters")).forEach((chip) => {
      chip.classList.toggle("active", chip === button);
    });
    renderPosts();
  });
  $("#postSearchInput").addEventListener("input", (event) => {
    applyPostSearch(event.currentTarget.value);
  });
  $("#clearPostSearchButton").addEventListener("click", () => {
    applyPostSearch("");
    $("#postSearchInput").focus();
  });
  $("#postOwnershipFilters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-ownership]");
    if (!button) return;
    state.postOwnership = button.dataset.ownership;
    $$(".ownership-chip", $("#postOwnershipFilters")).forEach((chip) => {
      chip.classList.toggle("active", chip === button);
    });
    renderPosts();
  });
  $("#postList").addEventListener("click", handlePostListClick);
  $("#detailFieldTags").addEventListener("click", (event) => {
    const button = event.target.closest("[data-search-tag]");
    if (!button) return;
    closeDialog("postDialog");
    showPage("board");
    applyPostSearch(button.dataset.searchTag, true);
    window.setTimeout(() => $("#postSearchInput").focus(), 50);
  });
  $("#myPostList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-post-id]");
    if (button) openPost(button.dataset.postId);
  });
  $("#detailLikeButton").addEventListener("click", () => toggleLike(state.selectedPostId));
  $("#editPostButton").addEventListener("click", openPostEditor);
  $("#deletePostButton").addEventListener("click", openPostDeleteConfirmation);
  $("#reportPostButton").addEventListener("click", openPostReport);
  $("#reportForm").addEventListener("submit", submitReport);
  $("#adminRangeForm").addEventListener("submit", (event) => {
    event.preventDefault();
    void loadAdminDashboard(true);
  });
  $("#adminReportList").addEventListener("click", handleAdminAction);
  $("#adminUserList").addEventListener("click", handleAdminAction);
  $("#adminPostModerationList").addEventListener("click", handleAdminAction);
  $("#adminReplyModerationList").addEventListener("click", handleAdminAction);
  $("#editPostForm").addEventListener("submit", saveEditedPost);
  $("#editPostExternalUrl").addEventListener("input", (event) => validateExternalUrlInput(event.currentTarget));
  $("#editPostExternalSiteName").addEventListener("input", () => validateExternalUrlInput($("#editPostExternalUrl")));
  $("#editPostBody").addEventListener("input", () => {
    $("#editPostCharacterCount").textContent = String($("#editPostBody").value.length);
  });
  $("#confirmDeletePostButton").addEventListener("click", deleteSelectedPost);
  $("#replyForm").addEventListener("submit", submitReply);
  $("#replyList").addEventListener("click", handleReplyListClick);
  $("#replyList").addEventListener("submit", saveEditedReply);
  $("#replyList").addEventListener("submit", submitNestedReply);
  $("#editProfileButton").addEventListener("click", openProfileEditor);
  $("#logoutButton").addEventListener("click", logout);

  $$('[data-close-dialog]').forEach((button) => {
    button.addEventListener("click", () => closeDialog(button.dataset.closeDialog));
  });
  $$('dialog').forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog(dialog.id);
    });
    dialog.addEventListener("close", syncBodyModalState);
  });

  ["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
    window.addEventListener(eventName, noteAquariumActivity, { passive: true });
  });
  document.addEventListener("visibilitychange", handleAquariumVisibility);
  window.addEventListener("pagehide", () => void leaveAquariumPresence("pagehide"));
  window.addEventListener("hashchange", () => {
    const route = routeFromLocation();
    showPage(route.page, false);
    if (route.postId) window.setTimeout(() => openPost(route.postId), 0);
  });
}

async function login(event) {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const button = $("button[type='submit']", event.currentTarget);
  setButtonLoading(button, true);

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: $("#loginEmail").value.trim(),
      password: $("#loginPassword").value,
    });
    if (error) throw error;
    showToast("おかえりなさい。", "success");
  } catch (error) {
    showToast(readableError(error), "error");
  } finally {
    setButtonLoading(button, false);
  }
}

async function signup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;

  const password = $("#signupPassword").value;
  if (password !== $("#signupPasswordConfirm").value) {
    showToast("確認用パスワードが一致しません。", "error");
    return;
  }

  const button = $("button[type='submit']", form);
  setButtonLoading(button, true);
  try {
    const redirectUrl = `${location.origin}${location.pathname}`;
    const { data, error } = await supabase.auth.signUp({
      email: $("#signupEmail").value.trim(),
      password,
      options: { emailRedirectTo: redirectUrl },
    });
    if (error) throw error;

    form.reset();
    if (data.session) {
      showToast("登録できました。プロフィールを設定しましょう。", "success");
    } else {
      setAuthMode("login");
      showToast("確認メールを送りました。メール内のリンクを開いてください。", "success");
    }
  } catch (error) {
    showToast(readableError(error), "error");
  } finally {
    setButtonLoading(button, false);
  }
}

function availableProfileFields(publicOnly = false) {
  if (!state.interestsColumnAvailable) {
    return publicOnly ? PROFILE_PUBLIC_FIELDS_WITHOUT_INTERESTS : PROFILE_FIELDS_WITHOUT_INTERESTS;
  }
  if (!state.bioColumnAvailable) {
    return publicOnly ? PROFILE_PUBLIC_FIELDS_WITHOUT_BIO : PROFILE_FIELDS_WITHOUT_BIO;
  }
  return publicOnly ? PROFILE_PUBLIC_FIELDS : PROFILE_FIELDS;
}

async function fetchOwnProfile(userId) {
  let { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_FIELDS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error && isMissingBioColumn(error)) {
    state.bioColumnAvailable = false;
    ({ data, error } = await supabase
      .from("profiles")
      .select(PROFILE_FIELDS_WITHOUT_BIO)
      .eq("user_id", userId)
      .maybeSingle());
  }
  if (error && isMissingInterestsColumn(error)) {
    state.interestsColumnAvailable = false;
    ({ data, error } = await supabase
      .from("profiles")
      .select(PROFILE_FIELDS_WITHOUT_INTERESTS)
      .eq("user_id", userId)
      .maybeSingle());
  }
  if (error) throw error;
  let privateFields = {};
  if (state.analyticsProfileColumnsAvailable) {
    const { data: analyticsFields, error: analyticsError } = await supabase.rpc("get_my_profile_analytics_fields");
    if (analyticsError) {
      if (/get_my_profile_analytics_fields|schema cache|function/i.test(String(analyticsError.message ?? ""))) state.analyticsProfileColumnsAvailable = false;
      else console.error("Private profile fields lookup failed", analyticsError);
    } else {
      privateFields = analyticsFields ?? {};
    }
  }
  return normalizeProfile({ ...data, ...privateFields });
}

async function routeSession(session) {
  const routeVersion = ++state.routeVersion;
  const enteringSignedInApp = Boolean(session) && !state.session;
  state.session = session;
  state.user = session?.user ?? null;

  if (!session) {
    cleanupSignedInState();
    showOnly("auth");
    return;
  }

  try {
    const profile = await fetchOwnProfile(session.user.id);
    if (routeVersion !== state.routeVersion) return;

    state.profile = profile;
    if (!state.profile?.grade || !state.profile?.fish_type) {
      showOnly("onboarding");
      return;
    }

    await loadAdminRole();

    showOnly("app");
    renderProfileIdentity();
    await loadAll();
    if (routeVersion !== state.routeVersion) return;
    const requestedRoute = routeFromLocation();
    const destination = enteringSignedInApp && !requestedRoute.postId ? "aquarium" : requestedRoute.page;
    showPage(destination, enteringSignedInApp && !requestedRoute.postId);
    subscribeToRealtime();
    if (requestedRoute.postId) window.setTimeout(() => openPost(requestedRoute.postId), 0);
  } catch (error) {
    showOnly("auth");
    showToast(`初期データを読めませんでした: ${readableError(error)}`, "error");
  }
}

function cleanupSignedInState() {
  state.profile = null;
  state.isAdmin = false;
  state.adminData = null;
  state.adminLoadedRange = "";
  state.reportTarget = null;
  $$(".admin-only").forEach((element) => { element.hidden = true; });
  state.posts = [];
  state.replies = [];
  state.myPosts = [];
  state.aquariumPresence = [];
  state.aquariumReactions = [];
  state.aquariumPresenceJoined = false;
  state.aquariumAvailable = true;
  state.mutedUserIds.clear();
  state.selectedFishPresence = null;
  state.aquariumIdle = false;
  state.lastAquariumReactionAt = 0;
  state.lastAquariumReactionTargetAt.clear();
  state.lastAnnouncedAquariumReactionId = null;
  state.realtimeReloadKinds.clear();
  state.selectedPostId = null;
  state.selectedCategory = "all";
  state.postSearchQuery = "";
  state.postOwnership = "all";
  state.editingReplyId = null;
  state.replyingToReplyId = null;
  state.likedPostIds.clear();
  state.threadedRepliesAvailable = true;
  $("#postSearchInput").value = "";
  $("#clearPostSearchButton").hidden = true;
  $$(".category-chip", $("#categoryFilters")).forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.category === "all");
  });
  $$(".ownership-chip", $("#postOwnershipFilters")).forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.ownership === "all");
  });
  stopAquariumTimers();
  if (state.realtimeChannel) {
    supabase.removeChannel(state.realtimeChannel);
    state.realtimeChannel = null;
  }
}

async function saveInitialProfile(event) {
  event.preventDefault();
  if (!event.currentTarget.reportValidity() || !state.user) return;
  const button = $("button[type='submit']", event.currentTarget);
  setButtonLoading(button, true);

  try {
    const grade = $("#profileGrade").value;
    const profileFields = {
      grade,
      major: isSchoolGrade(grade) ? null : $("#profileMajor").value.trim() || null,
      interests: parseInterests($("#profileInterests").value),
      fish_type: $("input[name='fishType']:checked").value,
      bio: $("#profileBio").value.trim() || null,
      graduation_year: isUniversityGrade(grade) ? Number($("#profileGraduationYear").value) || null : null,
    };
    if (!state.analyticsProfileColumnsAvailable) delete profileFields.graduation_year;
    if (!state.interestsColumnAvailable) delete profileFields.interests;
    if (!state.bioColumnAvailable) delete profileFields.bio;
    const selectFields = availableProfileFields();

    // Auth登録時のトリガーが作った空のプロフィール行を更新します。
    // upsertでuser_idまで更新すると、変更禁止の主キー権限に触れるため使用しません。
    let { data, error } = await supabase
      .from("profiles")
      .update(profileFields)
      .eq("user_id", state.user.id)
      .select(selectFields)
      .maybeSingle();
    if (error) throw error;

    // 過去の環境などで自動作成トリガーが未設定でも登録できるようにします。
    if (!data) {
      if (state.profile) {
        const permissionError = new Error("プロフィールの更新が許可されていません。Supabaseのプロフィール設定を確認してください。");
        permissionError.code = "PROFILE_UPDATE_BLOCKED";
        throw permissionError;
      }
      ({ data, error } = await supabase
        .from("profiles")
        .insert({ user_id: state.user.id, ...profileFields })
        .select(selectFields)
        .single());
      if (error) throw error;
    }

    state.profile = normalizeProfile({ ...data, graduation_year: profileFields.graduation_year ?? null });
    await loadAdminRole();
    showOnly("app");
    renderProfileIdentity();
    await loadAll();
    showPage("aquarium");
    subscribeToRealtime();
    showToast("あなたの魚が湖に入りました。", "success");
  } catch (error) {
    showToast(readableError(error), "error");
  } finally {
    setButtonLoading(button, false);
  }
}

async function logout() {
  const button = $("#logoutButton");
  setButtonLoading(button, true);
  try {
    if (IS_PREVIEW_MODE) {
      showToast("プレビュー中はログアウトせず、表示をそのまま確認できます。", "info");
      return;
    }
    await leaveAquariumPresence("logout");
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setAuthMode("login");
    showToast("ログアウトしました。", "success");
  } catch (error) {
    showToast(readableError(error), "error");
  } finally {
    setButtonLoading(button, false);
  }
}

async function loadAll() {
  const results = await Promise.allSettled([
    loadPosts(),
    loadReplies(),
    loadMyData(),
    loadAquariumData(),
  ]);
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length) {
    console.error("Data loading failed", failures);
    showToast("一部の情報を読み込めませんでした。更新をお試しください。", "error");
  }
}

async function fetchProfiles(userIds) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return new Map();
  let { data, error } = await supabase
    .from("profiles")
    .select(availableProfileFields(true))
    .in("user_id", uniqueIds);
  if (error && isMissingBioColumn(error)) {
    state.bioColumnAvailable = false;
    ({ data, error } = await supabase
      .from("profiles")
      .select(PROFILE_PUBLIC_FIELDS_WITHOUT_BIO)
      .in("user_id", uniqueIds));
  }
  if (error && isMissingInterestsColumn(error)) {
    state.interestsColumnAvailable = false;
    ({ data, error } = await supabase
      .from("profiles")
      .select(PROFILE_PUBLIC_FIELDS_WITHOUT_INTERESTS)
      .in("user_id", uniqueIds));
  }
  if (error) throw error;
  return new Map((data ?? []).map((profile) => [profile.user_id, normalizeProfile(profile)]));
}

function markAquariumUnavailable(error) {
  if (!isMissingAquariumSchema(error)) return false;
  state.aquariumAvailable = false;
  state.aquariumPresenceJoined = false;
  renderAquarium();
  return true;
}

async function loadAquariumPreferences() {
  if (IS_PREVIEW_MODE) return;
  let { data, error } = await supabase
    .from("aquarium_preferences")
    .select("participate_as_fish,receive_reactions,default_status")
    .eq("user_id", state.user.id)
    .maybeSingle();
  if (error) {
    if (markAquariumUnavailable(error)) return;
    throw error;
  }

  if (!data) {
    ({ data, error } = await supabase
      .from("aquarium_preferences")
      .insert({ participate_as_fish: true, receive_reactions: true, default_status: "social" })
      .select("participate_as_fish,receive_reactions,default_status")
      .single());
    if (error) {
      if (markAquariumUnavailable(error)) return;
      throw error;
    }
  }
  state.aquariumPreferences = {
    ...state.aquariumPreferences,
    ...data,
    participate_as_fish: true,
    default_status: AQUARIUM_STATUS[data.default_status] ? data.default_status : "social",
  };
}

async function saveAquariumPreferences(updates) {
  state.aquariumPreferences = { ...state.aquariumPreferences, ...updates };
  renderAquariumControls();
  if (IS_PREVIEW_MODE || !state.aquariumAvailable) return;

  let { data, error } = await supabase
    .from("aquarium_preferences")
    .update(updates)
    .eq("user_id", state.user.id)
    .select("participate_as_fish,receive_reactions,default_status")
    .maybeSingle();
  if (!error && !data) {
    ({ data, error } = await supabase
      .from("aquarium_preferences")
      .insert({ ...state.aquariumPreferences, ...updates })
      .select("participate_as_fish,receive_reactions,default_status")
      .single());
  }
  if (error) {
    if (markAquariumUnavailable(error)) return;
    throw error;
  }
  state.aquariumPreferences = { ...state.aquariumPreferences, ...data };
}

async function loadAquariumPresence() {
  if (IS_PREVIEW_MODE || !state.aquariumAvailable) {
    renderAquarium();
    return;
  }
  const cutoff = new Date(Date.now() - AQUARIUM_PRESENCE_TTL_SECONDS * 1000).toISOString();
  const { data, error } = await supabase
    .from("aquarium_presence")
    .select("user_id,status,focus_topic,joined_at,heartbeat_at,updated_at")
    .gte("heartbeat_at", cutoff)
    .order("joined_at", { ascending: true })
    .limit(100);
  if (error) {
    if (markAquariumUnavailable(error)) return;
    throw error;
  }
  const profiles = await fetchProfiles((data ?? []).map((presence) => presence.user_id));
  state.aquariumPresence = (data ?? []).map((presence) => ({
    ...presence,
    profile: profiles.get(presence.user_id) ?? null,
  }));
  state.aquariumPresenceJoined = state.aquariumPresence.some((presence) => presence.user_id === state.user.id);
  renderAquarium();
}

async function loadAquariumReactions() {
  if (IS_PREVIEW_MODE || !state.aquariumAvailable) return;
  const cutoff = new Date(Date.now() - 30 * 1000).toISOString();
  const { data, error } = await supabase
    .from("aquarium_reactions")
    .select("id,sender_user_id,target_user_id,message_code,created_at")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) {
    if (markAquariumUnavailable(error)) return;
    throw error;
  }
  const profiles = await fetchProfiles((data ?? []).map((reaction) => reaction.sender_user_id));
  state.aquariumReactions = (data ?? []).map((reaction) => ({
    ...reaction,
    profile: profiles.get(reaction.sender_user_id) ?? null,
  }));
  renderAquarium();
}

async function loadMutedUsers() {
  if (IS_PREVIEW_MODE || !state.aquariumAvailable) {
    renderMutedUsers();
    return;
  }
  const { data, error } = await supabase
    .from("aquarium_mutes")
    .select("muted_user_id")
    .eq("owner_user_id", state.user.id);
  if (error) {
    if (markAquariumUnavailable(error)) return;
    throw error;
  }
  state.mutedUserIds = new Set((data ?? []).map((item) => item.muted_user_id));
  renderMutedUsers();
}

async function loadAquariumData() {
  if (IS_PREVIEW_MODE) {
    renderAquarium();
    return;
  }
  await loadAquariumPreferences();
  if (!state.aquariumAvailable) return;
  await Promise.all([loadAquariumPresence(), loadAquariumReactions(), loadMutedUsers()]);
}

function isAquariumPageActive() {
  return Boolean(
    state.session
    && !$("#appView").hidden
    && $("#appView").dataset.activePage === "aquarium"
    && document.visibilityState !== "hidden"
  );
}

function stopAquariumTimers() {
  if (state.aquariumHeartbeatId) window.clearInterval(state.aquariumHeartbeatId);
  if (state.aquariumExpiryTimerId) window.clearInterval(state.aquariumExpiryTimerId);
  if (state.reactionExpiryTimerId) window.clearInterval(state.reactionExpiryTimerId);
  state.aquariumHeartbeatId = null;
  state.aquariumExpiryTimerId = null;
  state.reactionExpiryTimerId = null;
}

function startAquariumTimers() {
  if (state.aquariumHeartbeatId) return;
  state.aquariumHeartbeatId = window.setInterval(() => void ensureAquariumPresence(), AQUARIUM_HEARTBEAT_INTERVAL_MS);
  state.aquariumExpiryTimerId = window.setInterval(() => {
    if (!isAquariumPageActive()) return;
    state.aquariumPresence = activeAquariumPresence();
    renderAquarium();
    if (!IS_PREVIEW_MODE) void loadAquariumPresence();
  }, 30000);
  state.reactionExpiryTimerId = window.setInterval(() => {
    const cutoff = Date.now() - AQUARIUM_REACTION_VISIBLE_MS;
    if (state.aquariumReactions.some((reaction) => new Date(reaction.created_at).getTime() < cutoff)) {
      renderAquarium();
    }
  }, 1000);
}

async function writeAquariumPresence(status) {
  const safeStatus = AQUARIUM_STATUS[status] ? status : "social";
  upsertLocalOwnPresence(safeStatus);
  if (IS_PREVIEW_MODE) {
    return;
  }

  const payload = { status: safeStatus, focus_topic: null };
  let { data, error } = await supabase
    .from("aquarium_presence")
    .update(payload)
    .eq("user_id", state.user.id)
    .select("user_id,status,focus_topic,joined_at,heartbeat_at,updated_at")
    .maybeSingle();
  if (!error && !data) {
    ({ data, error } = await supabase
      .from("aquarium_presence")
      .insert(payload)
      .select("user_id,status,focus_topic,joined_at,heartbeat_at,updated_at")
      .single());
  }
  if (error) {
    if (markAquariumUnavailable(error)) return;
    throw error;
  }
  const presence = { ...data, profile: state.profile };
  state.aquariumPresence = [presence, ...state.aquariumPresence.filter((item) => item.user_id !== state.user.id)];
  state.aquariumPresenceJoined = true;
  renderAquarium();
}

async function ensureAquariumPresence() {
  if (!state.user || !state.profile || !state.aquariumAvailable) return;
  const idle = Date.now() - state.lastAquariumActivityAt > AQUARIUM_IDLE_TIMEOUT_MS;
  if (idle) state.aquariumIdle = true;
  if (!isAquariumPageActive() || state.aquariumIdle) {
    if (state.aquariumPresenceJoined) await leaveAquariumPresence(state.aquariumIdle ? "idle" : "inactive");
    renderAquariumControls();
    return;
  }

  try {
    const ownPresence = state.aquariumPresence.find((item) => item.user_id === state.user.id);
    const status = ownPresence?.status ?? state.aquariumPreferences.default_status ?? "social";
    await writeAquariumPresence(status);
    startAquariumTimers();
  } catch (error) {
    console.error("Aquarium heartbeat failed", error);
    $("#presenceConnectionStatus").innerHTML = "<span></span>再接続を待っています";
  }
}

async function leaveAquariumPresence(reason = "leave") {
  stopAquariumTimers();
  state.aquariumPresenceJoined = false;
  state.aquariumPresence = state.aquariumPresence.filter((item) => item.user_id !== state.user?.id);
  renderAquarium();
  if (IS_PREVIEW_MODE || !state.user || !state.aquariumAvailable) return;
  try {
    const { error } = await supabase
      .from("aquarium_presence")
      .delete()
      .eq("user_id", state.user.id);
    if (error && !markAquariumUnavailable(error)) throw error;
  } catch (error) {
    console.warn(`Aquarium presence cleanup (${reason}) will fall back to TTL`, error);
  }
  if (["navigation", "hidden"].includes(reason) && isAquariumPageActive() && state.aquariumPreferences.participate_as_fish) {
    void ensureAquariumPresence();
  }
}

function noteAquariumActivity() {
  if (!isAquariumPageActive()) return;
  state.lastAquariumActivityAt = Date.now();
  if (state.aquariumIdle) {
    state.aquariumIdle = false;
    void ensureAquariumPresence();
  }
}

function handleAquariumVisibility() {
  if (document.visibilityState === "hidden") {
    void leaveAquariumPresence("hidden");
  } else if ($("#appView").dataset.activePage === "aquarium") {
    state.lastAquariumActivityAt = Date.now();
    state.aquariumIdle = false;
    void ensureAquariumPresence();
  }
}

async function setAquariumStatus(status) {
  if (!AQUARIUM_STATUS[status]) return;
  await saveAquariumPreferences({ default_status: status });
  await writeAquariumPresence(status);
  renderAquarium();
}

async function handleReactionPreferenceToggle(event) {
  const input = event.currentTarget;
  const checked = input.checked;
  try {
    await saveAquariumPreferences({ receive_reactions: checked });
    showToast(checked ? "リアクションを受け取ります。" : "リアクション受信をオフにしました。", "success");
  } catch (error) {
    input.checked = !checked;
    showToast(readableError(error), "error");
  }
}

async function sendAquariumReaction(messageCode, targetUserId = null) {
  if (!AQUARIUM_REACTIONS[messageCode] || !state.aquariumPresenceJoined) {
    showToast("湖への接続が完了すると定型リアクションを送れます。", "info");
    return;
  }
  const target = targetUserId ? activeAquariumPresence().find((item) => item.user_id === targetUserId) : null;
  if (targetUserId === state.user.id) {
    showToast("自分自身には送れません。", "info");
    return;
  }
  if (targetUserId && !target) {
    showToast("相手は湖を離れたようです。", "info");
    return;
  }
  if (target?.status === "observe") {
    showToast("「見るだけ」の魚には個別リアクションを送れません。", "info");
    return;
  }
  const now = Date.now();
  if (!targetUserId && now - state.lastAquariumReactionAt < AQUARIUM_GLOBAL_REACTION_COOLDOWN_MS) {
    showToast("連続送信を防いでいます。少し待ってから送ってください。", "info");
    return;
  }
  if (targetUserId && now - state.lastAquariumReactionAt < AQUARIUM_DIRECT_REACTION_COOLDOWN_MS) {
    showToast("連続送信を防いでいます。少し待ってから送ってください。", "info");
    return;
  }
  if (targetUserId && now - (state.lastAquariumReactionTargetAt.get(targetUserId) ?? 0) < AQUARIUM_SAME_TARGET_COOLDOWN_MS) {
    showToast("同じ相手への連続送信を防いでいます。少し待ってから送ってください。", "info");
    return;
  }

  try {
    let reaction;
    if (IS_PREVIEW_MODE) {
      reaction = {
        id: `preview-reaction-${Date.now()}`,
        sender_user_id: state.user.id,
        target_user_id: targetUserId,
        message_code: messageCode,
        created_at: new Date().toISOString(),
        profile: state.profile,
      };
    } else {
      const { data, error } = await supabase
        .from("aquarium_reactions")
        .insert({ target_user_id: targetUserId, message_code: messageCode })
        .select("id,sender_user_id,target_user_id,message_code,created_at")
        .single();
      if (error) throw error;
      reaction = { ...data, profile: state.profile };
    }
    state.lastAquariumReactionAt = Date.now();
    if (targetUserId) state.lastAquariumReactionTargetAt.set(targetUserId, state.lastAquariumReactionAt);
    state.aquariumReactions = [reaction, ...state.aquariumReactions.filter((item) => item.id !== reaction.id)];
    renderAquarium();
    // 送信結果は魚の吹き出しで伝え、湖の景色を覆う成功トーストは出さない。
  } catch (error) {
    showToast(readableError(error), "error");
  }
}

async function toggleSelectedFishMute() {
  const selected = state.selectedFishPresence;
  if (!selected || selected.user_id === state.user.id) return;
  if (state.mutedUserIds.has(selected.user_id)) {
    await unmuteUser(selected.user_id);
    return;
  }
  try {
    if (!IS_PREVIEW_MODE) {
      const { error } = await supabase.from("aquarium_mutes").insert({
        owner_user_id: state.user.id,
        muted_user_id: selected.user_id,
      });
      if (error) throw error;
    }
    state.mutedUserIds.add(selected.user_id);
    $("#fishDrawer").hidden = true;
    state.selectedFishPresence = null;
    renderAquarium();
    showToast("この魚の表示とリアクションをミュートしました。", "success");
  } catch (error) {
    showToast(readableError(error), "error");
  }
}

async function unmuteUser(userId) {
  try {
    if (!IS_PREVIEW_MODE) {
      const { error } = await supabase
        .from("aquarium_mutes")
        .delete()
        .eq("owner_user_id", state.user.id)
        .eq("muted_user_id", userId);
      if (error) throw error;
    }
    state.mutedUserIds.delete(userId);
    renderAquarium();
    showToast("ミュートを解除しました。", "success");
  } catch (error) {
    showToast(readableError(error), "error");
  }
}

function maybeShowAquariumIntro() {
  if (!state.profile || $("#aquariumIntroDialog").open) return;
  try {
    if (localStorage.getItem("manabium:aquarium-intro-v1") === "1") return;
  } catch {
    // ストレージが使えない場合も、現在のセッションでは表示できます。
  }
  openDialog("aquariumIntroDialog");
}

function closeAquariumIntro() {
  try {
    localStorage.setItem("manabium:aquarium-intro-v1", "1");
  } catch {
    // 保存できなくてもダイアログは閉じます。
  }
  closeDialog("aquariumIntroDialog");
}

async function fetchPostRows({ userId = null, limit = 60 } = {}) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let query = supabase.from("posts").select(postSelectFields());
    if (userId) query = query.eq("user_id", userId);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
    if (!error) return data ?? [];
    if (!disableUnavailablePostColumn(error)) throw error;
  }
  throw new Error("ボトルのデータ構成を確認できませんでした。");
}

async function loadPosts() {
  const posts = await fetchPostRows({ limit: 60 });

  const profiles = await fetchProfiles((posts ?? []).map((post) => post.user_id));
  const { data: myLikes, error: likesError } = await supabase
    .from("post_likes")
    .select("post_id")
    .eq("user_id", state.user.id);
  if (likesError) throw likesError;

  state.likedPostIds = new Set((myLikes ?? []).map((like) => like.post_id));
  state.posts = (posts ?? []).map((post) => ({
    ...normalizePost(post),
    profile: profiles.get(post.user_id) ?? null,
  }));
  renderPosts();
  renderBottles();
  renderAquariumControls();

  if (state.selectedPostId && $("#postDialog").open) {
    openPost(state.selectedPostId, false);
  }
}

async function loadReplies() {
  let { data: replies, error } = await supabase
    .from("post_replies")
    .select("id,post_id,parent_reply_id,sender_user_id,recipient_user_id,body,is_read,created_at")
    .order("created_at", { ascending: false })
    .limit(240);
  if (error && isMissingParentReplyColumn(error)) {
    state.threadedRepliesAvailable = false;
    ({ data: replies, error } = await supabase
      .from("post_replies")
      .select("id,post_id,sender_user_id,recipient_user_id,body,is_read,created_at")
      .order("created_at", { ascending: false })
      .limit(240));
  }
  if (error) throw error;

  const profiles = await fetchProfiles((replies ?? []).map((reply) => reply.sender_user_id));
  state.replies = (replies ?? []).map((reply) => ({
    ...reply,
    parent_reply_id: reply.parent_reply_id ?? null,
    profile: profiles.get(reply.sender_user_id) ?? null,
  }));
  renderPosts();
  renderBottles();
  renderMyPage();
  if (state.selectedPostId && $("#postDialog").open) renderReplies(state.selectedPostId);
}

async function loadMyData() {
  const { data, error } = await supabase
    .from("posts")
    .select("id,title,category,post_type,like_count,created_at")
    .eq("user_id", state.user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  state.myPosts = data ?? [];
  renderMyPage();
}

function subscribeToRealtime() {
  if (state.realtimeChannel) supabase.removeChannel(state.realtimeChannel);
  state.realtimeChannel = supabase
    .channel(`manabium-${state.user.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => scheduleRealtimeReload("posts"))
    .on("postgres_changes", { event: "*", schema: "public", table: "post_likes" }, () => scheduleRealtimeReload("posts"))
    .on("postgres_changes", { event: "*", schema: "public", table: "post_replies" }, () => scheduleRealtimeReload("replies"))
    .on("postgres_changes", { event: "*", schema: "public", table: "aquarium_presence" }, () => scheduleRealtimeReload("aquarium"))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "aquarium_reactions" }, () => scheduleRealtimeReload("reactions"))
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        renderAquariumControls();
        if ($("#appView").dataset.activePage === "aquarium") void ensureAquariumPresence();
      }
    });
}

function scheduleRealtimeReload(kind) {
  state.realtimeReloadKinds.add(kind);
  window.clearTimeout(state.realtimeReloadTimer);
  state.realtimeReloadTimer = window.setTimeout(async () => {
    try {
      const kinds = new Set(state.realtimeReloadKinds);
      state.realtimeReloadKinds.clear();
      const tasks = [];
      if (kinds.has("posts")) tasks.push(loadPosts(), loadReplies(), loadMyData());
      else if (kinds.has("replies")) tasks.push(loadReplies(), loadMyData());
      if (kinds.has("aquarium")) tasks.push(loadAquariumPresence());
      if (kinds.has("reactions")) tasks.push(loadAquariumReactions());
      await Promise.all(tasks);
    } catch (error) {
      console.error("Realtime refresh failed", error);
    }
  }, 350);
}

function hashNumber(value) {
  return [...String(value)].reduce((total, character) => ((total << 5) - total + character.charCodeAt(0)) | 0, 0);
}

function createLakeRipple(source) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const surface = $("#lakeSurface");
  if (!surface || !source) return;

  const surfaceRect = surface.getBoundingClientRect();
  const sourceRect = source.getBoundingClientRect();
  const ripple = document.createElement("span");
  ripple.className = "lake-tap-ripple";
  ripple.style.left = `${sourceRect.left + sourceRect.width / 2 - surfaceRect.left}px`;
  ripple.style.top = `${sourceRect.top + sourceRect.height / 2 - surfaceRect.top}px`;
  ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  surface.append(ripple);
  window.setTimeout(() => ripple.remove(), 1300);
}

function renderLake() {
  const layer = $("#fishLayer");
  layer.replaceChildren();
  const presence = activeAquariumPresence();
  const visiblePresence = visibleAquariumPresence();
  $("#aquariumUserCount").textContent = String(presence.length);
  $("#aquariumSocialCount").textContent = String(presence.filter((item) => item.status === "social").length);
  $("#lakeEmpty").hidden = visiblePresence.length > 0;
  const emptyCopy = $("#lakeEmpty p");
  if (emptyCopy) {
    emptyCopy.innerHTML = "<strong>いまは静かな湖です</strong><span>あなたの魚がここで仲間を待っています。</span>";
  }

  visiblePresence.forEach((presenceItem, index) => {
    const profile = presenceItem.profile ?? { fish_type: "aqua", grade: "—", major: "—", interests: [] };
    const visitName = lakeVisitName(presenceItem);
    const fish = FISH[profile.fish_type] ?? FISH.aqua;
    const seed = Math.abs(hashNumber(presenceItem.user_id));
    const phoneLayout = window.matchMedia("(max-width: 760px)").matches;
    const columns = phoneLayout ? 3 : 4;
    const column = index % columns;
    const row = Math.floor(index / columns);
    const motionSeed = seed + (index + 1) * 7919;
    const horizontalDirection = column === columns - 1 || column % 2 === 1 ? -1 : 1;
    const routeDistance = phoneLayout ? 34 + (motionSeed % 20) : 72 + (motionSeed % 54);
    const routeHeight = -22 + ((motionSeed * 3) % 45);
    const duration = 27 + (seed % 11);
    const bodyDuration = 5.2 + ((seed % 7) * 0.24);
    const timelineSeconds = Date.now() / 1000;
    const similarity = profileSimilarity(profile);
    const isMe = presenceItem.user_id === state.user?.id;
    const status = AQUARIUM_STATUS[presenceItem.status] ?? AQUARIUM_STATUS.social;
    const recentReaction = state.aquariumPreferences.receive_reactions && state.aquariumReactions.find((reaction) => {
      const isFishSpeaking = !reaction.target_user_id && reaction.sender_user_id === presenceItem.user_id;
      const isReactionToFish = reaction.target_user_id === presenceItem.user_id;
      return (isFishSpeaking || isReactionToFish)
        && !state.mutedUserIds.has(reaction.sender_user_id)
        && Date.now() - new Date(reaction.created_at).getTime() <= AQUARIUM_REACTION_VISIBLE_MS;
    });
    const fishIsSpeaking = Boolean(
      recentReaction
      && !recentReaction.target_user_id
      && recentReaction.sender_user_id === presenceItem.user_id
    );
    const announcesBottle = fishIsSpeaking && BOTTLE_ANNOUNCEMENT_CODES.has(recentReaction?.message_code);
    const mobileBubblePosition = phoneLayout && row === 0
      ? ` is-top-row${column === columns - 1 ? " is-side-left" : ""}`
      : "";
    const reactionBubble = recentReaction
      ? `<span class="fish-reaction-bubble ${fishIsSpeaking ? "is-fish-voice" : "is-direct-reaction"}${announcesBottle ? " is-bottle-notice" : ""}${mobileBubblePosition}">
          ${fishIsSpeaking ? "" : `<small>湖の仲間から</small>`}
          <span>${escapeHTML(reactionText(recentReaction.message_code, recentReaction.profile))}</span>
          ${announcesBottle ? '<i class="ph ph-envelope-simple-open" aria-hidden="true"></i>' : ""}
        </span>`
      : "";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "swimming-fish";
    button.dataset.fishUserId = presenceItem.user_id;
    button.classList.toggle("is-me", isMe);
    button.classList.toggle("is-similar", !isMe && similarity >= 22);
    button.classList.add(status.className);
    button.setAttribute("aria-label", `${visitName}、${status.label}。プロフィールを見る${announcesBottle ? "。新しいボトルのお知らせがあります" : ""}`);
    button.style.setProperty("--top", `${phoneLayout ? 18 + row * 19 : 17 + row * 25}%`);
    button.style.setProperty("--static-left", `${phoneLayout ? 6 + column * 30 : 7 + column * 22}%`);
    button.style.setProperty("--route-x-one", `${Math.round(horizontalDirection * routeDistance * 0.34)}px`);
    button.style.setProperty("--route-y-one", `${Math.round(routeHeight * 0.36)}px`);
    button.style.setProperty("--route-x-two", `${Math.round(horizontalDirection * routeDistance * 0.7)}px`);
    button.style.setProperty("--route-y-two", `${Math.round(routeHeight * 0.76)}px`);
    button.style.setProperty("--route-x-three", `${horizontalDirection * routeDistance}px`);
    button.style.setProperty("--route-y-three", `${routeHeight}px`);
    button.style.setProperty("--return-y-one", `${Math.round(routeHeight * 0.3)}px`);
    button.style.setProperty("--return-y-two", `${Math.round(routeHeight * 0.68)}px`);
    button.style.setProperty("--delay", `${-((timelineSeconds + seed * 0.17) % duration)}s`);
    button.style.setProperty("--duration", `${duration}s`);
    button.style.setProperty("--body-duration", `${bodyDuration}s`);
    button.style.setProperty("--body-delay", `${-((timelineSeconds + seed * 0.11) % bodyDuration)}s`);
    button.style.setProperty("--fish-filter", fish.filter);
    button.innerHTML = `
      ${reactionBubble}
      <span class="fish-motion"><img class="fish-asset" src="${FISH_ASSET_URL}" alt="" /></span>
      <span class="fish-label"><strong>${escapeHTML(visitName)}</strong><small><span class="status-orb ${status.className}"></span>${status.label}</small></span>`;
    button.addEventListener("click", (event) => {
      createLakeRipple(button);
      openFishDrawer(presenceItem);
    });
    layer.append(button);
  });
}

function renderAquariumControls() {
  const ownPresence = activeAquariumPresence().find((item) => item.user_id === state.user?.id);
  const statusName = ownPresence?.status ?? state.aquariumPreferences.default_status ?? "social";
  $$("[data-aquarium-status]").forEach((button) => {
    button.classList.toggle("active", button.dataset.aquariumStatus === statusName);
  });
  $("#receiveReactionsToggle").checked = state.aquariumPreferences.receive_reactions;
  $("#receiveReactionsToggle").disabled = !state.aquariumAvailable;
  $("#aquariumSetupNotice").hidden = state.aquariumAvailable;
  $$("#aquariumQuickMessages [data-global-reaction]").forEach((button) => {
    button.disabled = !state.aquariumPresenceJoined;
  });
  const hasOwnBottle = state.posts.some((post) => post.user_id === state.user?.id);
  $$('[data-global-reaction]', $("#aquariumQuickMessages")).forEach((button) => {
    if (!BOTTLE_ANNOUNCEMENT_CODES.has(button.dataset.globalReaction)) return;
    button.disabled = !state.aquariumPresenceJoined || !hasOwnBottle;
    button.title = hasOwnBottle ? "あなたの公開ボトルへ湖の仲間を案内します" : "ボトルを投稿すると使えます";
  });
  const shareableInterests = parseInterests(state.profile?.interests);
  if (!shareableInterests.length && state.profile?.major) shareableInterests.push(state.profile.major);
  $("#interestMessageLabel").hidden = shareableInterests.length === 0;
  $$('[data-interest-slot]', $("#aquariumQuickMessages")).forEach((button) => {
    const interest = shareableInterests[Number(button.dataset.interestSlot)];
    button.hidden = !interest;
    if (interest) button.textContent = `${interest}に興味あり`;
  });

  const connection = $("#presenceConnectionStatus");
  if (!state.aquariumAvailable) connection.innerHTML = "<span></span>追加SQLの実行を待っています";
  else if (state.aquariumIdle) connection.innerHTML = "<span></span>離席中です。操作すると戻ります";
  else if (state.aquariumPresenceJoined) connection.innerHTML = "<span></span>湖につながっています";
  else connection.innerHTML = "<span></span>湖につないでいます…";
}

function renderAquariumBroadcasts() {
  const layer = $("#aquariumBroadcastLayer");
  if (!state.aquariumPreferences.receive_reactions) {
    layer.textContent = "";
    return;
  }
  const cutoff = Date.now() - AQUARIUM_REACTION_VISIBLE_MS;
  const latestReaction = state.aquariumReactions.find((reaction) => (
      !reaction.target_user_id
      && new Date(reaction.created_at).getTime() >= cutoff
      && !state.mutedUserIds.has(reaction.sender_user_id)
    ));
  if (!latestReaction) {
    layer.textContent = "";
    return;
  }
  if (state.lastAnnouncedAquariumReactionId === latestReaction.id) return;
  state.lastAnnouncedAquariumReactionId = latestReaction.id;
  const senderPresence = activeAquariumPresence().find((presence) => presence.user_id === latestReaction.sender_user_id);
  layer.textContent = `${lakeVisitName(senderPresence)}：${reactionText(latestReaction.message_code, latestReaction.profile)}`;
}

function renderMutedUsers() {
  const container = $("#mutedUsersList");
  container.replaceChildren();
  if (!state.mutedUserIds.size) {
    container.innerHTML = "<span>いません</span>";
    return;
  }
  [...state.mutedUserIds].forEach((userId) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.unmuteUser = userId;
    button.textContent = "ミュート中の魚を解除";
    container.append(button);
  });
}

function renderAquarium() {
  renderLake();
  renderAquariumControls();
  renderAquariumBroadcasts();
  renderMutedUsers();
}

function bottlePreviewExcerpt(post) {
  const text = String(post.body ?? "").replace(/\s+/g, " ").trim();
  return text.length > 86 ? `${text.slice(0, 86)}…` : text;
}

function renderBottles() {
  const layer = $("#bottleLayer");
  if (!layer) return;
  layer.replaceChildren();
  const phoneLayout = window.matchMedia("(max-width: 760px)").matches;
  const timelineSeconds = Date.now() / 1000;
  visibleLakePosts().slice(0, phoneLayout ? 3 : MAX_LAKE_POSTS).forEach((post, index) => {
    const seed = Math.abs(hashNumber(post.id));
    const duration = 18 + ((seed % 7) * 1.15);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "floating-bottle";
    button.classList.toggle("is-similar", profileSimilarity(post.profile) >= 22 || postRelevance(post) >= 34);
    button.setAttribute("aria-label", `投稿「${post.title}」を読む`);
    const left = phoneLayout ? 8 + ((seed + index * 19) % 64) : 8 + ((seed + index * 19) % 76);
    button.style.left = `${left}%`;
    button.style.top = `${17 + ((seed + index * 11) % 60)}%`;
    const rotation = -14 + (seed % 29);
    button.style.setProperty("--rotation", `${rotation}deg`);
    button.style.setProperty("--inverse-rotation", `${-rotation}deg`);
    button.style.setProperty("--delay", `${-((timelineSeconds + seed * 0.13) % duration)}s`);
    button.style.setProperty("--bottle-duration", `${duration}s`);
    button.style.setProperty("--bottle-x-one", `${5 + (seed % 7)}px`);
    button.style.setProperty("--bottle-x-two", `${-4 - (seed % 6)}px`);
    button.style.setProperty("--bottle-y-one", `${-5 - (seed % 6)}px`);
    button.style.setProperty("--bottle-y-two", `${-9 - (seed % 7)}px`);
    button.style.setProperty("--bottle-sway", `${1.8 + ((seed % 5) * 0.35)}deg`);

    const preview = document.createElement("span");
    preview.id = `bottle-preview-${post.id}`;
    preview.className = "bottle-hover-preview";
    preview.classList.toggle("opens-left", left > 52);
    preview.setAttribute("role", "tooltip");
    preview.innerHTML = `
      <span class="bottle-hover-badges">
        <span>${escapeHTML(post.category)}</span>
        <span>${escapeHTML(post.post_type)}</span>
        ${normalizeExternalUrl(post.external_url) ? '<span class="has-link"><i class="ph ph-link-simple" aria-hidden="true"></i> リンクあり</span>' : ""}
      </span>
      <strong>${escapeHTML(post.title)}</strong>
      <span class="bottle-hover-excerpt">${escapeHTML(bottlePreviewExcerpt(post))}</span>
      <small><i class="ph ph-arrow-square-out" aria-hidden="true"></i> クリックしてボトルを読む</small>`;
    button.setAttribute("aria-describedby", preview.id);
    button.append(preview);
    button.addEventListener("click", () => {
      createLakeRipple(button);
      openPost(post.id);
    });
    layer.append(button);
  });

  renderReplyLily();
}

function unreadRepliesForCurrentUser() {
  return state.replies
    .filter((reply) => (
      reply.recipient_user_id === state.user?.id
      && reply.sender_user_id !== state.user?.id
      && !reply.is_read
    ))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function renderReplyLily() {
  const lilyButton = $("#replyLily");
  const inboxButton = $("#replyInboxButton");
  if (!lilyButton || !inboxButton) return;
  const unreadReplies = unreadRepliesForCurrentUser();
  const count = unreadReplies.length;
  lilyButton.hidden = count === 0;
  inboxButton.hidden = count === 0;
  $("#replyLilyCount").textContent = count > 99 ? "99+" : String(count);
  $("#replyInboxCount").textContent = count > 99 ? "99+" : String(count);
  const ariaLabel = `届いた返事が${count}件あります。最新の返事を読む`;
  lilyButton.setAttribute("aria-label", ariaLabel);
  inboxButton.setAttribute("aria-label", ariaLabel);
}

async function openLatestUnreadReply() {
  const reply = unreadRepliesForCurrentUser()[0];
  if (!reply) {
    renderReplyLily();
    return;
  }
  createLakeRipple($("#replyLily"));
  await openReplyBottle(reply);
}

async function openReplyBottle(reply) {
  openPost(reply.post_id);
  const unreadThreadReplies = unreadRepliesForCurrentUser().filter((item) => item.post_id === reply.post_id);
  if (!unreadThreadReplies.length) return;

  try {
    if (IS_PREVIEW_MODE) {
      unreadThreadReplies.forEach((item) => { item.is_read = true; });
      renderBottles();
      return;
    }
    const { error } = await supabase
      .from("post_replies")
      .update({ is_read: true })
      .eq("post_id", reply.post_id)
      .eq("recipient_user_id", state.user.id)
      .eq("is_read", false);
    if (error) throw error;
    await loadReplies();
  } catch (error) {
    console.error("Failed to mark reply as read", error);
  }
}

function openFishDrawer(presence) {
  const profile = presence.profile ?? { grade: "—", major: "—", fish_type: "aqua", interests: [] };
  const fish = FISH[profile.fish_type] ?? FISH.aqua;
  const isMe = presence.user_id === state.user?.id;
  const status = AQUARIUM_STATUS[presence.status] ?? AQUARIUM_STATUS.social;
  const matchBadge = $("#drawerMatchBadge");
  state.selectedFishPresence = presence;
  $("#drawerFish").src = FISH_ASSET_URL;
  $("#drawerFish").style.filter = fish.filter;
  $("#drawerName").textContent = lakeVisitName(presence);
  $("#drawerMeta").textContent = [
    profile.grade || "区分未設定",
    profile.major || parseInterests(profile.interests)[0] || "分野未設定",
  ].filter(Boolean).join("・");
  const interests = parseInterests(profile.interests);
  $("#drawerInterests").innerHTML = interests.map((interest) => `<span>${escapeHTML(interest)}</span>`).join("");
  $("#drawerInterests").hidden = interests.length === 0;
  $("#drawerBio").textContent = profile.bio ?? "";
  $("#drawerBio").hidden = !profile.bio;
  matchBadge.hidden = isMe || profileSimilarity(profile) < 22;
  $("#drawerStatus").innerHTML = `<span class="status-orb ${status.className}"></span>${status.label}`;
  $("#drawerElapsed").textContent = `湖に来て ${formatShortDuration(Date.now() - new Date(presence.joined_at).getTime())}`;
  const reactionSection = $("#drawerReactionSection");
  const hint = $("#drawerReactionHint");
  reactionSection.hidden = isMe || presence.status === "observe";
  $("#muteFishButton").hidden = isMe;
  $$("[data-direct-reaction]", $("#drawerReactionButtons")).forEach((button) => { button.disabled = false; });
  if (isMe) hint.textContent = "自分のプロフィールです。";
  else if (presence.status === "observe") hint.textContent = "見るだけの魚には個別リアクションを送れません。";
  else hint.textContent = "短時間の連続送信は自動で制限されます。";
  $("#fishDrawer").hidden = false;
}

function renderPosts() {
  const searchTerms = normalizeSearchText(state.postSearchQuery).split(" ").filter(Boolean);
  const visiblePosts = state.posts.filter((post) => {
    if (state.selectedCategory !== "all" && post.category !== state.selectedCategory) return false;
    const isOwn = post.user_id === state.user?.id;
    if (state.postOwnership === "mine" && !isOwn) return false;
    if (state.postOwnership === "others" && isOwn) return false;
    if (searchTerms.length && !searchTerms.every((term) => searchablePostText(post).includes(term))) return false;
    return true;
  });
  const list = $("#postList");
  const boardIsVisible = $("#appView").dataset.activePage === "board";
  const summary = $("#postResultsSummary");
  const hasFilters = state.selectedCategory !== "all" || state.postOwnership !== "all" || searchTerms.length > 0;
  list.replaceChildren();
  $("#postEmpty").hidden = visiblePosts.length > 0;
  summary.textContent = hasFilters
    ? `${visiblePosts.length}件のボトルが見つかりました`
    : `${visiblePosts.length}件のボトルが流れています`;
  $("#postEmptyTitle").textContent = state.posts.length ? "条件に合うボトルがありません" : "まだボトルがありません";
  $("#postEmptyMessage").textContent = state.posts.length
    ? "検索する言葉や絞り込み条件を変えてみてください。"
    : "最初のメッセージを湖へ流してみましょう。";

  visiblePosts.forEach((post) => {
    const card = document.createElement("article");
    card.className = "post-card";
    card.style.setProperty("--card-wash", CATEGORY_COLORS[post.category] ?? CATEGORY_COLORS.授業);
    const isOwn = post.user_id === state.user?.id;
    card.classList.toggle("is-own-post", isOwn);
    const liked = state.likedPostIds.has(post.id);
    const replyCount = state.replies.filter((reply) => reply.post_id === post.id).length;
    const author = isOwn ? "あなた" : "匿名の魚";
    const excerpt = post.body.length > 130 ? `${post.body.slice(0, 130)}…` : post.body;
    const fieldTags = parseFieldTags(post.field_tags);
    const hasExternalLink = Boolean(normalizeExternalUrl(post.external_url));
    const fieldTagsMarkup = fieldTags.length
      ? `<div class="post-field-tags" aria-label="関連分野">${fieldTags.map((tag) => `<button class="post-field-tag" type="button" data-search-tag="${escapeHTML(tag)}">${escapeHTML(tag)}</button>`).join("")}</div>`
      : "";
    card.innerHTML = `
      <button class="post-open-button" type="button" data-action="open" data-post-id="${post.id}">
        <span class="post-badges">
          <span class="post-badge">${escapeHTML(post.category)}</span>
          <span class="post-badge type">${escapeHTML(post.post_type)}</span>
          ${hasExternalLink ? '<span class="post-badge link"><i class="ph ph-link-simple" aria-hidden="true"></i> 公式リンクあり</span>' : ""}
          ${isOwn ? '<span class="post-badge owner"><i class="ph ph-user" aria-hidden="true"></i> 自分のボトル</span>' : ""}
        </span>
        <h2>${escapeHTML(post.title)}</h2>
        <p class="post-excerpt">${escapeHTML(excerpt)}</p>
      </button>
      ${fieldTagsMarkup}
      <div class="post-footer">
        <p class="post-meta">${escapeHTML(author)}・${formatRelativeDate(post.created_at)}</p>
        <div class="post-reactions">
          <span class="reply-summary"><i class="ph ph-chat-circle-dots" aria-hidden="true"></i> ${replyCount}</span>
          <button class="like-button ${liked ? "liked" : ""}" type="button" data-action="like" data-post-id="${post.id}" aria-label="いいね">
            <span aria-hidden="true">♡</span> ${Number(post.like_count) || 0}
          </button>
        </div>
      </div>`;
    list.append(card);
  });
  if (boardIsVisible) visiblePosts.slice(0, 30).forEach((post) => {
    const impressionKey = `bottle:${post.id}`;
    if (state.analyticsImpressions.has(impressionKey)) return;
    state.analyticsImpressions.add(impressionKey);
    trackAnalyticsEvent("content_impression", { page_key: "board", content_type: "bottle", content_id: post.id });
  });
}

async function handlePostListClick(event) {
  const tagButton = event.target.closest("[data-search-tag]");
  if (tagButton) {
    applyPostSearch(tagButton.dataset.searchTag, true);
    $("#postSearchInput").focus();
    return;
  }
  const button = event.target.closest("[data-action][data-post-id]");
  if (!button) return;
  if (button.dataset.action === "open") openPost(button.dataset.postId);
  if (button.dataset.action === "like") {
    button.disabled = true;
    await toggleLike(button.dataset.postId);
    button.disabled = false;
  }
}

function openComposer() {
  $("#postExternalUrl").setCustomValidity("");
  openDialog("composerDialog");
  window.setTimeout(() => $("#postTitle").focus(), 50);
}

function availablePostMutationPayload(payload) {
  const nextPayload = { ...payload };
  if (!state.postFieldTagsColumnAvailable) delete nextPayload.field_tags;
  if (!state.postExternalUrlColumnAvailable) delete nextPayload.external_url;
  if (!state.postExternalSiteNameColumnAvailable) delete nextPayload.external_site_name;
  return nextPayload;
}

async function persistPostMutation(payload, postId = null) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const nextPayload = availablePostMutationPayload(payload);
    const query = postId
      ? supabase.from("posts").update(nextPayload).eq("id", postId).eq("user_id", state.user.id)
      : supabase.from("posts").insert(nextPayload);
    const { error } = await query;
    if (!error) return;
    if (!disableUnavailablePostColumn(error)) throw error;
  }
  throw new Error("ボトルの保存に必要なデータ構成を確認できませんでした。");
}

async function submitPost(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const externalUrlInput = $("#postExternalUrl");
  const externalUrl = validateExternalUrlInput(externalUrlInput);
  const externalSiteName = normalizeExternalSiteName($("#postExternalSiteName").value);
  if (externalSiteName && !externalUrl && !externalUrlInput.value.trim()) {
    externalUrlInput.setCustomValidity("サイト名を入力した場合は、URLも入力してください。");
  }
  if (!form.reportValidity()) return;
  const button = $("#submitPostButton");
  setButtonLoading(button, true);
  try {
    if (IS_PREVIEW_MODE) {
      const post = {
        id: `preview-post-${Date.now()}`,
        user_id: state.user.id,
        title: $("#postTitle").value.trim(),
        body: $("#postBody").value.trim(),
        category: $("#postCategory").value,
        post_type: $("#postType").value,
        field_tags: parseFieldTags($("#postFields").value),
        external_url: externalUrl,
        external_site_name: externalUrl ? externalSiteName : "",
        like_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        profile: state.profile,
      };
      state.posts.unshift(post);
      state.myPosts.unshift(post);
      form.reset();
      $("#postCharacterCount").textContent = "0";
      closeDialog("composerDialog");
      renderPosts();
      renderBottles();
      renderAquariumControls();
      renderMyPage();
      showToast("ボトルを湖へ流しました。", "success");
      return;
    }
    const payload = {
      user_id: state.user.id,
      title: $("#postTitle").value.trim(),
      body: $("#postBody").value.trim(),
      category: $("#postCategory").value,
      post_type: $("#postType").value,
      field_tags: parseFieldTags($("#postFields").value),
      external_url: externalUrl || null,
      external_site_name: externalUrl ? (externalSiteName || null) : null,
    };
    await persistPostMutation(payload);
    form.reset();
    $("#postCharacterCount").textContent = "0";
    closeDialog("composerDialog");
    await Promise.all([loadPosts(), loadMyData()]);
    showToast(
      externalUrl && !state.postExternalUrlColumnAvailable
        ? "ボトルを流しました。公式リンクの保存にはSupabaseの追加SQLが必要です。"
        : externalUrl && externalSiteName && !state.postExternalSiteNameColumnAvailable
          ? "ボトルを流しました。サイト名の保存にはSupabaseの追加SQLが必要です。"
        : !state.postFieldTagsColumnAvailable
          ? "ボトルを流しました。関連分野の保存にはSupabaseの追加SQLが必要です。"
          : "ボトルを湖へ流しました。",
      state.postFieldTagsColumnAvailable
        && (!externalUrl || state.postExternalUrlColumnAvailable)
        && (!externalSiteName || state.postExternalSiteNameColumnAvailable) ? "success" : "info",
    );
  } catch (error) {
    showToast(readableError(error), "error");
  } finally {
    setButtonLoading(button, false);
  }
}

function openPost(postId, show = true) {
  const post = state.posts.find((item) => item.id === postId);
  if (!post) return;
  if (show || state.selectedPostId !== post.id) {
    state.editingReplyId = null;
    state.replyingToReplyId = null;
  }
  state.selectedPostId = post.id;
  const isOwner = post.user_id === state.user.id;
  $("#detailBadges").innerHTML = `<span class="post-badge">${escapeHTML(post.category)}</span><span class="post-badge type">${escapeHTML(post.post_type)}</span>${isOwner ? '<span class="post-badge owner"><i class="ph ph-user" aria-hidden="true"></i> 自分のボトル</span>' : ""}`;
  $("#detailTitle").textContent = post.title;
  $("#detailMeta").textContent = `${isOwner ? "あなた" : "匿名の魚"}・${post.profile?.grade ?? "学年未設定"}・${formatRelativeDate(post.created_at)}`;
  const detailFieldTags = parseFieldTags(post.field_tags);
  $("#detailFieldTags").innerHTML = detailFieldTags.map((tag) => `<button class="post-field-tag" type="button" data-search-tag="${escapeHTML(tag)}">${escapeHTML(tag)}</button>`).join("");
  $("#detailFieldTags").hidden = detailFieldTags.length === 0;
  renderTextWithLinks($("#detailBody"), post.body);
  renderPostExternalLink($("#detailExternalLink"), post.external_url, post.external_site_name);
  const liked = state.likedPostIds.has(post.id);
  const likeButton = $("#detailLikeButton");
  likeButton.classList.toggle("liked", liked);
  likeButton.innerHTML = `<span aria-hidden="true">♡</span> ${Number(post.like_count) || 0} いいね`;
  $("#postOwnerActions").hidden = !isOwner;
  $("#reportPostButton").hidden = isOwner;
  $("#replyForm").hidden = isOwner;
  $("#replyOwnerNotice").hidden = !isOwner;
  renderReplies(post.id);
  if (show) trackAnalyticsEvent("content_detail_view", { page_key: "board", content_type: "bottle", content_id: post.id });
  if (show) openDialog("postDialog");
}

function openPostReport() {
  const post = state.posts.find((item) => item.id === state.selectedPostId);
  if (!post || post.user_id === state.user?.id) return;
  state.reportTarget = { type: "post", id: post.id };
  $("#reportForm").reset();
  openDialog("reportDialog");
}

async function submitReport(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity() || !state.reportTarget) return;
  const button = $("button[type='submit']", form);
  setButtonLoading(button, true);
  try {
    const { error } = await supabase.from("content_reports").insert({
      target_type: state.reportTarget.type,
      target_id: state.reportTarget.id,
      reason: $("#reportReason").value,
      detail: $("#reportDetail").value.trim() || null,
    });
    if (error) throw error;
    closeDialog("reportDialog");
    state.reportTarget = null;
    showToast("運営へ知らせました。確認までお待ちください。", "success");
  } catch (error) {
    const duplicate = String(error?.code ?? "") === "23505";
    showToast(duplicate ? "この内容はすでに通報済みです。" : readableError(error), duplicate ? "info" : "error");
  } finally {
    setButtonLoading(button, false);
  }
}

function selectedOwnedPost() {
  return state.posts.find((post) => post.id === state.selectedPostId && post.user_id === state.user?.id) ?? null;
}

function openPostEditor() {
  const post = selectedOwnedPost();
  if (!post) {
    showToast("このボトルは編集できません。", "error");
    return;
  }
  $("#editPostCategory").value = post.category;
  $("#editPostType").value = post.post_type;
  $("#editPostFields").value = parseFieldTags(post.field_tags).join("、");
  $("#editPostTitle").value = post.title;
  $("#editPostExternalUrl").value = post.external_url ?? "";
  $("#editPostExternalSiteName").value = post.external_site_name ?? "";
  $("#editPostExternalUrl").setCustomValidity("");
  $("#editPostBody").value = post.body;
  $("#editPostCharacterCount").textContent = String(post.body.length);
  closeDialog("postDialog");
  openDialog("editPostDialog");
  window.setTimeout(() => $("#editPostTitle").focus(), 50);
}

async function saveEditedPost(event) {
  event.preventDefault();
  const externalUrlInput = $("#editPostExternalUrl");
  const externalUrl = validateExternalUrlInput(externalUrlInput);
  const externalSiteName = normalizeExternalSiteName($("#editPostExternalSiteName").value);
  if (externalSiteName && !externalUrl && !externalUrlInput.value.trim()) {
    externalUrlInput.setCustomValidity("サイト名を入力した場合は、URLも入力してください。");
  }
  if (!event.currentTarget.reportValidity()) return;
  const post = selectedOwnedPost();
  if (!post) {
    closeDialog("editPostDialog");
    showToast("このボトルは編集できません。", "error");
    return;
  }

  const updates = {
    category: $("#editPostCategory").value,
    post_type: $("#editPostType").value,
    field_tags: parseFieldTags($("#editPostFields").value),
    title: $("#editPostTitle").value.trim(),
    body: $("#editPostBody").value.trim(),
    external_url: externalUrl,
    external_site_name: externalUrl ? externalSiteName : "",
    updated_at: new Date().toISOString(),
  };
  const button = $("#saveEditedPostButton");
  setButtonLoading(button, true);

  try {
    if (IS_PREVIEW_MODE) {
      Object.assign(post, updates);
      const myPost = state.myPosts.find((item) => item.id === post.id);
      if (myPost && myPost !== post) Object.assign(myPost, updates);
      closeDialog("editPostDialog");
      renderPosts();
      renderBottles();
      renderMyPage();
      openPost(post.id);
      showToast("ボトルの内容を更新しました。", "success");
      return;
    }

    const payload = {
      category: updates.category,
      post_type: updates.post_type,
      title: updates.title,
      body: updates.body,
      field_tags: updates.field_tags,
      external_url: updates.external_url || null,
      external_site_name: updates.external_url ? (updates.external_site_name || null) : null,
    };
    await persistPostMutation(payload, post.id);
    closeDialog("editPostDialog");
    await Promise.all([loadPosts(), loadMyData()]);
    openPost(post.id);
    showToast(
      externalUrl && !state.postExternalUrlColumnAvailable
        ? "内容を更新しました。公式リンクの保存にはSupabaseの追加SQLが必要です。"
        : externalUrl && externalSiteName && !state.postExternalSiteNameColumnAvailable
          ? "内容を更新しました。サイト名の保存にはSupabaseの追加SQLが必要です。"
        : !state.postFieldTagsColumnAvailable
          ? "内容を更新しました。関連分野の保存にはSupabaseの追加SQLが必要です。"
          : "ボトルの内容を更新しました。",
      state.postFieldTagsColumnAvailable
        && (!externalUrl || state.postExternalUrlColumnAvailable)
        && (!externalSiteName || state.postExternalSiteNameColumnAvailable) ? "success" : "info",
    );
  } catch (error) {
    showToast(readableError(error), "error");
  } finally {
    setButtonLoading(button, false);
  }
}

function openPostDeleteConfirmation() {
  const post = selectedOwnedPost();
  if (!post) {
    showToast("このボトルは削除できません。", "error");
    return;
  }
  $("#deletePostTitle").textContent = post.title;
  closeDialog("postDialog");
  openDialog("deletePostDialog");
}

async function deleteSelectedPost() {
  const post = selectedOwnedPost();
  if (!post) {
    closeDialog("deletePostDialog");
    showToast("このボトルは削除できません。", "error");
    return;
  }
  const button = $("#confirmDeletePostButton");
  setButtonLoading(button, true);

  try {
    if (IS_PREVIEW_MODE) {
      state.posts = state.posts.filter((item) => item.id !== post.id);
      state.myPosts = state.myPosts.filter((item) => item.id !== post.id);
      state.replies = state.replies.filter((reply) => reply.post_id !== post.id);
      state.likedPostIds.delete(post.id);
      state.selectedPostId = null;
      closeDialog("deletePostDialog");
      renderPosts();
      renderBottles();
      renderMyPage();
      showToast("ボトルを削除しました。", "success");
      return;
    }

    const { error } = await supabase
      .from("posts")
      .delete()
      .eq("id", post.id)
      .eq("user_id", state.user.id);
    if (error) throw error;
    state.selectedPostId = null;
    closeDialog("deletePostDialog");
    await Promise.all([loadPosts(), loadReplies(), loadMyData()]);
    showToast("ボトルを削除しました。", "success");
  } catch (error) {
    showToast(readableError(error), "error");
  } finally {
    setButtonLoading(button, false);
  }
}

function renderReplies(postId) {
  const replies = state.replies
    .filter((reply) => reply.post_id === postId)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const container = $("#replyList");
  container.replaceChildren();
  $("#detailReplyCount").textContent = `${replies.length}件`;

  if (!replies.length) {
    container.innerHTML = '<p class="reply-empty">まだ返信はありません。最初の一通を届けてみませんか？</p>';
    return;
  }

  const repliesById = new Map(replies.map((reply) => [reply.id, reply]));
  const participantLabels = threadParticipantLabels(postId);
  const childrenByParent = new Map();
  replies.forEach((reply) => {
    if (!reply.parent_reply_id || !repliesById.has(reply.parent_reply_id)) return;
    const children = childrenByParent.get(reply.parent_reply_id) ?? [];
    children.push(reply);
    childrenByParent.set(reply.parent_reply_id, children);
  });
  const roots = replies.filter((reply) => !reply.parent_reply_id || !repliesById.has(reply.parent_reply_id));
  const renderedIds = new Set();

  const appendReply = (reply, depth = 0) => {
    if (renderedIds.has(reply.id)) return;
    renderedIds.add(reply.id);
    const item = document.createElement("article");
    item.className = "reply-item";
    item.dataset.replyId = reply.id;
    item.dataset.parentReplyId = reply.parent_reply_id ?? "";
    item.style.setProperty("--reply-indent", `${Math.min(depth, 4) * 24}px`);
    item.style.setProperty("--reply-indent-mobile", `${Math.min(depth, 3) * 12}px`);
    if (reply.parent_reply_id) item.classList.add("is-thread-reply");
    const author = threadAuthorLabel(reply.sender_user_id, postId, participantLabels);
    const meta = [reply.profile?.grade, reply.profile?.major].filter(Boolean).join("・");
    const isSender = reply.sender_user_id === state.user?.id;
    const canReply = state.threadedRepliesAvailable && reply.recipient_user_id === state.user?.id;
    const isEditing = isSender && state.editingReplyId === reply.id;
    const isReplying = canReply && state.replyingToReplyId === reply.id;
    const parentReply = reply.parent_reply_id ? repliesById.get(reply.parent_reply_id) : null;
    const parentAuthor = parentReply ? threadAuthorLabel(parentReply.sender_user_id, postId, participantLabels) : "相手";

    if (isEditing) {
      item.classList.add("editing");
      item.innerHTML = `
        <form class="reply-edit-form" data-reply-edit-form="${escapeHTML(reply.id)}">
          <label class="sr-only" for="reply-editor-${escapeHTML(reply.id)}">返信内容を編集</label>
          <textarea id="reply-editor-${escapeHTML(reply.id)}" data-reply-editor="${escapeHTML(reply.id)}" rows="4" maxlength="1000" required>${escapeHTML(reply.body)}</textarea>
          <div class="reply-edit-actions">
            <button type="button" class="reply-action-button cancel" data-reply-action="cancel" data-reply-id="${escapeHTML(reply.id)}">キャンセル</button>
            <button type="submit" class="reply-action-button save" data-reply-id="${escapeHTML(reply.id)}">
              <span class="button-label">保存する</span>
            </button>
          </div>
        </form>`;
    } else {
      const actionButtons = [
        canReply ? `<button type="button" class="reply-action-button reply" data-reply-action="reply" data-reply-id="${escapeHTML(reply.id)}"><i class="ph ph-arrow-bend-up-left" aria-hidden="true"></i> 返信</button>` : "",
        isSender ? `<button type="button" class="reply-action-button" data-reply-action="edit" data-reply-id="${escapeHTML(reply.id)}"><i class="ph ph-pencil-simple" aria-hidden="true"></i> 編集</button>` : "",
        isSender ? `<button type="button" class="reply-action-button danger" data-reply-action="delete" data-reply-id="${escapeHTML(reply.id)}"><i class="ph ph-trash" aria-hidden="true"></i> 削除</button>` : "",
        !isSender ? `<button type="button" class="reply-action-button" data-reply-action="report" data-reply-id="${escapeHTML(reply.id)}"><i class="ph ph-flag" aria-hidden="true"></i> 通報</button>` : "",
      ].filter(Boolean).join("");
      item.innerHTML = `
        ${parentReply ? `<p class="reply-context"><i class="ph ph-arrow-bend-down-right" aria-hidden="true"></i> ${escapeHTML(parentAuthor)}への返信</p>` : ""}
        <p class="reply-body">${escapeHTML(reply.body)}</p>
        <div class="reply-item-meta">
          <footer>${escapeHTML(author)}${meta ? `・${escapeHTML(meta)}` : ""}・${formatRelativeDate(reply.created_at)}</footer>
          ${actionButtons ? `<div class="reply-item-actions" aria-label="返信の操作">${actionButtons}</div>` : ""}
        </div>
        ${isReplying ? `
          <form class="nested-reply-form" data-nested-reply-form="${escapeHTML(reply.id)}">
            <label for="nested-reply-${escapeHTML(reply.id)}">${escapeHTML(author)}に返信</label>
            <textarea id="nested-reply-${escapeHTML(reply.id)}" data-nested-reply-body="${escapeHTML(reply.id)}" rows="3" maxlength="1000" placeholder="返信内容を入力" required></textarea>
            <div class="nested-reply-actions">
              <p><i class="ph ph-drop" aria-hidden="true"></i> 内容はここで全員が確認でき、返信ボトルは${escapeHTML(author)}の湖だけに届きます。</p>
              <div>
                <button type="button" class="reply-action-button cancel" data-reply-action="cancel-reply" data-reply-id="${escapeHTML(reply.id)}">キャンセル</button>
                <button type="submit" class="reply-action-button save"><span class="button-label">返信を届ける</span><span class="spinner" aria-hidden="true"></span></button>
              </div>
            </div>
          </form>` : ""}`;
    }
    container.append(item);
    (childrenByParent.get(reply.id) ?? []).forEach((child) => appendReply(child, depth + 1));
  };

  roots.forEach((reply) => appendReply(reply));
  replies.forEach((reply) => appendReply(reply));
}

function ownReply(replyId) {
  return state.replies.find((reply) => reply.id === replyId && reply.sender_user_id === state.user?.id) ?? null;
}

function handleReplyListClick(event) {
  const button = event.target.closest("[data-reply-action]");
  if (!button) return;
  const reply = state.replies.find((item) => item.id === button.dataset.replyId);
  if (!reply) {
    showToast("この返信は操作できません。", "error");
    return;
  }

  if (button.dataset.replyAction === "reply") {
    if (reply.recipient_user_id !== state.user?.id) {
      showToast("受け取った返信にだけ返信できます。", "error");
      return;
    }
    state.editingReplyId = null;
    state.replyingToReplyId = reply.id;
    renderReplies(reply.post_id);
    window.setTimeout(() => $(`[data-nested-reply-body="${reply.id}"]`)?.focus(), 50);
    return;
  }

  if (button.dataset.replyAction === "report") {
    if (reply.sender_user_id === state.user?.id) return;
    state.reportTarget = { type: "reply", id: reply.id };
    $("#reportForm").reset();
    openDialog("reportDialog");
    return;
  }

  if (button.dataset.replyAction === "cancel-reply") {
    state.replyingToReplyId = null;
    renderReplies(reply.post_id);
    return;
  }

  const ownedReply = ownReply(reply.id);
  if (!ownedReply) {
    showToast("この返信は操作できません。", "error");
    return;
  }

  if (button.dataset.replyAction === "edit") {
    state.replyingToReplyId = null;
    state.editingReplyId = ownedReply.id;
    renderReplies(ownedReply.post_id);
    window.setTimeout(() => $(`[data-reply-editor="${ownedReply.id}"]`)?.focus(), 50);
    return;
  }

  if (button.dataset.replyAction === "cancel") {
    state.editingReplyId = null;
    renderReplies(ownedReply.post_id);
    return;
  }

  if (button.dataset.replyAction === "delete") deleteOwnReply(ownedReply);
}

async function submitNestedReply(event) {
  const form = event.target.closest("[data-nested-reply-form]");
  if (!form) return;
  event.preventDefault();
  if (!form.reportValidity()) return;

  const parentReply = state.replies.find((reply) => reply.id === form.dataset.nestedReplyForm);
  if (!state.threadedRepliesAvailable || !parentReply || parentReply.recipient_user_id !== state.user?.id) {
    showToast("この返信には返信できません。", "error");
    return;
  }
  const body = $(`[data-nested-reply-body="${parentReply.id}"]`, form)?.value.trim();
  if (!body) {
    showToast("返信内容を入力してください。", "error");
    return;
  }

  const button = $("button[type='submit']", form);
  setButtonLoading(button, true);
  try {
    if (IS_PREVIEW_MODE) {
      state.replies.push({
        id: `preview-thread-reply-${Date.now()}`,
        post_id: parentReply.post_id,
        parent_reply_id: parentReply.id,
        sender_user_id: state.user.id,
        recipient_user_id: parentReply.sender_user_id,
        body,
        is_read: false,
        created_at: new Date().toISOString(),
        profile: state.profile,
      });
    } else {
      const { error } = await supabase.from("post_replies").insert({
        post_id: parentReply.post_id,
        parent_reply_id: parentReply.id,
        sender_user_id: state.user.id,
        body,
      });
      if (error) throw error;
      await loadReplies();
    }

    state.replyingToReplyId = null;
    renderReplies(parentReply.post_id);
    renderPosts();
    renderBottles();
    renderMyPosts();
    showToast("返信を届けました。", "success");
  } catch (error) {
    showToast(readableError(error), "error");
  } finally {
    setButtonLoading(button, false);
  }
}

async function saveEditedReply(event) {
  const form = event.target.closest("[data-reply-edit-form]");
  if (!form) return;
  event.preventDefault();
  if (!form.reportValidity()) return;

  const reply = ownReply(form.dataset.replyEditForm);
  if (!reply) {
    showToast("この返信は編集できません。", "error");
    return;
  }
  const body = $(`[data-reply-editor="${reply.id}"]`, form)?.value.trim();
  if (!body) {
    showToast("返信内容を入力してください。", "error");
    return;
  }
  const button = $("button[type='submit']", form);
  setButtonLoading(button, true);

  try {
    if (IS_PREVIEW_MODE) {
      reply.body = body;
    } else {
      const { error } = await supabase
        .from("post_replies")
        .update({ body })
        .eq("id", reply.id)
        .eq("sender_user_id", state.user.id);
      if (error) throw error;
      await loadReplies();
    }
    state.editingReplyId = null;
    renderReplies(reply.post_id);
    showToast("返信を更新しました。", "success");
  } catch (error) {
    showToast(readableError(error), "error");
  } finally {
    setButtonLoading(button, false);
  }
}

async function deleteOwnReply(reply) {
  if (!ownReply(reply.id)) {
    showToast("この返信は削除できません。", "error");
    return;
  }
  if (!window.confirm("この返信を削除しますか？\nこの操作は元に戻せません。")) return;

  try {
    if (IS_PREVIEW_MODE) {
      state.replies = state.replies
        .filter((item) => item.id !== reply.id)
        .map((item) => item.parent_reply_id === reply.id ? { ...item, parent_reply_id: null } : item);
    } else {
      const { error } = await supabase
        .from("post_replies")
        .delete()
        .eq("id", reply.id)
        .eq("sender_user_id", state.user.id);
      if (error) throw error;
      await loadReplies();
    }
    if (state.editingReplyId === reply.id) state.editingReplyId = null;
    if (state.replyingToReplyId === reply.id) state.replyingToReplyId = null;
    renderReplies(reply.post_id);
    renderPosts();
    renderBottles();
    renderMyPosts();
    showToast("返信を削除しました。", "success");
  } catch (error) {
    showToast(readableError(error), "error");
  }
}

async function submitReply(event) {
  event.preventDefault();
  if (!event.currentTarget.reportValidity() || !state.selectedPostId) return;
  const selectedPost = state.posts.find((post) => post.id === state.selectedPostId);
  if (!selectedPost || selectedPost.user_id === state.user.id) {
    showToast("自分のボトルには返信できません。", "error");
    return;
  }
  const body = $("#replyBody").value.trim();
  if (!body) {
    showToast("返信内容を入力してください。", "error");
    $("#replyBody").focus();
    return;
  }
  const button = $("#submitReplyButton");
  setButtonLoading(button, true);

  try {
    if (IS_PREVIEW_MODE) {
      state.replies.unshift({
        id: `preview-reply-${Date.now()}`,
        post_id: state.selectedPostId,
        parent_reply_id: null,
        sender_user_id: state.user.id,
        recipient_user_id: selectedPost.user_id,
        body,
        is_read: false,
        created_at: new Date().toISOString(),
        profile: state.profile,
      });
    } else {
      const { error } = await supabase.from("post_replies").insert({
        post_id: state.selectedPostId,
        sender_user_id: state.user.id,
        body,
      });
      if (error) throw error;
      await loadReplies();
    }

    $("#replyBody").value = "";
    renderReplies(state.selectedPostId);
    renderPosts();
    renderBottles();
    renderMyPosts();
    showToast("返信をボトルに入れて届けました。", "success");
  } catch (error) {
    showToast(readableError(error), "error");
  } finally {
    setButtonLoading(button, false);
  }
}

async function toggleLike(postId) {
  if (!postId) return;
  const liked = state.likedPostIds.has(postId);
  try {
    if (IS_PREVIEW_MODE) {
      const post = state.posts.find((item) => item.id === postId);
      if (!post) return;
      if (liked) {
        state.likedPostIds.delete(postId);
        post.like_count = Math.max(0, Number(post.like_count) - 1);
      } else {
        state.likedPostIds.add(postId);
        post.like_count = Number(post.like_count) + 1;
      }
      renderPosts();
      openPost(postId, false);
      return;
    }
    const query = liked
      ? supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", state.user.id)
      : supabase.from("post_likes").insert({ post_id: postId, user_id: state.user.id });
    const { error } = await query;
    if (error) throw error;
    await loadPosts();
  } catch (error) {
    showToast(readableError(error), "error");
  }
}

function renderProfileIdentity() {
  if (!state.profile) return;
  const fish = FISH[state.profile.fish_type] ?? FISH.aqua;
  $("#headerFish").firstElementChild.src = FISH_ASSET_URL;
  $("#headerFish").firstElementChild.style.filter = fish.filter;
  $("#myFish").src = FISH_ASSET_URL;
  $("#myFish").style.filter = fish.filter;
  $("#myNickname").textContent = "あなたの魚";
  $("#myMeta").textContent = [state.profile.grade, state.profile.major].filter(Boolean).join("・");
  const interests = parseInterests(state.profile.interests);
  $("#myInterests").innerHTML = interests.map((interest) => `<span>${escapeHTML(interest)}</span>`).join("");
  $("#myInterests").hidden = interests.length === 0;
  $("#myBio").textContent = state.profile.bio ?? "";
  $("#myBio").hidden = !state.profile.bio;
}

function renderMyPage() {
  renderProfileIdentity();
  $("#myPostCount").textContent = `${state.myPosts.length}件`;
  $("#myReplyCount").textContent = `${state.replies.filter((reply) => reply.sender_user_id === state.user?.id).length}件`;
  renderMyPosts();
}

function renderMyPosts() {
  const container = $("#myPostList");
  container.replaceChildren();
  if (!state.myPosts.length) {
    container.innerHTML = '<p class="history-empty">投稿したボトルがここに並びます。</p>';
    return;
  }
  state.myPosts.slice(0, 6).forEach((post) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item post-open-button";
    button.dataset.postId = post.id;
    const replyCount = state.replies.filter((reply) => reply.post_id === post.id).length;
    button.innerHTML = `<div><strong>${escapeHTML(post.title)}</strong><span>${escapeHTML(post.category)}・${formatDate(post.created_at)}</span></div><span class="history-value">返信 ${replyCount}・♡ ${Number(post.like_count) || 0}</span>`;
    container.append(button);
  });
}

function openProfileEditor() {
  $("#editGrade").value = state.profile.grade;
  $("#editMajor").value = state.profile.major ?? "";
  $("#editInterests").value = parseInterests(state.profile.interests).join("、");
  $("#editBio").value = state.profile.bio ?? "";
  $("#editGraduationYear").value = state.profile.graduation_year ?? "";
  syncEducationFields("edit");
  const radio = $(`input[name='editFishType'][value='${state.profile.fish_type}']`);
  if (radio) radio.checked = true;
  openDialog("editProfileDialog");
}

async function saveEditedProfile(event) {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const button = $("button[type='submit']", event.currentTarget);
  setButtonLoading(button, true);
  try {
    const grade = $("#editGrade").value;
    const updates = {
      grade,
      major: isSchoolGrade(grade) ? null : $("#editMajor").value.trim() || null,
      interests: parseInterests($("#editInterests").value),
      fish_type: $("input[name='editFishType']:checked").value,
      bio: $("#editBio").value.trim() || null,
      graduation_year: isUniversityGrade(grade) ? Number($("#editGraduationYear").value) || null : null,
    };
    if (!state.analyticsProfileColumnsAvailable) delete updates.graduation_year;
    if (!state.interestsColumnAvailable) delete updates.interests;
    if (!state.bioColumnAvailable) delete updates.bio;
    if (IS_PREVIEW_MODE) {
      state.profile = normalizeProfile({ ...state.profile, ...updates });
      renderProfileIdentity();
      closeDialog("editProfileDialog");
      renderLake();
      showToast("プロフィールを更新しました。", "success");
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("user_id", state.user.id)
      .select(availableProfileFields())
      .single();
    if (error) throw error;
    state.profile = normalizeProfile({ ...data, graduation_year: updates.graduation_year ?? null });
    renderProfileIdentity();
    closeDialog("editProfileDialog");
    await loadAquariumPresence();
    showToast("プロフィールを更新しました。", "success");
  } catch (error) {
    showToast(readableError(error), "error");
  } finally {
    setButtonLoading(button, false);
  }
}

function numberText(value) {
  return new Intl.NumberFormat("ja-JP").format(Number(value) || 0);
}

function compareText(current, previous) {
  const currentValue = Number(current) || 0;
  const previousValue = Number(previous) || 0;
  if (!previousValue) return currentValue ? "前期間は0" : "前期間と同じ";
  const rate = Math.round(((currentValue - previousValue) / previousValue) * 100);
  return `${rate >= 0 ? "+" : ""}${rate}% 前期間比`;
}

function renderAdminTable(container, headers, rows, emptyText = "まだデータがありません") {
  if (!rows.length) {
    container.innerHTML = `<p class="admin-empty">${escapeHTML(emptyText)}</p>`;
    return;
  }
  container.innerHTML = `<table><thead><tr>${headers.map((header) => `<th>${escapeHTML(header)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function renderAdminDashboard(data) {
  const headline = data.headline ?? {};
  const bottles = data.bottles ?? {};
  const traffic = data.traffic ?? {};
  $("#adminTotalUsers").textContent = numberText(headline.total_users);
  $("#adminNewUsers").textContent = numberText(headline.new_users);
  $("#adminDau").textContent = numberText(headline.dau);
  $("#adminWau").textContent = numberText(headline.wau);
  $("#adminMau").textContent = numberText(headline.mau);
  $("#adminRetention").textContent = `${Number(headline.retention_rate) || 0}%`;
  $("#adminNewUsersCompare").textContent = compareText(headline.new_users, headline.previous_new_users);
  $("#adminDauCompare").textContent = compareText(headline.dau, headline.previous_dau);
  $("#adminWauCompare").textContent = compareText(headline.wau, headline.previous_wau);
  $("#adminMauCompare").textContent = compareText(headline.mau, headline.previous_mau);
  $("#adminRetentionCompare").textContent = compareText(headline.retention_rate, headline.previous_retention_rate);
  $("#adminRangeSummary").textContent = `${data.range?.start ?? ""} 〜 ${data.range?.end ?? ""}`;

  const series = data.series ?? [];
  const chart = $("#adminTrendChart");
  const maxValue = Math.max(1, ...series.map((row) => Number(row.unique_users) || 0));
  chart.innerHTML = series.length ? series.map((row) => `
    <div class="admin-trend-column" title="${escapeHTML(row.bucket)}: ${numberText(row.unique_users)}人 / ${numberText(row.page_views)}PV">
      <span class="admin-trend-value">${numberText(row.unique_users)}</span>
      <span class="admin-trend-bar" style="--bar-height:${Math.max(5, (Number(row.unique_users) || 0) / maxValue * 100)}%"></span>
      <small>${escapeHTML(String(row.bucket).slice(5))}</small>
    </div>`).join("") : '<p class="admin-empty">選択期間の利用データはまだありません。</p>';

  $("#adminPostCount").textContent = numberText(bottles.posts);
  $("#adminReplyCount").textContent = numberText(bottles.replies);
  $("#adminBottleViews").textContent = numberText(bottles.views);
  $("#adminBottleUniques").textContent = numberText(bottles.unique_viewers);
  $("#adminPostCompare").textContent = compareText(bottles.posts, bottles.previous_posts);
  $("#adminReplyCompare").textContent = compareText(bottles.replies, bottles.previous_replies);
  $("#adminBottleViewsCompare").textContent = compareText(bottles.views, bottles.previous_views);
  $("#adminBottleUniquesCompare").textContent = compareText(bottles.unique_viewers, bottles.previous_unique_viewers);
  renderAdminTable($("#adminCategoryTable"), ["カテゴリ", "投稿", "回答", "閲覧", "閲覧者"], (data.categories ?? []).map((row) => `<tr><td>${escapeHTML(row.category)}</td><td>${numberText(row.posts)}<small>${compareText(row.posts, row.previous_posts)}</small></td><td>${numberText(row.replies)}<small>${compareText(row.replies, row.previous_replies)}</small></td><td>${numberText(row.views)}<small>${compareText(row.views, row.previous_views)}</small></td><td>${numberText(row.unique_viewers)}<small>${compareText(row.unique_viewers, row.previous_unique_viewers)}</small></td></tr>`));

  $("#adminPageViews").textContent = numberText(traffic.page_views);
  $("#adminUniqueUsers").textContent = numberText(traffic.unique_users);
  $("#adminNewVisitors").textContent = numberText(traffic.new_visitors);
  $("#adminReturningVisitors").textContent = numberText(traffic.returning_visitors);
  $("#adminPageViewsCompare").textContent = compareText(traffic.page_views, traffic.previous_page_views);
  $("#adminUniqueUsersCompare").textContent = compareText(traffic.unique_users, traffic.previous_unique_users);
  $("#adminNewVisitorsCompare").textContent = compareText(traffic.new_visitors, traffic.previous_new_visitors);
  $("#adminReturningVisitorsCompare").textContent = compareText(traffic.returning_visitors, traffic.previous_returning_visitors);
  renderAdminTable($("#adminSourceTable"), ["流入元", "UTM medium", "campaign", "訪問", "新規", "再訪"], (data.sources ?? []).map((row) => `<tr><td>${escapeHTML(row.source)}</td><td>${escapeHTML(row.medium)}</td><td>${escapeHTML(row.campaign)}</td><td>${numberText(row.sessions)}</td><td>${numberText(row.new_visitors)}</td><td>${numberText(row.returning_visitors)}</td></tr>`));

  const demographicGroups = Object.groupBy
    ? Object.groupBy(data.demographics ?? [], (row) => row.dimension)
    : (data.demographics ?? []).reduce((groups, row) => { (groups[row.dimension] ||= []).push(row); return groups; }, {});
  $("#adminDemographics").innerHTML = Object.entries(demographicGroups).map(([dimension, rows]) => {
    const total = rows.reduce((sum, row) => sum + (Number(row.user_count) || 0), 0);
    return `<section><h3>${escapeHTML(dimension)}</h3><div>${rows.sort((a, b) => Number(b.user_count) - Number(a.user_count)).slice(0, 12).map((row) => {
      const share = dimension === "在籍区分" && total ? `・${Math.round((Number(row.user_count) || 0) / total * 100)}%` : "";
      return `<p><span>${escapeHTML(row.label)}</span><strong>${numberText(row.user_count)}人${share}<small>MAU ${numberText(row.mau)}・${compareText(row.mau, row.previous_mau)}</small></strong></p>`;
    }).join("")}</div></section>`;
  }).join("") || '<p class="admin-empty">属性データはまだありません。</p>';

  renderAdminTable($("#adminEnterpriseTable"), ["企業・掲載", "種別", "表示", "閲覧者", "詳細", "クリック", "CTR"], (data.enterprise ?? []).map((row) => `<tr><td><strong>${escapeHTML(row.organization)}</strong><small>${escapeHTML(row.title)}</small></td><td>${escapeHTML(row.content_type)}</td><td>${numberText(row.impressions)}<small>${compareText(row.impressions, row.previous_impressions)}</small></td><td>${numberText(row.unique_viewers)}<small>${compareText(row.unique_viewers, row.previous_unique_viewers)}</small></td><td>${numberText(row.detail_views)}<small>${compareText(row.detail_views, row.previous_detail_views)}</small></td><td>${numberText(row.clicks)}<small>${compareText(row.clicks, row.previous_clicks)}</small></td><td>${Number(row.ctr) || 0}%<small>${compareText(row.ctr, row.previous_ctr)}</small></td></tr>`), "企業コンテンツを登録すると掲載効果がここに表示されます。");

  const enterpriseTitles = new Map((data.enterprise ?? []).map((row) => [row.id, `${row.organization}｜${row.title}`]));
  const enterpriseAudienceGroups = (data.enterprise_audience ?? []).reduce((groups, row) => {
    (groups[row.content_id] ||= []).push(row);
    return groups;
  }, {});
  $("#adminEnterpriseAudience").innerHTML = Object.entries(enterpriseAudienceGroups).map(([contentId, rows]) => {
    const dimensions = rows.reduce((groups, row) => { (groups[row.dimension] ||= []).push(row); return groups; }, {});
    return `<article><h3>${escapeHTML(enterpriseTitles.get(contentId) || "企業コンテンツ")}</h3><div>${Object.entries(dimensions).map(([dimension, values]) => `<section><strong>${escapeHTML(dimension)}</strong>${values.sort((a, b) => Number(b.users) - Number(a.users)).map((row) => `<p><span>${escapeHTML(row.label)}</span><b>${numberText(row.users)}人</b></p>`).join("")}</section>`).join("")}</div></article>`;
  }).join("") || '<p class="admin-empty admin-enterprise-audience-empty">匿名化基準を満たす属性集計はまだありません。</p>';

  $("#adminReportList").innerHTML = (data.reports ?? []).length ? data.reports.map((report) => `<article><div><span class="admin-status status-${escapeHTML(report.status)}">${escapeHTML(report.status)}</span><strong>${escapeHTML(report.reason)}</strong><p>${escapeHTML(report.detail || "補足なし")}</p><small>${escapeHTML(report.target_type)}・${formatDate(report.created_at)}</small></div><div class="admin-row-actions"><button type="button" data-admin-action="resolve-report" data-report-id="${escapeHTML(report.id)}" data-status="resolved">対応済み</button><button type="button" data-admin-action="resolve-report" data-report-id="${escapeHTML(report.id)}" data-status="dismissed">却下</button></div></article>`).join("") : '<p class="admin-empty">未確認の通報はありません。</p>';

  $("#adminUserList").innerHTML = (data.users ?? []).map((user) => `<article><div><span class="admin-status ${user.status === "suspended" ? "status-open" : "status-resolved"}">${user.status === "suspended" ? "利用停止" : "利用中"}</span><strong>ユーザー ${escapeHTML(String(user.user_id).slice(0, 8))}</strong><p>${escapeHTML([user.grade, user.major, user.graduation_year ? `${user.graduation_year}年卒` : ""].filter(Boolean).join("・") || "属性未設定")}</p><small>最終アクセス ${user.last_accessed_at ? formatDate(user.last_accessed_at) : "記録なし"}</small></div><div class="admin-row-actions"><button type="button" data-admin-action="set-user-status" data-user-id="${escapeHTML(user.user_id)}" data-status="${user.status === "suspended" ? "active" : "suspended"}">${user.status === "suspended" ? "解除" : "停止"}</button></div></article>`).join("") || '<p class="admin-empty">利用者データはまだありません。</p>';

  $("#adminPostModerationList").innerHTML = (data.recent_posts ?? []).map((post) => `<article><div><span class="admin-status ${post.moderation_status === "hidden" ? "status-open" : "status-resolved"}">${post.moderation_status === "hidden" ? "非表示" : "公開中"}</span><strong>${escapeHTML(post.title)}</strong><p>${escapeHTML(post.body)}</p><small>${escapeHTML(post.category)}・${formatDate(post.created_at)}</small></div><div class="admin-row-actions"><button type="button" data-admin-action="moderate-content" data-target-type="post" data-target-id="${escapeHTML(post.id)}" data-status="${post.moderation_status === "hidden" ? "visible" : "hidden"}">${post.moderation_status === "hidden" ? "再公開" : "非表示"}</button></div></article>`).join("") || '<p class="admin-empty">ボトルはまだありません。</p>';
  $("#adminReplyModerationList").innerHTML = (data.recent_replies ?? []).map((reply) => `<article><div><span class="admin-status ${reply.moderation_status === "hidden" ? "status-open" : "status-resolved"}">${reply.moderation_status === "hidden" ? "非表示" : "公開中"}</span><strong>返信</strong><p>${escapeHTML(reply.body)}</p><small>${formatDate(reply.created_at)}</small></div><div class="admin-row-actions"><button type="button" data-admin-action="moderate-content" data-target-type="reply" data-target-id="${escapeHTML(reply.id)}" data-status="${reply.moderation_status === "hidden" ? "visible" : "hidden"}">${reply.moderation_status === "hidden" ? "再公開" : "非表示"}</button></div></article>`).join("") || '<p class="admin-empty">返信はまだありません。</p>';
}

async function loadAdminDashboard(force = false) {
  if (!state.isAdmin || !state.session?.access_token) {
    if ($("#appView").dataset.activePage === "admin") showPage("aquarium");
    return;
  }
  const endInput = $("#adminEndDate");
  const startInput = $("#adminStartDate");
  if (!endInput.value) endInput.value = new Date().toISOString().slice(0, 10);
  if (!startInput.value) startInput.value = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const key = `${startInput.value}:${endInput.value}:${$("#adminGranularity").value}`;
  if (!force && state.adminLoadedRange === key && state.adminData) return;
  $("#adminLoading").hidden = false;
  $("#adminDashboard").hidden = true;
  try {
    const params = new URLSearchParams({ start: startInput.value, end: endInput.value, granularity: $("#adminGranularity").value });
    const response = await fetch(`/api/admin/dashboard?${params}`, { headers: { Authorization: `Bearer ${state.session.access_token}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "管理データを取得できませんでした。");
    state.adminData = data;
    state.adminLoadedRange = key;
    renderAdminDashboard(data);
    $("#adminDashboard").hidden = false;
  } catch (error) {
    showToast(readableError(error), "error");
  } finally {
    $("#adminLoading").hidden = true;
  }
}

async function adminAction(payload) {
  const response = await fetch("/api/admin/action", {
    method: "POST",
    headers: { Authorization: `Bearer ${state.session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "操作を完了できませんでした。");
}

async function handleAdminAction(event) {
  const button = event.target.closest("[data-admin-action]");
  if (!button || !state.isAdmin) return;
  button.disabled = true;
  try {
    if (button.dataset.adminAction === "resolve-report") {
      await adminAction({ action: "resolve_report", report_id: button.dataset.reportId, status: button.dataset.status });
    } else if (button.dataset.adminAction === "moderate-content") {
      const shouldHide = button.dataset.status === "hidden";
      if (shouldHide && !window.confirm("この内容を一般利用者から非表示にしますか？")) return;
      await adminAction({ action: "moderate_content", target_type: button.dataset.targetType, target_id: button.dataset.targetId, status: button.dataset.status, note: shouldHide ? "管理者による非表示" : null });
    } else if (button.dataset.adminAction === "set-user-status") {
      const shouldSuspend = button.dataset.status === "suspended";
      if (shouldSuspend && !window.confirm("この利用者を停止しますか？")) return;
      await adminAction({ action: "set_user_status", user_id: button.dataset.userId, status: button.dataset.status, reason: shouldSuspend ? "管理者による利用停止" : null });
    }
    await loadAdminDashboard(true);
    showToast("運営データを更新しました。", "success");
  } catch (error) {
    showToast(readableError(error), "error");
  } finally {
    button.disabled = false;
  }
}

function openDialog(id) {
  const dialog = $(`#${id}`);
  if (!dialog.open) dialog.showModal();
  document.body.classList.add("modal-open");
}

function closeDialog(id) {
  const dialog = $(`#${id}`);
  if (dialog?.open) dialog.close();
  syncBodyModalState();
}

function syncBodyModalState() {
  document.body.classList.toggle("modal-open", $$('dialog[open]').length > 0);
}

function formatRelativeDate(value) {
  const milliseconds = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(milliseconds / 60000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日前`;
  return formatDate(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(new Date(value));
}

function formatShortDuration(milliseconds) {
  const minutes = Math.max(0, Math.floor(milliseconds / 60000));
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}時間${remaining}分` : `${hours}時間`;
}

function bootstrapPreviewMode() {
  const now = Date.now();
  const userId = "preview-me";
  const me = {
    user_id: userId,
    grade: "大学2年",
    major: "情報工学",
    interests: ["AI", "データ分析", "ロボット"],
    fish_type: "coral",
    bio: "AIとロボットを学びながら、研究室選びを考えています。",
  };
  const members = [
    { user_id: "preview-a", grade: "高校3年", major: null, interests: ["建築", "都市計画", "環境デザイン"], fish_type: "aqua", bio: "建築とまちづくりに興味があります。" },
    { user_id: "preview-b", grade: "大学1年", major: "生命科学", interests: ["細胞", "医療"], fish_type: "mint", bio: "実験レポートと仲良くなりたいです。" },
    { user_id: "preview-c", grade: "大学3年", major: "応用化学", interests: ["材料", "有機化学"], fish_type: "lemon", bio: "材料系の研究室を探しています。" },
    { user_id: "preview-d", grade: "大学院", major: "機械工学", interests: ["ロボット", "制御工学"], fish_type: "lilac", bio: "ロボット制御の研究をしています。" },
  ];

  state.session = { user: { id: userId } };
  state.user = { id: userId };
  state.profile = me;
  const previewProfiles = [me, ...members];
  const previewStatuses = ["social", "break", "social", "social", "observe"];
  state.aquariumPresence = previewProfiles.map((profile, index) => ({
    user_id: profile.user_id,
    status: previewStatuses[index],
    focus_topic: null,
    joined_at: new Date(now - (index + 2) * 7 * 60000).toISOString(),
    heartbeat_at: new Date(now - index * 3000).toISOString(),
    updated_at: new Date(now - index * 3000).toISOString(),
    profile,
  }));
  state.aquariumPresenceJoined = true;
  state.aquariumAvailable = true;
  state.posts = [
    {
      id: "preview-post-1",
      user_id: userId,
      title: "研究室選びで見ておくとよかったこと",
      body: "研究テーマだけでなく、普段のゼミの雰囲気や先輩の過ごし方も知ってから決めたいです。見学で聞いてよかった質問があれば教えてください。",
      category: "研究",
      post_type: "相談",
      field_tags: ["研究室選び", "情報工学", "AI"],
      like_count: 12,
      created_at: new Date(now - 48 * 60000).toISOString(),
      updated_at: new Date(now - 48 * 60000).toISOString(),
      profile: me,
    },
    {
      id: "preview-post-2",
      user_id: members[0].user_id,
      title: "女子向けオープンキャンパス情報",
      body: "理工系の学生と直接話せる相談コーナーがありました。研究室の雰囲気も聞けて、進路を考える参考になりました。",
      category: "イベント",
      post_type: "情報共有",
      field_tags: ["進路選び", "建築", "オープンキャンパス"],
      external_url: "https://www.jst.go.jp/",
      external_site_name: "JST 科学技術振興機構",
      like_count: 8,
      created_at: new Date(now - 3 * 3600000).toISOString(),
      updated_at: new Date(now - 3 * 3600000).toISOString(),
      profile: members[0],
    },
    {
      id: "preview-post-3",
      user_id: members[1].user_id,
      title: "物理のレポート、考察の書き方が不安",
      body: "結果の説明だけになってしまいます。考察を書くときに、どんな順番で考えると整理しやすいですか？",
      category: "授業",
      post_type: "相談",
      field_tags: ["物理", "レポート"],
      like_count: 5,
      created_at: new Date(now - 7 * 3600000).toISOString(),
      updated_at: new Date(now - 7 * 3600000).toISOString(),
      profile: members[1],
    },
    {
      id: "preview-post-4",
      user_id: members[2].user_id,
      title: "インターン面接で聞かれたこと",
      body: "専門を選んだ理由と、授業以外で続けたことを聞かれました。難しい言葉より、自分の言葉で話すほうが伝わりやすかったです。",
      category: "就活",
      post_type: "情報共有",
      field_tags: ["インターン", "面接", "応用化学"],
      like_count: 16,
      created_at: new Date(now - 22 * 3600000).toISOString(),
      updated_at: new Date(now - 22 * 3600000).toISOString(),
      profile: members[2],
    },
  ];
  state.replies = [
    {
      id: "preview-reply-1",
      post_id: "preview-post-1",
      parent_reply_id: null,
      sender_user_id: members[3].user_id,
      recipient_user_id: userId,
      body: "私は、ゼミの頻度とコアタイム、卒研生が困ったときに誰へ相談するかを聞きました。普段の居場所も見せてもらうと雰囲気がわかりやすかったです。",
      is_read: false,
      created_at: new Date(now - 22 * 60000).toISOString(),
      profile: members[3],
    },
    {
      id: "preview-reply-2",
      post_id: "preview-post-3",
      parent_reply_id: null,
      sender_user_id: userId,
      recipient_user_id: members[1].user_id,
      body: "予想と違った点を一つ選んで、原因の候補と追加で確かめたいことを書くと考察らしくまとまりました。",
      is_read: true,
      created_at: new Date(now - 2 * 3600000).toISOString(),
      profile: me,
    },
    {
      id: "preview-reply-3",
      post_id: "preview-post-1",
      parent_reply_id: "preview-reply-1",
      sender_user_id: userId,
      recipient_user_id: members[3].user_id,
      body: "ありがとう！普段の相談相手まで聞くの、大事ですね。見学のときに確認してみます。",
      is_read: true,
      created_at: new Date(now - 12 * 60000).toISOString(),
      profile: me,
    },
    {
      id: "preview-reply-4",
      post_id: "preview-post-1",
      parent_reply_id: "preview-reply-3",
      sender_user_id: members[3].user_id,
      recipient_user_id: userId,
      body: "ぜひ。可能なら、先輩が普段使っている作業スペースも見せてもらうと安心です。",
      is_read: false,
      created_at: new Date(now - 4 * 60000).toISOString(),
      profile: members[3],
    },
  ];
  state.myPosts = state.posts.filter((post) => post.user_id === userId);
  state.likedPostIds = new Set(["preview-post-2"]);

  document.body.classList.add("preview-mode");
  showOnly("app");
  renderProfileIdentity();
  renderAquarium();
  renderPosts();
  renderBottles();
  renderMyPage();
  showPage(routeFromLocation().page, false);
}

async function initialize() {
  bindStaticEvents();
  void trackAnalyticsEvent("page_view", { page_key: "public-home" });
  if (IS_PREVIEW_MODE) {
    bootstrapPreviewMode();
    return;
  }
  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => routeSession(session), 0);
  });
  window.addEventListener("pagehide", () => listener.subscription.unsubscribe(), { once: true });

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    showToast(readableError(error), "error");
    showOnly("auth");
    return;
  }
  await routeSession(data.session);
}

initialize().catch((error) => {
  console.error(error);
  showOnly("auth");
  showToast("アプリを開始できませんでした。ページを再読み込みしてください。", "error");
});

// 開発時にブラウザのコンソールから接続先を確認するための読み取り専用情報です。
// 秘密情報は含みません。
window.MANABIUM_PUBLIC_CONFIG = Object.freeze({
  supabaseUrl: SUPABASE_URL,
  supabaseRestUrl: SUPABASE_REST_URL,
});
