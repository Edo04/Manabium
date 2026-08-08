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
const PROFILE_FIELDS = "user_id,nickname,grade,major,interests,fish_type,created_at,updated_at";
const PROFILE_PUBLIC_FIELDS = "user_id,nickname,grade,major,interests,fish_type";
const PROFILE_FIELDS_WITHOUT_INTERESTS = "user_id,nickname,grade,major,fish_type,created_at,updated_at";
const PROFILE_PUBLIC_FIELDS_WITHOUT_INTERESTS = "user_id,nickname,grade,major,fish_type";
const MAX_LAKE_FISH = 12;
const MAX_LAKE_POSTS = 5;
const ACTIVE_SESSION_MAX_AGE_HOURS = 12;

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
  activeSessions: [],
  posts: [],
  replies: [],
  mySessions: [],
  myPosts: [],
  likedPostIds: new Set(),
  selectedCategory: "all",
  currentStudy: null,
  selectedPostId: null,
  timerId: null,
  realtimeChannel: null,
  presenceChannel: null,
  onlineUserIds: new Set(),
  presenceReady: false,
  interestsColumnAvailable: true,
  routeVersion: 0,
  realtimeReloadTimer: null,
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

function normalizeProfile(profile) {
  return profile ? { ...profile, interests: parseInterests(profile.interests) } : profile;
}

function isMissingInterestsColumn(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("interests") && (message.includes("schema cache") || message.includes("column"));
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

function activeStudySessions() {
  const recentCutoff = Date.now() - ACTIVE_SESSION_MAX_AGE_HOURS * 60 * 60 * 1000;
  return state.activeSessions.filter((session) => {
    const isRecent = new Date(session.started_at).getTime() >= recentCutoff;
    const isOnline = !state.presenceReady || state.onlineUserIds.has(session.user_id);
    return session.status === "active" && isRecent && isOnline;
  });
}

function rankedActiveSessions() {
  return activeStudySessions()
    .map((session) => ({ session, score: profileSimilarity(session.profile) }))
    .sort((a, b) => b.score - a.score || new Date(b.session.started_at) - new Date(a.session.started_at))
    .map(({ session }) => session);
}

function postRelevance(post) {
  const ageHours = Math.max(0, (Date.now() - new Date(post.created_at).getTime()) / 3600000);
  const recency = Math.max(0, 30 - ageHours / 12);
  const text = `${post.title} ${post.body}`.normalize("NFKC").toLowerCase();
  let topicScore = 0;
  [state.profile?.major, ...(state.profile?.interests ?? [])].filter(Boolean).forEach((term) => {
    const normalized = String(term).normalize("NFKC").toLowerCase();
    if (normalized && text.includes(normalized)) topicScore += 18;
  });
  profileFieldGroups(state.profile).forEach((group) => {
    const keywords = FIELD_GROUPS.find(([label]) => label === group)?.[1] ?? [];
    if (keywords.some((keyword) => text.includes(keyword))) topicScore += 10;
  });
  return profileSimilarity(post.profile) + topicScore + recency;
}

function rankedLakePosts() {
  const recentCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const candidates = state.posts.filter((post) => new Date(post.created_at).getTime() >= recentCutoff);
  const others = candidates.filter((post) => post.user_id !== state.user?.id);
  const pool = others.length ? others : candidates;
  return pool
    .map((post) => ({ post, score: postRelevance(post) }))
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
  if (lower.includes("duplicate key") || error?.code === "23505") return "すでに学習中です。画面を更新してください。";
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

function showOnly(viewName) {
  $("#authView").hidden = viewName !== "auth";
  $("#onboardingView").hidden = viewName !== "onboarding";
  $("#appView").hidden = viewName !== "app";
}

function showPage(pageName, updateHash = true) {
  if (!state.session) return;
  const allowed = ["home", "aquarium", "board", "mypage"];
  const nextPage = allowed.includes(pageName) ? pageName : "home";

  $$('[data-page]').forEach((page) => {
    const active = page.dataset.page === nextPage;
    page.hidden = !active;
    page.classList.toggle("active", active);
  });
  $$('[data-view]').forEach((button) => {
    button.classList.toggle("active", button.dataset.view === nextPage);
  });
  if (updateHash) {
    const nextUrl = new URL(location.href);
    nextUrl.hash = nextPage;
    history.replaceState(null, "", nextUrl);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindStaticEvents() {
  $("#loginTab").addEventListener("click", () => setAuthMode("login"));
  $("#signupTab").addEventListener("click", () => setAuthMode("signup"));
  $("#loginForm").addEventListener("submit", login);
  $("#signupForm").addEventListener("submit", signup);
  $("#profileForm").addEventListener("submit", saveInitialProfile);
  $("#editProfileForm").addEventListener("submit", saveEditedProfile);

  $$('[data-view]').forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.view));
  });
  $$('[data-view-link]').forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      showPage(link.dataset.viewLink);
    });
  });

  $("#startStudyButton").addEventListener("click", startStudy);
  $("#stopStudyButton").addEventListener("click", stopStudy);
  $("#aquariumStopStudyButton").addEventListener("click", stopStudy);
  $("#studyTopic").addEventListener("keydown", (event) => {
    if (event.key === "Enter") startStudy();
  });
  $("#refreshLakeButton").addEventListener("click", async () => {
    if (!IS_PREVIEW_MODE) await Promise.all([loadActiveSessions(), loadPosts(), loadReplies()]);
    showToast("湖を更新しました。", "success");
  });
  $("#closeFishDrawer").addEventListener("click", () => {
    $("#fishDrawer").hidden = true;
  });

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
  $("#postList").addEventListener("click", handlePostListClick);
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
  $("#analyzePostButton").addEventListener("click", () => runAiHelper("analyze"));
  $("#rewritePostButton").addEventListener("click", () => runAiHelper("rewrite"));

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

  window.addEventListener("hashchange", () => showPage(location.hash.slice(1), false));
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

