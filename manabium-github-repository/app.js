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
const PROFILE_FIELDS = "user_id,nickname,grade,major,interests,fish_type,bio,created_at,updated_at";
const PROFILE_PUBLIC_FIELDS = "user_id,nickname,grade,major,interests,fish_type,bio";
const PROFILE_FIELDS_WITHOUT_BIO = "user_id,nickname,grade,major,interests,fish_type,created_at,updated_at";
const PROFILE_PUBLIC_FIELDS_WITHOUT_BIO = "user_id,nickname,grade,major,interests,fish_type";
const PROFILE_FIELDS_WITHOUT_INTERESTS = "user_id,nickname,grade,major,fish_type,created_at,updated_at";
const PROFILE_PUBLIC_FIELDS_WITHOUT_INTERESTS = "user_id,nickname,grade,major,fish_type";
const POST_FIELDS = "id,user_id,title,body,category,post_type,field_tags,like_count,created_at,updated_at";
const POST_FIELDS_WITHOUT_TAGS = "id,user_id,title,body,category,post_type,like_count,created_at,updated_at";
const MAX_LAKE_FISH = 12;
const MAX_LAKE_POSTS = 4;
const AQUARIUM_PRESENCE_TTL_SECONDS = 90;
const AQUARIUM_HEARTBEAT_INTERVAL_MS = 25000;
const AQUARIUM_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const AQUARIUM_REACTION_VISIBLE_MS = 7000;

const AQUARIUM_STATUS = {
  social: { label: "交流OK", className: "status-social" },
  break: { label: "休憩中", className: "status-break" },
  observe: { label: "見るだけ", className: "status-observe" },
};

const AQUARIUM_REACTIONS = {
  hello: "こんにちは",
  starting: "湖に来ました",
  good_work: "またね",
  taking_break: "少し離れます",
  together: "よろしくね",
  same_field: "同じ分野です",
  support: "応援しています",
  interesting: "その分野、気になります",
  good_work_direct: "また話そう",
};

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
  mutedProfiles: new Map(),
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
  interestsColumnAvailable: true,
  bioColumnAvailable: true,
  postFieldTagsColumnAvailable: true,
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
    ...parseFieldTags(post.field_tags),
    post.profile?.nickname,
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

