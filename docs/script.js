"use strict";

// ─── 状態 ────────────────────────────────────────────────────────────────────

let allPrograms = [];
let showMyListOnly = false;

// 後で見るリスト (URL の Set)
let watchLater = new Set(JSON.parse(localStorage.getItem("watchLater") || "[]"));

// フィルター状態
const filters = { type: null, genre: null, text: "" };

// ─── 初期化 ──────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  initMyListButton();
  initSearchInput();
  initSettingsModal();
  initFilterBarResize();

  try {
    const resp = await fetch("data.json");
    const data = await resp.json();
    allPrograms = data.programs || [];

    document.getElementById("updated-at").textContent =
      data.updatedAt ? data.updatedAt.slice(0, 10) : "不明";

    buildFilterMenus();
    renderCards();
  } catch (e) {
    console.error("data.json 読み込みエラー:", e);
    document.getElementById("loading").innerHTML =
      '<p class="text-danger">データの読み込みに失敗しました</p>';
  }
});

// フィルターバーの高さ変化に合わせてメインコンテンツの上余白を追従させる
function initFilterBarResize() {
  const filterBar = document.getElementById("filter-bar");
  const main = document.getElementById("main-content");
  const update = () => {
    main.style.paddingTop = filterBar.offsetHeight + 12 + "px";
  };
  new ResizeObserver(update).observe(filterBar);
  update();
}

// ─── フィルターメニュー ────────────────────────────────────────────────────────

function buildFilterMenus() {
  const typeCounts = {};
  const genreCounts = {};
  allPrograms.forEach(p => {
    typeCounts[p.type] = (typeCounts[p.type] || 0) + 1;
    if (p.genre) genreCounts[p.genre] = (genreCounts[p.genre] || 0) + 1;
  });

  const types = Object.keys(typeCounts).sort();
  const genres = Object.keys(genreCounts).sort();

  buildMenu("type-menu", "type-btn", types, typeCounts, "番組タイプ", v => {
    filters.type = v;
    renderCards();
  });
  buildMenu("genre-menu", "genre-btn", genres, genreCounts, "ジャンル", v => {
    filters.genre = v;
    renderCards();
  });
}

function buildMenu(menuId, btnId, items, counts, label, onSelect) {
  const menu = document.getElementById(menuId);
  const btn = document.getElementById(btnId);

  // 「すべて」項目
  menu.appendChild(makeDropdownItem("すべて", () => {
    onSelect(null);
    btn.textContent = label;
    btn.classList.remove("active");
  }));

  items.forEach(item => {
    const count = counts[item] || 0;
    const li = makeDropdownItem(`${item}`, () => {
      onSelect(item);
      btn.textContent = item;
      btn.classList.add("active");
    });
    // 件数をグレーで右寄せ表示
    const countSpan = document.createElement("span");
    countSpan.className = "dropdown-count";
    countSpan.textContent = count;
    li.appendChild(countSpan);
    menu.appendChild(li);
  });
}

function makeDropdownItem(text, onClick) {
  const a = document.createElement("a");
  a.className = "dropdown-item";
  a.href = "#";
  a.textContent = text;
  a.addEventListener("click", e => { e.preventDefault(); onClick(); });
  return a;
}

// ─── テキスト検索 ─────────────────────────────────────────────────────────────

function initSearchInput() {
  const input = document.getElementById("search-input");
  const clearBtn = document.getElementById("search-clear");

  input.addEventListener("input", () => {
    filters.text = input.value;
    clearBtn.classList.toggle("hidden", !input.value);
    renderCards();
  });
  clearBtn.addEventListener("click", () => {
    input.value = "";
    filters.text = "";
    clearBtn.classList.add("hidden");
    renderCards();
  });
}

// ─── フィルタリング ────────────────────────────────────────────────────────────

function matchesFilters(program) {
  if (showMyListOnly && !watchLater.has(program.url)) return false;
  if (filters.type && program.type !== filters.type) return false;
  if (filters.genre && program.genre !== filters.genre) return false;
  if (filters.text) {
    const q = filters.text.toLowerCase();
    if (!program.title.toLowerCase().includes(q)) return false;
  }
  return true;
}

// ─── カードレンダリング ────────────────────────────────────────────────────────