async function routeSession(session) {
  const routeVersion = ++state.routeVersion;
  state.session = session;
  state.user = session?.user ?? null;

  if (!session) {
    cleanupSignedInState();
    showOnly("auth");
    return;
  }

  try {
    let { data: profile, error } = await supabase
      .from("profiles")
      .select(PROFILE_FIELDS)
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error && isMissingInterestsColumn(error)) {
      state.interestsColumnAvailable = false;
      ({ data: profile, error } = await supabase
        .from("profiles")
        .select(PROFILE_FIELDS_WITHOUT_INTERESTS)
        .eq("user_id", session.user.id)
        .maybeSingle());
    }
    if (error) throw error;
    if (routeVersion !== state.routeVersion) return;

    state.profile = normalizeProfile(profile);
    if (!state.profile?.nickname) {
      showOnly("onboarding");
      return;
    }

    showOnly("app");
    renderProfileIdentity();
    showPage(location.hash.slice(1) || "home", false);
    await loadAll();
    subscribeToRealtime();
  } catch (error) {
    showOnly("auth");
    showToast(`初期データを読めませんでした: ${readableError(error)}`, "error");
  }
}

function cleanupSignedInState() {
  state.profile = null;
  state.activeSessions = [];
  state.posts = [];
  state.replies = [];
  state.mySessions = [];
  state.myPosts = [];
  state.currentStudy = null;
  state.likedPostIds.clear();
  state.onlineUserIds.clear();
  state.presenceReady = false;
  stopTimer();
  if (state.realtimeChannel) {
    supabase.removeChannel(state.realtimeChannel);
    state.realtimeChannel = null;
  }
  if (state.presenceChannel) {
    supabase.removeChannel(state.presenceChannel);
    state.presenceChannel = null;
  }
}