function normalizePost(post) {
  return post ? { ...post, field_tags: parseFieldTags(post.field_tags) } : post;
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

  const updateHeader = () => {
    publicHeader.classList.toggle("is-scrolled", window.scrollY > 28);
  };
  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

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
        animationFrame = 0;
      });
    });
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
  if (hash === "board" || hash === "mypage" || hash === "aquarium") return { page: hash, postId: null };
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
  const allowed = ["aquarium", "board", "mypage"];
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
  $("#editPostForm").addEventListener("submit", saveEditedPost);
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
  return normalizeProfile(data);
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
    if (!state.profile?.nickname) {
      showOnly("onboarding");
      return;
    }

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
  state.posts = [];
  state.replies = [];
  state.myPosts = [];
  state.aquariumPresence = [];
  state.aquariumReactions = [];
  state.aquariumPresenceJoined = false;
  state.aquariumAvailable = true;
  state.mutedUserIds.clear();
  state.mutedProfiles.clear();
  state.selectedFishPresence = null;
  state.aquariumIdle = false;
  state.lastAquariumReactionAt = 0;
  state.lastAquariumReactionTargetAt.clear();
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
      nickname: $("#profileNickname").value.trim(),
      grade,
      major: isSchoolGrade(grade) ? null : $("#profileMajor").value.trim() || null,
      interests: parseInterests($("#profileInterests").value),
      fish_type: $("input[name='fishType']:checked").value,
      bio: $("#profileBio").value.trim() || null,
    };
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

    state.profile = normalizeProfile(data);
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
  state.mutedProfiles = await fetchProfiles([...state.mutedUserIds]);
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
  if (!targetUserId && now - state.lastAquariumReactionAt < 8000) {
    showToast("連続送信を防いでいます。少し待ってから送ってください。", "info");
    return;
  }
  if (targetUserId && now - state.lastAquariumReactionAt < 5000) {
    showToast("連続送信を防いでいます。少し待ってから送ってください。", "info");
    return;
  }
  if (targetUserId && now - (state.lastAquariumReactionTargetAt.get(targetUserId) ?? 0) < 20000) {
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
    showToast("湖に合図を送りました。", "success");
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
    if (selected.profile) state.mutedProfiles.set(selected.user_id, selected.profile);
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
    state.mutedProfiles.delete(userId);
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

async function loadPosts() {
  let { data: posts, error: postsError } = await supabase
    .from("posts")
    .select(POST_FIELDS)
    .order("created_at", { ascending: false })
    .limit(60);
  if (postsError && isMissingPostFieldTagsColumn(postsError)) {
    state.postFieldTagsColumnAvailable = false;
    ({ data: posts, error: postsError } = await supabase
      .from("posts")
      .select(POST_FIELDS_WITHOUT_TAGS)
      .order("created_at", { ascending: false })
      .limit(60));
  }
  if (postsError) throw postsError;

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
    const profile = presenceItem.profile ?? { nickname: "湖の仲間", fish_type: "aqua", grade: "—", major: "—", interests: [] };
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
    const recentReaction = state.aquariumPreferences.receive_reactions && state.aquariumReactions.find((reaction) => (
      reaction.target_user_id === presenceItem.user_id
      && !state.mutedUserIds.has(reaction.sender_user_id)
      && Date.now() - new Date(reaction.created_at).getTime() <= AQUARIUM_REACTION_VISIBLE_MS
    ));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "swimming-fish";
    button.dataset.fishUserId = presenceItem.user_id;
    button.classList.toggle("is-me", isMe);
    button.classList.toggle("is-similar", !isMe && similarity >= 22);
    button.classList.add(status.className);
    button.setAttribute("aria-label", `${profile.nickname}さん、${status.label}。プロフィールを見る`);
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
      ${recentReaction ? `<span class="fish-reaction-bubble">${escapeHTML(recentReaction.profile?.nickname ?? "仲間")}：${escapeHTML(AQUARIUM_REACTIONS[recentReaction.message_code] ?? "")}</span>` : ""}
      <span class="fish-motion"><img class="fish-asset" src="${FISH_ASSET_URL}" alt="" /></span>
      <span class="fish-label"><strong>${escapeHTML(profile.nickname)}${isMe ? "（あなた）" : ""}</strong><small><span class="status-orb ${status.className}"></span>${status.label}</small></span>`;
    button.addEventListener("click", () => {
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

  const connection = $("#presenceConnectionStatus");
  if (!state.aquariumAvailable) connection.innerHTML = "<span></span>追加SQLの実行を待っています";
  else if (state.aquariumIdle) connection.innerHTML = "<span></span>離席中です。操作すると戻ります";
  else if (state.aquariumPresenceJoined) connection.innerHTML = "<span></span>湖につながっています";
  else connection.innerHTML = "<span></span>湖につないでいます…";
}

function renderAquariumBroadcasts() {
  const layer = $("#aquariumBroadcastLayer");
  layer.replaceChildren();
  if (!state.aquariumPreferences.receive_reactions) return;
  const cutoff = Date.now() - AQUARIUM_REACTION_VISIBLE_MS;
  state.aquariumReactions
    .filter((reaction) => (
      !reaction.target_user_id
      && new Date(reaction.created_at).getTime() >= cutoff
      && !state.mutedUserIds.has(reaction.sender_user_id)
    ))
    .slice(0, 3)
    .forEach((reaction, index) => {
      const message = document.createElement("p");
      message.className = "aquarium-broadcast-bubble";
      message.style.setProperty("--bubble-index", String(index));
      message.innerHTML = `<strong>${escapeHTML(reaction.profile?.nickname ?? "湖の仲間")}</strong><span>${escapeHTML(AQUARIUM_REACTIONS[reaction.message_code] ?? "")}</span>`;
      layer.append(message);
    });
}

function renderMutedUsers() {
  const container = $("#mutedUsersList");
  container.replaceChildren();
  if (!state.mutedUserIds.size) {
    container.innerHTML = "<span>いません</span>";
    return;
  }
  [...state.mutedUserIds].forEach((userId) => {
    const profile = state.mutedProfiles.get(userId);
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.unmuteUser = userId;
    button.textContent = `${profile?.nickname ?? "ミュート中の利用者"}を解除`;
    container.append(button);
  });
}

function renderAquarium() {
  renderLake();
  renderAquariumControls();
  renderAquariumBroadcasts();
  renderMutedUsers();
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
    button.style.left = `${phoneLayout ? 8 + ((seed + index * 19) % 64) : 8 + ((seed + index * 19) % 76)}%`;
    button.style.top = `${17 + ((seed + index * 11) % 60)}%`;
    button.style.setProperty("--rotation", `${-14 + (seed % 29)}deg`);
    button.style.setProperty("--delay", `${-((timelineSeconds + seed * 0.13) % duration)}s`);
    button.style.setProperty("--bottle-duration", `${duration}s`);
    button.style.setProperty("--bottle-x-one", `${5 + (seed % 7)}px`);
    button.style.setProperty("--bottle-x-two", `${-4 - (seed % 6)}px`);
    button.style.setProperty("--bottle-y-one", `${-5 - (seed % 6)}px`);
    button.style.setProperty("--bottle-y-two", `${-9 - (seed % 7)}px`);
    button.style.setProperty("--bottle-sway", `${1.8 + ((seed % 5) * 0.35)}deg`);
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
  const button = $("#replyLily");
  if (!button) return;
  const unreadReplies = unreadRepliesForCurrentUser();
  const count = unreadReplies.length;
  button.hidden = count === 0;
  $("#replyLilyCount").textContent = count > 99 ? "99+" : String(count);
  button.setAttribute("aria-label", `届いた返事が${count}件あります。最新の返事を読む`);
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
  const profile = presence.profile ?? { nickname: "湖の仲間", grade: "—", major: "—", fish_type: "aqua", interests: [] };
  const fish = FISH[profile.fish_type] ?? FISH.aqua;
  const isMe = presence.user_id === state.user?.id;
  const status = AQUARIUM_STATUS[presence.status] ?? AQUARIUM_STATUS.social;
  const matchBadge = $("#drawerMatchBadge");
  state.selectedFishPresence = presence;
  $("#drawerFish").src = FISH_ASSET_URL;
  $("#drawerFish").style.filter = fish.filter;
  $("#drawerName").textContent = `${profile.nickname}${isMe ? "（あなた）" : ""}`;
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
    const author = isOwn ? "あなた" : post.profile?.nickname ?? "湖の仲間";
    const excerpt = post.body.length > 130 ? `${post.body.slice(0, 130)}…` : post.body;
    const fieldTags = parseFieldTags(post.field_tags);
    const fieldTagsMarkup = fieldTags.length
      ? `<div class="post-field-tags" aria-label="関連分野">${fieldTags.map((tag) => `<button class="post-field-tag" type="button" data-search-tag="${escapeHTML(tag)}">${escapeHTML(tag)}</button>`).join("")}</div>`
      : "";
    card.innerHTML = `
      <button class="post-open-button" type="button" data-action="open" data-post-id="${post.id}">
        <span class="post-badges">
          <span class="post-badge">${escapeHTML(post.category)}</span>
          <span class="post-badge type">${escapeHTML(post.post_type)}</span>
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
  openDialog("composerDialog");
  window.setTimeout(() => $("#postTitle").focus(), 50);
}

async function submitPost(event) {
  event.preventDefault();
  const form = event.currentTarget;
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
    };
    if (state.postFieldTagsColumnAvailable) payload.field_tags = parseFieldTags($("#postFields").value);
    let { error } = await supabase.from("posts").insert(payload);
    if (error && isMissingPostFieldTagsColumn(error)) {
      state.postFieldTagsColumnAvailable = false;
      delete payload.field_tags;
      ({ error } = await supabase.from("posts").insert(payload));
    }
    if (error) throw error;
    form.reset();
    $("#postCharacterCount").textContent = "0";
    closeDialog("composerDialog");
    await Promise.all([loadPosts(), loadMyData()]);
    showToast(
      state.postFieldTagsColumnAvailable
        ? "ボトルを湖へ流しました。"
        : "ボトルを流しました。関連分野の保存にはSupabaseの追加SQLが必要です。",
      state.postFieldTagsColumnAvailable ? "success" : "info",
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
  $("#detailMeta").textContent = `${isOwner ? "あなた" : post.profile?.nickname ?? "湖の仲間"}・${post.profile?.grade ?? "学年未設定"}・${formatRelativeDate(post.created_at)}`;
  const detailFieldTags = parseFieldTags(post.field_tags);
  $("#detailFieldTags").innerHTML = detailFieldTags.map((tag) => `<button class="post-field-tag" type="button" data-search-tag="${escapeHTML(tag)}">${escapeHTML(tag)}</button>`).join("");
  $("#detailFieldTags").hidden = detailFieldTags.length === 0;
  renderTextWithLinks($("#detailBody"), post.body);
  const liked = state.likedPostIds.has(post.id);
  const likeButton = $("#detailLikeButton");
  likeButton.classList.toggle("liked", liked);
  likeButton.innerHTML = `<span aria-hidden="true">♡</span> ${Number(post.like_count) || 0} いいね`;
  $("#postOwnerActions").hidden = !isOwner;
  $("#replyForm").hidden = isOwner;
  $("#replyOwnerNotice").hidden = !isOwner;
  renderReplies(post.id);
  if (show) openDialog("postDialog");
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
  $("#editPostBody").value = post.body;
  $("#editPostCharacterCount").textContent = String(post.body.length);
  closeDialog("postDialog");
  openDialog("editPostDialog");
  window.setTimeout(() => $("#editPostTitle").focus(), 50);
}

async function saveEditedPost(event) {
  event.preventDefault();
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
    };
    if (state.postFieldTagsColumnAvailable) payload.field_tags = updates.field_tags;
    let { error } = await supabase
      .from("posts")
      .update(payload)
      .eq("id", post.id)
      .eq("user_id", state.user.id);
    if (error && isMissingPostFieldTagsColumn(error)) {
      state.postFieldTagsColumnAvailable = false;
      delete payload.field_tags;
      ({ error } = await supabase
        .from("posts")
        .update(payload)
        .eq("id", post.id)
        .eq("user_id", state.user.id));
    }
    if (error) throw error;
    closeDialog("editPostDialog");
    await Promise.all([loadPosts(), loadMyData()]);
    openPost(post.id);
    showToast(
      state.postFieldTagsColumnAvailable
        ? "ボトルの内容を更新しました。"
        : "内容を更新しました。関連分野の保存にはSupabaseの追加SQLが必要です。",
      state.postFieldTagsColumnAvailable ? "success" : "info",
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
    const author = reply.profile?.nickname ?? "湖の仲間";
    const meta = [reply.profile?.grade, reply.profile?.major].filter(Boolean).join("・");
    const isSender = reply.sender_user_id === state.user?.id;
    const canReply = state.threadedRepliesAvailable && reply.recipient_user_id === state.user?.id;
    const isEditing = isSender && state.editingReplyId === reply.id;
    const isReplying = canReply && state.replyingToReplyId === reply.id;
    const parentReply = reply.parent_reply_id ? repliesById.get(reply.parent_reply_id) : null;
    const parentAuthor = parentReply?.profile?.nickname ?? "相手";

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
      ].filter(Boolean).join("");
      item.innerHTML = `
        ${parentReply ? `<p class="reply-context"><i class="ph ph-arrow-bend-down-right" aria-hidden="true"></i> ${escapeHTML(parentAuthor)}さんへの返信</p>` : ""}
        <p class="reply-body">${escapeHTML(reply.body)}</p>
        <div class="reply-item-meta">
          <footer>${escapeHTML(author)}${meta ? `・${escapeHTML(meta)}` : ""}・${formatRelativeDate(reply.created_at)}</footer>
          ${actionButtons ? `<div class="reply-item-actions" aria-label="返信の操作">${actionButtons}</div>` : ""}
        </div>
        ${isReplying ? `
          <form class="nested-reply-form" data-nested-reply-form="${escapeHTML(reply.id)}">
            <label for="nested-reply-${escapeHTML(reply.id)}">${escapeHTML(author)}さんに返信</label>
            <textarea id="nested-reply-${escapeHTML(reply.id)}" data-nested-reply-body="${escapeHTML(reply.id)}" rows="3" maxlength="1000" placeholder="返信内容を入力" required></textarea>
            <div class="nested-reply-actions">
              <p><i class="ph ph-drop" aria-hidden="true"></i> 内容はここで全員が確認でき、返信ボトルは${escapeHTML(author)}さんの湖だけに届きます。</p>
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
    showToast(`${parentReply.profile?.nickname ?? "相手"}さんへ返信を届けました。`, "success");
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
  $("#myNickname").textContent = state.profile.nickname;
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
  $("#editNickname").value = state.profile.nickname;
  $("#editGrade").value = state.profile.grade;
  $("#editMajor").value = state.profile.major ?? "";
  $("#editInterests").value = parseInterests(state.profile.interests).join("、");
  $("#editBio").value = state.profile.bio ?? "";
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
      nickname: $("#editNickname").value.trim(),
      grade,
      major: isSchoolGrade(grade) ? null : $("#editMajor").value.trim() || null,
      interests: parseInterests($("#editInterests").value),
      fish_type: $("input[name='editFishType']:checked").value,
      bio: $("#editBio").value.trim() || null,
    };
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
      .select()
      .single();
    if (error) throw error;
    state.profile = normalizeProfile(data);
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
    nickname: "みなも",
    grade: "大学2年",
    major: "情報工学",
    interests: ["AI", "データ分析", "ロボット"],
    fish_type: "coral",
    bio: "AIとロボットを学びながら、研究室選びを考えています。",
  };
  const members = [
    { user_id: "preview-a", nickname: "あおい", grade: "高校3年", major: null, interests: ["建築", "都市計画", "環境デザイン"], fish_type: "aqua", bio: "建築とまちづくりに興味があります。" },
    { user_id: "preview-b", nickname: "りこ", grade: "大学1年", major: "生命科学", interests: ["細胞", "医療"], fish_type: "mint", bio: "実験レポートと仲良くなりたいです。" },
    { user_id: "preview-c", nickname: "すず", grade: "大学3年", major: "応用化学", interests: ["材料", "有機化学"], fish_type: "lemon", bio: "材料系の研究室を探しています。" },
    { user_id: "preview-d", nickname: "しおり", grade: "大学院", major: "機械工学", interests: ["ロボット", "制御工学"], fish_type: "lilac", bio: "ロボット制御の研究をしています。" },
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