function renderCards() {
  const grid = document.getElementById("video-grid");
  const loading = document.getElementById("loading");
  const empty = document.getElementById("empty-message");

  loading.classList.add("hidden");
  grid.innerHTML = "";

  const visible = allPrograms.filter(matchesFilters);

  document.getElementById("result-count").textContent = `${visible.length}件`;

  if (visible.length === 0) {
    grid.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  grid.classList.remove("hidden");

  const tpl = document.getElementById("card-template");

  visible.forEach(program => {
    const card = tpl.content.cloneNode(true);
    const root = card.querySelector(".video-card");

    // サムネイル → Web URL を新規タブで開く
    const thumbLink = card.querySelector(".card-thumb-link");
    thumbLink.href = program.url;
    thumbLink.target = "_blank";
    const thumb = card.querySelector(".card-thumb");
    thumb.src = program.thumbnail;
    thumb.alt = program.title;
    thumb.onerror = function() { this.style.visibility = "hidden"; };

    // バッジ
    setTextOrHide(card.querySelector(".badge-type"), program.type);
    setTextOrHide(card.querySelector(".badge-genre"), program.genre);
    if (program.viewerPlanType) card.querySelector(".badge-paid").classList.remove("hidden");
    if (program.releaseState === "ended") card.querySelector(".badge-ended").classList.remove("hidden");

    // タイトル → Web URL を新規タブで開く
    const titleLink = card.querySelector(".card-title-link");
    titleLink.href = program.url;
    titleLink.target = "_blank";
    card.querySelector(".card-title").textContent = program.title;

    // メタ情報
    card.querySelector(".card-date").textContent = formatDate(program.broadcastAt);
    card.querySelector(".card-duration").textContent = program.duration || "";

    // アプリで開くボタン → app.shirasu.io URL を新規タブで開く
    card.querySelector(".open-app-btn").addEventListener("click", () => openInApp(program.url));

    // 後で見るボタン
    const wlBtn = card.querySelector(".watchlater-btn");
    updateWatchLaterBtn(wlBtn, watchLater.has(program.url));
    wlBtn.addEventListener("click", () => toggleWatchLater(program.url, wlBtn));

    // MyList フィルター中かどうかのクラス
    if (watchLater.has(program.url)) root.classList.add("in-mylist");

    grid.appendChild(card);
  });
}

function setTextOrHide(el, text) {
  if (text) {
    el.textContent = text;
    el.classList.remove("hidden");
  }
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`;
}

// ─── アプリで開く ─────────────────────────────────────────────────────────────

function toAppUrl(webUrl) {
  return webUrl.replace("https://shirasu.io/", "https://app.shirasu.io/");
}

function openInApp(webUrl) {
  window.open(toAppUrl(webUrl), "_blank");
}

// ─── 後で見るリスト ────────────────────────────────────────────────────────────

function toggleWatchLater(url, btn) {
  if (watchLater.has(url)) {
    watchLater.delete(url);
  } else {
    watchLater.add(url);
  }
  saveWatchLater();
  updateWatchLaterBtn(btn, watchLater.has(url));
  updateMyListCount();

  // MyList表示中なら再レンダリング
  if (showMyListOnly) renderCards();

  // Gist自動同期
  gistAutoSync();
}

function updateWatchLaterBtn(btn, isAdded) {
  btn.textContent = isAdded ? "✓ 追加済み" : "後で見る";
  btn.classList.toggle("added", isAdded);
}

function saveWatchLater() {
  localStorage.setItem("watchLater", JSON.stringify([...watchLater]));
}

function initMyListButton() {
  const btn = document.getElementById("mylist-btn");
  updateMyListCount();

  btn.addEventListener("click", () => {
    showMyListOnly = !showMyListOnly;
    btn.classList.toggle("active", showMyListOnly);
    renderCards();
  });
}

function updateMyListCount() {
  const count = watchLater.size;
  const badge = document.getElementById("mylist-count");
  badge.textContent = count;
  badge.classList.toggle("hidden", count === 0);
}

// タイトルクリックでリセット
document.getElementById("title-btn")?.addEventListener("click", () => {
  showMyListOnly = false;
  filters.type = null;
  filters.genre = null;
  filters.text = "";
  document.getElementById("search-input").value = "";
  document.getElementById("search-clear").classList.add("hidden");
  ["type-btn", "genre-btn"].forEach(id => {
    const btn = document.getElementById(id);
    const label = id === "type-btn" ? "番組タイプ" : "ジャンル";
    btn.textContent = label;
    btn.classList.remove("active");
  });
  document.getElementById("mylist-btn").classList.remove("active");
  renderCards();
  window.scrollTo(0, 0);
});

// ─── 設定モーダル ─────────────────────────────────────────────────────────────

function initSettingsModal() {
  // Gist設定の読み込み
  document.getElementById("gist-pat").value = localStorage.getItem("gistPat") || "";
  document.getElementById("gist-id").value = localStorage.getItem("gistId") || "";

  document.getElementById("gist-save-btn").addEventListener("click", gistSaveAndSync);
  document.getElementById("gist-pull-btn").addEventListener("click", gistPull);
  document.getElementById("gist-clear-btn").addEventListener("click", gistClear);

  // MyList JSON管理
  document.getElementById("list-download-btn").addEventListener("click", downloadList);
  document.getElementById("list-upload-btn").addEventListener("click", () =>
    document.getElementById("list-file-input").click()
  );
  document.getElementById("list-file-input").addEventListener("change", uploadList);
  document.getElementById("list-delete-btn").addEventListener("click", deleteList);
}

// ─── GitHub Gist 同期 ─────────────────────────────────────────────────────────

function gistHeaders(pat) {
  const h = { "Accept": "application/vnd.github+json", "Content-Type": "application/json" };
  if (pat) h["Authorization"] = `Bearer ${pat}`;
  return h;
}

function gistBody(urlList) {
  return JSON.stringify({
    files: {
      "shirasu-watchlater.json": {
        content: JSON.stringify({ URL_list: urlList })
      }
    }
  });
}

async function gistSaveAndSync() {
  const pat = document.getElementById("gist-pat").value.trim();
  const status = document.getElementById("gist-status");

  if (!pat) { setGistStatus("PAT を入力してください", "error"); return; }

  localStorage.setItem("gistPat", pat);
  setGistStatus("同期中...", "");

  try {
    let gistId = localStorage.getItem("gistId") || document.getElementById("gist-id").value.trim();

    if (!gistId) {
      // 新規作成
      const res = await fetch("https://api.github.com/gists", {
        method: "POST",
        headers: gistHeaders(pat),
        body: JSON.stringify({
          description: "Shirasu Watch Later List",
          public: false,
          files: { "shirasu-watchlater.json": { content: JSON.stringify({ URL_list: [...watchLater] }) } }
        })
      });
      if (!res.ok) throw new Error(`Gist作成失敗 (${res.status})`);
      const gist = await res.json();
      gistId = gist.id;
      localStorage.setItem("gistId", gistId);
      document.getElementById("gist-id").value = gistId;
      setGistStatus(`✓ Gist作成: ${gistId.slice(0, 8)}... (他デバイスにはこのIDを入力)`, "success");
    } else {
      // 既存を更新
      const res = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: "PATCH",
        headers: gistHeaders(pat),
        body: gistBody([...watchLater])
      });
      if (!res.ok) throw new Error(`更新失敗 (${res.status})`);
      setGistStatus("✓ Gist を更新しました", "success");
    }
  } catch (e) {
    setGistStatus(`エラー: ${e.message}`, "error");
  }
}

async function gistPull() {
  const gistId = document.getElementById("gist-id").value.trim() || localStorage.getItem("gistId");
  const pat = localStorage.getItem("gistPat") || "";
  const status = document.getElementById("gist-status");

  if (!gistId) { setGistStatus("Gist ID を入力してください", "error"); return; }
  setGistStatus("読み込み中...", "");

  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: gistHeaders(pat)
    });
    if (!res.ok) throw new Error(`読み込み失敗 (${res.status})`);
    const gist = await res.json();
    const fileContent = gist.files["shirasu-watchlater.json"]?.content;
    if (!fileContent) throw new Error("shirasu-watchlater.json が見つかりません");

    const { URL_list } = JSON.parse(fileContent);
    URL_list.forEach(url => watchLater.add(url));
    saveWatchLater();
    updateMyListCount();
    localStorage.setItem("gistId", gistId);
    document.getElementById("gist-id").value = gistId;
    renderCards();
    setGistStatus(`✓ ${URL_list.length}件を読み込みました`, "success");
  } catch (e) {
    setGistStatus(`エラー: ${e.message}`, "error");
  }
}

async function gistAutoSync() {
  const pat = localStorage.getItem("gistPat");
  const gistId = localStorage.getItem("gistId");
  if (!pat || !gistId) return;

  try {
    await fetch(`https://api.github.com/gists/${gistId}`, {
      method: "PATCH",
      headers: gistHeaders(pat),
      body: gistBody([...watchLater])
    });
  } catch (e) {
    console.warn("Gist自動同期失敗:", e);
  }
}