async function saveInitialProfile(event) {
  event.preventDefault();
  if (!event.currentTarget.reportValidity() || !state.user) return;
  const button = $("button[type='submit']", event.currentTarget);
  setButtonLoading(button, true);

  try {
    const profile = {
      user_id: state.user.id,
      nickname: $("#profileNickname").value.trim(),
      grade: $("#profileGrade").value,
      major: $("#profileMajor").value.trim(),
      interests: parseInterests($("#profileInterests").value),
      fish_type: $("input[name='fishType']:checked").value,
    };
    if (!state.interestsColumnAvailable) delete profile.interests;
    const { data, error } = await supabase
      .from("profiles")
      .upsert(profile, { onConflict: "user_id" })
      .select()
      .single();
    if (error) throw error;
    state.profile = normalizeProfile(data);
    showOnly("app");
    renderProfileIdentity();
    showPage("home");
    await loadAll();
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
  const results = await Promise.allSettled([loadActiveSessions(), loadPosts(), loadReplies(), loadMyData()]);
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
    .select(PROFILE_PUBLIC_FIELDS)
    .in("user_id", uniqueIds);
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

async function loadActiveSessions() {
  const recentCutoff = new Date(Date.now() - ACTIVE_SESSION_MAX_AGE_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("study_sessions")
    .select("id,user_id,study_topic,started_at,ended_at,status")
    .eq("status", "active")
    .gte("started_at", recentCutoff)
    .order("started_at", { ascending: false })
    .limit(60);
  if (error) throw error;

  const profiles = await fetchProfiles((data ?? []).map((session) => session.user_id));
  state.activeSessions = (data ?? []).map((session) => ({
    ...session,
    profile: profiles.get(session.user_id) ?? null,
  }));
  state.currentStudy = state.activeSessions.find((session) => session.user_id === state.user?.id) ?? null;
  renderStudyController();
  renderLake();
  renderHome();
}

async function loadPosts() {
  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select("id,user_id,title,body,category,post_type,like_count,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(60);
  if (postsError) throw postsError;

  const profiles = await fetchProfiles((posts ?? []).map((post) => post.user_id));
  const { data: myLikes, error: likesError } = await supabase
    .from("post_likes")
    .select("post_id")
    .eq("user_id", state.user.id);
  if (likesError) throw likesError;

  state.likedPostIds = new Set((myLikes ?? []).map((like) => like.post_id));
  state.posts = (posts ?? []).map((post) => ({
    ...post,
    profile: profiles.get(post.user_id) ?? null,
  }));
  renderPosts();
  renderBottles();
  renderHome();

  if (state.selectedPostId && $("#postDialog").open) {
    openPost(state.selectedPostId, false);
  }
}

async function loadReplies() {
  const { data: replies, error } = await supabase
    .from("post_replies")
    .select("id,post_id,sender_user_id,recipient_user_id,body,is_read,created_at")
    .order("created_at", { ascending: false })
    .limit(240);
  if (error) throw error;

  const profiles = await fetchProfiles((replies ?? []).map((reply) => reply.sender_user_id));
  state.replies = (replies ?? []).map((reply) => ({
    ...reply,
    profile: profiles.get(reply.sender_user_id) ?? null,
  }));
  renderPosts();
  renderBottles();
  renderMyPosts();
  renderHome();
  if (state.selectedPostId && $("#postDialog").open) renderReplies(state.selectedPostId);
}

async function loadMyData() {
  const [sessionResult, postResult] = await Promise.all([
    supabase
      .from("study_sessions")
      .select("id,study_topic,started_at,ended_at,status")
      .eq("user_id", state.user.id)
      .order("started_at", { ascending: false })
      .limit(100),
    supabase
      .from("posts")
      .select("id,title,category,post_type,like_count,created_at")
      .eq("user_id", state.user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (sessionResult.error) throw sessionResult.error;
  if (postResult.error) throw postResult.error;
  state.mySessions = sessionResult.data ?? [];
  state.myPosts = postResult.data ?? [];
  renderMyPage();
  renderHome();
}

function subscribeToRealtime() {
  if (state.realtimeChannel) supabase.removeChannel(state.realtimeChannel);
  if (state.presenceChannel) supabase.removeChannel(state.presenceChannel);
  state.realtimeChannel = supabase
    .channel(`manabium-${state.user.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "study_sessions" }, () => scheduleRealtimeReload("study"))
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => scheduleRealtimeReload("posts"))
    .on("postgres_changes", { event: "*", schema: "public", table: "post_likes" }, () => scheduleRealtimeReload("posts"))
    .on("postgres_changes", { event: "*", schema: "public", table: "post_replies" }, () => scheduleRealtimeReload("replies"))
    .subscribe();

  state.presenceReady = false;
  state.presenceChannel = supabase
    .channel("manabium-online", { config: { presence: { key: state.user.id } } })
    .on("presence", { event: "sync" }, () => {
      const snapshot = state.presenceChannel.presenceState();
      const onlineIds = new Set(Object.keys(snapshot));
      Object.values(snapshot).flat().forEach((presence) => {
        if (presence.user_id) onlineIds.add(presence.user_id);
      });
      state.onlineUserIds = onlineIds;
      state.presenceReady = true;
      renderLake();
      renderHome();
    })
    .subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      await state.presenceChannel.track({
        user_id: state.user.id,
        online_at: new Date().toISOString(),
      });
    });
}

function scheduleRealtimeReload(kind) {
  window.clearTimeout(state.realtimeReloadTimer);
  state.realtimeReloadTimer = window.setTimeout(async () => {
    try {
      if (kind === "study") await Promise.all([loadActiveSessions(), loadMyData()]);
      else if (kind === "replies") await Promise.all([loadReplies(), loadMyData()]);
      else await Promise.all([loadPosts(), loadReplies(), loadMyData()]);
    } catch (error) {
      console.error("Realtime refresh failed", error);
    }
  }, 350);
}

async function startStudy() {
  const topic = $("#studyTopic").value.trim();
  if (!topic) {
    showToast("今日勉強する内容を入力してください。", "error");
    $("#studyTopic").focus();
    return;
  }
  const button = $("#startStudyButton");
  setButtonLoading(button, true);
  try {
    if (IS_PREVIEW_MODE) {
      const previewSession = {
        id: `preview-session-${Date.now()}`,
        user_id: state.user.id,
        study_topic: topic,
        started_at: new Date().toISOString(),
        ended_at: null,
        status: "active",
        profile: state.profile,
      };
      state.currentStudy = previewSession;
      state.activeSessions.unshift(previewSession);
      $("#studyTopic").value = "";
      renderStudyController();
      renderLake();
      showPage("aquarium");
      showToast("学習を始めました。一緒にがんばりましょう。", "success");
      return;
    }
    const { data, error } = await supabase
      .from("study_sessions")
      .insert({
        user_id: state.user.id,
        study_topic: topic,
        status: "active",
      })
      .select()
      .single();
    if (error) throw error;
    state.currentStudy = { ...data, profile: state.profile };
    $("#studyTopic").value = "";
    renderStudyController();
    await Promise.all([loadActiveSessions(), loadMyData()]);
    showPage("aquarium");
    showToast("学習を始めました。一緒にがんばりましょう。", "success");
  } catch (error) {
    showToast(readableError(error), "error");
  } finally {
    setButtonLoading(button, false);
  }
}

async function stopStudy() {
  if (!state.currentStudy) return;
  [$("#stopStudyButton"), $("#aquariumStopStudyButton")].forEach((button) => setButtonLoading(button, true));
  try {
    if (IS_PREVIEW_MODE) {
      const endedAt = new Date().toISOString();
      state.mySessions.unshift({ ...state.currentStudy, ended_at: endedAt, status: "completed" });
      state.activeSessions = state.activeSessions.filter((session) => session.id !== state.currentStudy.id);
      state.currentStudy = null;
      renderStudyController();
      renderLake();
      renderMyPage();
      showToast("おつかれさまでした。学習時間を記録しました。", "success");
      return;
    }
    const { error } = await supabase
      .from("study_sessions")
      .update({ status: "completed", ended_at: new Date().toISOString() })
      .eq("id", state.currentStudy.id)
      .eq("user_id", state.user.id);
    if (error) throw error;
    state.currentStudy = null;
    renderStudyController();
    await Promise.all([loadActiveSessions(), loadMyData()]);
    showToast("おつかれさまでした。学習時間を記録しました。", "success");
  } catch (error) {
    showToast(readableError(error), "error");
  } finally {
    [$("#stopStudyButton"), $("#aquariumStopStudyButton")].forEach((button) => setButtonLoading(button, false));
  }
}

function renderStudyController() {
  const running = Boolean(state.currentStudy);
  $("#studyStartControls").hidden = running;
  $("#studyRunningControls").hidden = !running;
  $("#aquariumStudyDock").hidden = !running;
  if (running) {
    $("#runningTopic").textContent = state.currentStudy.study_topic;
    $("#aquariumStudyTopic").textContent = state.currentStudy.study_topic;
    startTimer();
  } else {
    stopTimer();
    $("#studyTimer").textContent = "00:00:00";
    $("#aquariumStudyTimer").textContent = "00:00:00";
  }
}

function startTimer() {
  stopTimer();
  const update = () => {
    if (!state.currentStudy) return;
    const milliseconds = Date.now() - new Date(state.currentStudy.started_at).getTime();
    const time = formatClock(milliseconds);
    $("#studyTimer").textContent = time;
    $("#aquariumStudyTimer").textContent = time;
  };
  update();
  state.timerId = window.setInterval(update, 1000);
}

function stopTimer() {
  if (state.timerId) window.clearInterval(state.timerId);
  state.timerId = null;
}

function formatClock(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function hashNumber(value) {
  return [...String(value)].reduce((total, character) => ((total << 5) - total + character.charCodeAt(0)) | 0, 0);
}

function renderLake() {
  const layer = $("#fishLayer");
  layer.replaceChildren();
  const activeSessions = activeStudySessions();
  const visibleSessions = rankedActiveSessions().slice(0, MAX_LAKE_FISH);
  $("#activeUserCount").textContent = String(activeSessions.length);
  $("#lakeEmpty").hidden = visibleSessions.length > 0;

  visibleSessions.forEach((session, index) => {
    const profile = session.profile ?? { nickname: "湖の仲間", fish_type: "aqua", grade: "—", major: "—", interests: [] };
    const fish = FISH[profile.fish_type] ?? FISH.aqua;
    const seed = Math.abs(hashNumber(session.id));
    const similarity = profileSimilarity(profile);
    const isMe = session.user_id === state.user?.id;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "swimming-fish";
    button.classList.toggle("is-me", isMe);
    button.classList.toggle("is-similar", !isMe && similarity >= 22);
    button.setAttribute("aria-label", `${profile.nickname}さんの学習情報を見る`);
    button.style.setProperty("--top", `${20 + (seed % 50)}%`);
    button.style.setProperty("--static-left", `${12 + ((seed + index * 21) % 58)}%`);
    button.style.setProperty("--drift-x", `${38 + (seed % 54)}px`);
    button.style.setProperty("--drift-y", `${-10 + (seed % 21)}px`);
    button.style.setProperty("--delay", `${-(seed % 13)}s`);
    button.style.setProperty("--duration", `${18 + (seed % 11)}s`);
    button.style.setProperty("--fish-filter", fish.filter);
    button.innerHTML = `<img class="fish-asset" src="${FISH_ASSET_URL}" alt="" /><span class="fish-label">${escapeHTML(profile.nickname)}${isMe ? "（あなた）" : ""}</span>`;
    button.addEventListener("click", () => openFishDrawer(session));
    layer.append(button);
  });
}

function renderHome() {
  if (!state.user) return;

  if (state.profile?.nickname) {
    $("#homeGreetingName").textContent = state.profile.nickname;
  }
  $("#homeActiveUserCount").textContent = String(activeStudySessions().length);

  const latestPost = state.posts[0];
  if (latestPost) {
    $("#homeLatestPostTitle").textContent = latestPost.title;
    $("#homeLatestPostMeta").textContent = `${latestPost.category}・${latestPost.profile?.nickname ?? "湖の仲間"}・${formatRelativeDate(latestPost.created_at)}`;
  } else {
    $("#homeLatestPostTitle").textContent = "まだ新しいボトルはありません";
    $("#homeLatestPostMeta").textContent = "授業・研究・進路の体験を探せます。";
  }

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const completedThisWeek = state.mySessions.filter((session) => (
    session.status === "completed"
    && session.ended_at
    && new Date(session.ended_at).getTime() >= sevenDaysAgo
  ));
  const weeklyMilliseconds = completedThisWeek.reduce((total, session) => (
    total + Math.max(0, new Date(session.ended_at).getTime() - new Date(session.started_at).getTime())
  ), 0);
  const unreadReplies = state.replies.filter((reply) => (
    reply.recipient_user_id === state.user.id && !reply.is_read
  )).length;

  $("#homeStudyTime").textContent = formatLongDuration(weeklyMilliseconds);
  $("#homeSessionCount").textContent = `${completedThisWeek.length}回`;
  $("#homeReplyCount").textContent = `${unreadReplies}件`;
}

function renderBottles() {
  const layer = $("#bottleLayer");
  layer.replaceChildren();
  rankedLakePosts().forEach((post, index) => {
    const seed = Math.abs(hashNumber(post.id));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "floating-bottle";
    button.classList.toggle("is-similar", profileSimilarity(post.profile) >= 22 || postRelevance(post) >= 34);
    button.setAttribute("aria-label", `投稿「${post.title}」を読む`);
    button.style.left = `${10 + ((seed + index * 19) % 78)}%`;
    button.style.top = `${17 + ((seed + index * 11) % 60)}%`;
    button.style.setProperty("--rotation", `${-14 + (seed % 29)}deg`);
    button.style.setProperty("--delay", `${-(seed % 5)}s`);
    button.addEventListener("click", () => openPost(post.id));
    layer.append(button);
  });

  const latestReplyByPost = new Map();
  state.replies.forEach((reply) => {
    if (reply.recipient_user_id !== state.user?.id || reply.sender_user_id === state.user?.id || latestReplyByPost.has(reply.post_id)) return;
    latestReplyByPost.set(reply.post_id, reply);
  });

  [...latestReplyByPost.values()].slice(0, 3).forEach((reply, index) => {
    const post = state.posts.find((item) => item.id === reply.post_id);
    const seed = Math.abs(hashNumber(reply.id));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "floating-bottle reply-bottle";
    button.setAttribute("aria-label", `「${post?.title ?? "あなたの投稿"}」への返信を読む`);
    button.style.left = `${18 + ((seed + index * 27) % 65)}%`;
    button.style.top = `${22 + ((seed + index * 13) % 52)}%`;
    button.style.setProperty("--rotation", `${-10 + (seed % 21)}deg`);
    button.style.setProperty("--delay", `${-(seed % 5)}s`);
    button.addEventListener("click", () => openReplyBottle(reply));
    layer.append(button);
  });
}

async function openReplyBottle(reply) {
  openPost(reply.post_id);
  if (reply.is_read || reply.recipient_user_id !== state.user?.id) return;

  try {
    if (IS_PREVIEW_MODE) {
      reply.is_read = true;
      renderBottles();
      renderHome();
      return;
    }
    const { error } = await supabase
      .from("post_replies")
      .update({ is_read: true })
      .eq("id", reply.id)
      .eq("recipient_user_id", state.user.id);
    if (error) throw error;
    await loadReplies();
  } catch (error) {
    console.error("Failed to mark reply as read", error);
  }
}

function openFishDrawer(session) {
  const profile = session.profile ?? { nickname: "湖の仲間", grade: "—", major: "—", fish_type: "aqua", interests: [] };
  const fish = FISH[profile.fish_type] ?? FISH.aqua;
  const isMe = session.user_id === state.user?.id;
  const matchBadge = $("#drawerMatchBadge");
  $("#drawerFish").src = FISH_ASSET_URL;
  $("#drawerFish").style.filter = fish.filter;
  $("#drawerName").textContent = `${profile.nickname}${isMe ? "（あなた）" : ""}`;
  $("#drawerMeta").textContent = `${profile.grade || "学年未設定"}・${profile.major || "専攻未設定"}`;
  const interests = parseInterests(profile.interests);
  $("#drawerInterests").innerHTML = interests.map((interest) => `<span>${escapeHTML(interest)}</span>`).join("");
  $("#drawerInterests").hidden = interests.length === 0;
  matchBadge.hidden = isMe || profileSimilarity(profile) < 22;
  $("#drawerTopic").textContent = session.study_topic;
  $("#drawerElapsed").textContent = `${formatShortDuration(Date.now() - new Date(session.started_at).getTime())} 勉強中`;
  $("#fishDrawer").hidden = false;
}

function renderPosts() {
  const visiblePosts = state.selectedCategory === "all"
    ? state.posts
    : state.posts.filter((post) => post.category === state.selectedCategory);
  const list = $("#postList");
  list.replaceChildren();
  $("#postEmpty").hidden = visiblePosts.length > 0;

  visiblePosts.forEach((post) => {
    const card = document.createElement("article");
    card.className = "post-card";
    card.style.setProperty("--card-wash", CATEGORY_COLORS[post.category] ?? CATEGORY_COLORS.授業);
    const liked = state.likedPostIds.has(post.id);
    const replyCount = state.replies.filter((reply) => reply.post_id === post.id).length;
    const author = post.profile?.nickname ?? "湖の仲間";
    const excerpt = post.body.length > 130 ? `${post.body.slice(0, 130)}…` : post.body;
    card.innerHTML = `
      <button class="post-open-button" type="button" data-action="open" data-post-id="${post.id}">
        <span class="post-badges">
          <span class="post-badge">${escapeHTML(post.category)}</span>
          <span class="post-badge type">${escapeHTML(post.post_type)}</span>
        </span>
        <h2>${escapeHTML(post.title)}</h2>
        <p class="post-excerpt">${escapeHTML(excerpt)}</p>
      </button>
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
  $("#aiResult").hidden = true;
  $("#aiResult").textContent = "";
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
    const { error } = await supabase.from("posts").insert({
      user_id: state.user.id,
      title: $("#postTitle").value.trim(),
      body: $("#postBody").value.trim(),
      category: $("#postCategory").value,
      post_type: $("#postType").value,
    });
    if (error) throw error;
    form.reset();
    $("#postCharacterCount").textContent = "0";
    closeDialog("composerDialog");
    await Promise.all([loadPosts(), loadMyData()]);
    showToast("ボトルを湖へ流しました。", "success");
  } catch (error) {
    showToast(readableError(error), "error");
  } finally {
    setButtonLoading(button, false);
  }
}

function openPost(postId, show = true) {
  const post = state.posts.find((item) => item.id === postId);
  if (!post) return;
  state.selectedPostId = post.id;
  $("#detailBadges").innerHTML = `<span class="post-badge">${escapeHTML(post.category)}</span><span class="post-badge type">${escapeHTML(post.post_type)}</span>`;
  $("#detailTitle").textContent = post.title;
  $("#detailMeta").textContent = `${post.profile?.nickname ?? "湖の仲間"}・${post.profile?.grade ?? "学年未設定"}・${formatRelativeDate(post.created_at)}`;
  $("#detailBody").textContent = post.body;
  const liked = state.likedPostIds.has(post.id);
  const isOwner = post.user_id === state.user.id;
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

    const { error } = await supabase
      .from("posts")
      .update({
        category: updates.category,
        post_type: updates.post_type,
        title: updates.title,
        body: updates.body,
      })
      .eq("id", post.id)
      .eq("user_id", state.user.id);
    if (error) throw error;
    closeDialog("editPostDialog");
    await Promise.all([loadPosts(), loadMyData()]);
    openPost(post.id);
    showToast("ボトルの内容を更新しました。", "success");
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

  replies.forEach((reply) => {
    const item = document.createElement("article");
    item.className = "reply-item";
    const author = reply.profile?.nickname ?? "湖の仲間";
    const meta = [reply.profile?.grade, reply.profile?.major].filter(Boolean).join("・");
    item.innerHTML = `
      <p>${escapeHTML(reply.body)}</p>
      <footer>${escapeHTML(author)}${meta ? `・${escapeHTML(meta)}` : ""}・${formatRelativeDate(reply.created_at)}</footer>`;
    container.append(item);
  });
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
    renderHome();
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

async function runAiHelper(mode) {
  const title = $("#postTitle").value.trim();
  const body = $("#postBody").value.trim();
  if (!body) {
    showToast("先に本文を入力してください。", "error");
    $("#postBody").focus();
    return;
  }

  const button = mode === "analyze" ? $("#analyzePostButton") : $("#rewritePostButton");
  const originalText = button.textContent;
  button.textContent = "確認中…";
  button.disabled = true;
  $("#aiResult").hidden = false;
  $("#aiResult").textContent = "AIが文章を確認しています…";

  try {
    if (IS_PREVIEW_MODE) {
      $("#aiResult").textContent = mode === "analyze"
        ? "文章の雰囲気: やわらかく相談しやすい表現です。\n\nプレビューではAI APIを呼ばず、表示だけ確認できます。"
        : "プレビューでは本文を変更せず、AIサポート結果の表示だけ確認できます。";
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("ログインの有効期限が切れました。もう一度ログインしてください。");

    const response = await fetch("/api/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        mode,
        title,
        body,
        category: $("#postCategory").value,
        postType: $("#postType").value,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "AI機能を利用できませんでした。");

    if (mode === "analyze") {
      const sentiment = result.sentiment;
      $("#aiResult").textContent = `文章の雰囲気: ${sentiment.labelJa}\n確信度: ${Math.round(sentiment.confidence * 100)}%\n\nこれは投稿の良し悪しを判定するものではありません。意図と違う印象なら、少し言葉を足してみましょう。`;
    } else {
      const suggestion = result.suggestion;
      if (suggestion.title) $("#postTitle").value = suggestion.title.slice(0, 80);
      if (suggestion.body) $("#postBody").value = suggestion.body.slice(0, 2000);
      $("#postCharacterCount").textContent = String($("#postBody").value.length);
      $("#aiResult").textContent = `${suggestion.summary || "読みやすい文章に整えました。"}\n内容を確認し、自分の意図と違う箇所は投稿前に直してください。`;
    }
  } catch (error) {
    $("#aiResult").textContent = `AIサポートを使えませんでした。${readableError(error)}`;
  } finally {
    button.textContent = originalText;
    button.disabled = false;
  }
}

function renderProfileIdentity() {
  if (!state.profile) return;
  const fish = FISH[state.profile.fish_type] ?? FISH.aqua;
  $("#homeGreetingName").textContent = state.profile.nickname;
  $("#headerFish").firstElementChild.src = FISH_ASSET_URL;
  $("#headerFish").firstElementChild.style.filter = fish.filter;
  $("#myFish").src = FISH_ASSET_URL;
  $("#myFish").style.filter = fish.filter;
  $("#myNickname").textContent = state.profile.nickname;
  $("#myMeta").textContent = `${state.profile.grade}・${state.profile.major}`;
  const interests = parseInterests(state.profile.interests);
  $("#myInterests").innerHTML = interests.map((interest) => `<span>${escapeHTML(interest)}</span>`).join("");
  $("#myInterests").hidden = interests.length === 0;
}

function renderMyPage() {
  renderProfileIdentity();
  const completed = state.mySessions.filter((session) => session.status === "completed" && session.ended_at);
  const totalMilliseconds = completed.reduce((total, session) => {
    return total + Math.max(0, new Date(session.ended_at).getTime() - new Date(session.started_at).getTime());
  }, 0);
  $("#totalStudyTime").textContent = formatLongDuration(totalMilliseconds);
  $("#completedSessionCount").textContent = `${completed.length}回`;
  $("#myPostCount").textContent = `${state.myPosts.length}件`;
  renderWeeklyChart(completed);
  renderSessionHistory();
  renderMyPosts();
  renderHome();
}

function renderWeeklyChart(completedSessions) {
  const chart = $("#weeklyChart");
  chart.replaceChildren();
  const days = [];
  const now = new Date();
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const nextDay = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    const milliseconds = completedSessions
      .filter((session) => {
        const started = new Date(session.started_at);
        return started >= day && started < nextDay;
      })
      .reduce((total, session) => total + Math.max(0, new Date(session.ended_at) - new Date(session.started_at)), 0);
    days.push({ day, minutes: Math.round(milliseconds / 60000) });
  }
  const maxMinutes = Math.max(...days.map((day) => day.minutes), 30);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  days.forEach(({ day, minutes }) => {
    const column = document.createElement("div");
    column.className = "chart-column";
    column.title = `${day.getMonth() + 1}/${day.getDate()}：${minutes}分`;
    const height = Math.max(4, Math.round((minutes / maxMinutes) * 76));
    column.innerHTML = `<span class="chart-bar" style="height:${height}px"></span><span class="chart-label">${weekdays[day.getDay()]}</span>`;
    chart.append(column);
  });
}

function renderSessionHistory() {
  const container = $("#sessionHistory");
  container.replaceChildren();
  const sessions = state.mySessions.filter((session) => session.status === "completed" && session.ended_at).slice(0, 6);
  if (!sessions.length) {
    container.innerHTML = '<p class="history-empty">学習を終了すると、ここに記録が残ります。</p>';
    return;
  }
  sessions.forEach((session) => {
    const duration = new Date(session.ended_at) - new Date(session.started_at);
    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `<div><strong>${escapeHTML(session.study_topic)}</strong><span>${formatDate(session.started_at)}</span></div><span class="history-value">${formatShortDuration(duration)}</span>`;
    container.append(item);
  });
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
  $("#editMajor").value = state.profile.major;
  $("#editInterests").value = parseInterests(state.profile.interests).join("、");
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
    const updates = {
      nickname: $("#editNickname").value.trim(),
      grade: $("#editGrade").value,
      major: $("#editMajor").value.trim(),
      interests: parseInterests($("#editInterests").value),
      fish_type: $("input[name='editFishType']:checked").value,
    };
    if (!state.interestsColumnAvailable) delete updates.interests;
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
    await loadActiveSessions();
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

function formatLongDuration(milliseconds) {
  const minutes = Math.round(milliseconds / 60000);
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  return `${hours}時間${minutes % 60 ? `${minutes % 60}分` : ""}`;
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
  };
  const members = [
    { user_id: "preview-a", nickname: "あおい", grade: "高校3年", major: "建築", interests: ["都市計画", "環境デザイン"], fish_type: "aqua" },
    { user_id: "preview-b", nickname: "りこ", grade: "大学1年", major: "生命科学", interests: ["細胞", "医療"], fish_type: "mint" },
    { user_id: "preview-c", nickname: "すず", grade: "大学3年", major: "応用化学", interests: ["材料", "有機化学"], fish_type: "lemon" },
    { user_id: "preview-d", nickname: "しおり", grade: "大学院", major: "機械工学", interests: ["ロボット", "制御工学"], fish_type: "lilac" },
  ];

  state.session = { user: { id: userId } };
  state.user = { id: userId };
  state.profile = me;
  state.activeSessions = members.map((profile, index) => ({
    id: `preview-active-${index}`,
    user_id: profile.user_id,
    study_topic: ["数学IIIの微分", "細胞生物学の復習", "有機化学レポート", "制御工学の課題"][index],
    started_at: new Date(now - (index + 2) * 11 * 60000).toISOString(),
    ended_at: null,
    status: "active",
    profile,
  }));
  state.posts = [
    {
      id: "preview-post-1",
      user_id: userId,
      title: "研究室選びで見ておくとよかったこと",
      body: "研究テーマだけでなく、普段のゼミの雰囲気や先輩の過ごし方も知ってから決めたいです。見学で聞いてよかった質問があれば教えてください。",
      category: "研究",
      post_type: "相談",
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
      sender_user_id: userId,
      recipient_user_id: members[1].user_id,
      body: "予想と違った点を一つ選んで、原因の候補と追加で確かめたいことを書くと考察らしくまとまりました。",
      is_read: true,
      created_at: new Date(now - 2 * 3600000).toISOString(),
      profile: me,
    },
  ];
  state.mySessions = [
    {
      id: "preview-history-1",
      study_topic: "アルゴリズム演習",
      started_at: new Date(now - 26 * 3600000).toISOString(),
      ended_at: new Date(now - 25 * 3600000).toISOString(),
      status: "completed",
    },
    {
      id: "preview-history-2",
      study_topic: "線形代数の復習",
      started_at: new Date(now - 3 * 86400000).toISOString(),
      ended_at: new Date(now - 3 * 86400000 + 42 * 60000).toISOString(),
      status: "completed",
    },
  ];
  state.myPosts = state.posts.filter((post) => post.user_id === userId);
  state.likedPostIds = new Set(["preview-post-2"]);
  state.currentStudy = null;

  document.body.classList.add("preview-mode");
  showOnly("app");
  renderProfileIdentity();
  renderStudyController();
  renderLake();
  renderPosts();
  renderBottles();
  renderMyPage();
  showPage(location.hash.slice(1) || "home", false);
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