function gistClear() {
  localStorage.removeItem("gistPat");
  localStorage.removeItem("gistId");
  document.getElementById("gist-pat").value = "";
  document.getElementById("gist-id").value = "";
  setGistStatus("Gist 設定を解除しました", "");
}

function setGistStatus(msg, cls) {
  const el = document.getElementById("gist-status");
  el.textContent = msg;
  el.className = `small mt-2 ${cls}`;
}

// ─── MyList JSON管理 ──────────────────────────────────────────────────────────

function downloadList() {
  if (watchLater.size === 0) { alert("後で見るリストが空です"); return; }
  const blob = new Blob([JSON.stringify({ URL_list: [...watchLater] })], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "shirasu-watchlater.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function uploadList(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const { URL_list } = JSON.parse(ev.target.result);
      if (!Array.isArray(URL_list)) throw new Error("形式エラー");
      const action = confirm(`${URL_list.length}件を追加しますか?\n(キャンセルで現在のリストを上書き)`);
      if (action) {
        URL_list.forEach(url => watchLater.add(url));
      } else {
        watchLater.clear();
        URL_list.forEach(url => watchLater.add(url));
      }
      saveWatchLater();
      updateMyListCount();
      renderCards();
    } catch {
      alert("読み込み失敗: 正しい JSON ファイルを選んでください");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

function deleteList() {
  if (!confirm("後で見るリストをすべて削除しますか?")) return;
  watchLater.clear();
  saveWatchLater();
  updateMyListCount();
  showMyListOnly = false;
  document.getElementById("mylist-btn").classList.remove("active");
  renderCards();
}
