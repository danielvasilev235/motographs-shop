(() => {
  "use strict";

  /* ================= SUPABASE ================= */
  const SUPABASE_URL = "https://hhdphxcwhsabyoyjuint.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_l5drHWubL3HhBWqI018iCA_OJZMjpj7";

  // Създаваме клиента само ако SDK е зареден
  if (!window.supabase || !window.supabase.createClient) {
    console.error("Supabase SDK не е зареден. Провери <script src=...supabase-js@2> преди app.js");
    return;
  }

  // Пазим клиента в window, за да не се създава два пъти
  window.__sb = window.__sb || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const sb = window.__sb;

  /* ================= HELPERS ================= */
  const qs = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));
  const money = (n) => `€${Number(n || 0).toFixed(2)}`;

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toast(msg) {
    const t = qs("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 1400);
  }

  function parseParams() {
    const u = new URL(window.location.href);
    return Object.fromEntries(u.searchParams.entries());
  }

  function fillSelect(selector, options, selected) {
    const sel = qs(selector);
    if (!sel) return;
    sel.innerHTML = options
      .map(
        (o) =>
          `<option ${o === selected ? "selected" : ""} value="${escapeHtml(o)}">${escapeHtml(o)}</option>`
      )
      .join("");
  }

  /* ================= CONSTANTS ================= */
  const CART_KEY = "mg_cart_v1";

  const iPhoneModels = [
    "iPhone (1st gen)","iPhone 3G","iPhone 3GS","iPhone 4","iPhone 4s","iPhone 5","iPhone 5c","iPhone 5s",
    "iPhone 6","iPhone 6 Plus","iPhone 6s","iPhone 6s Plus","iPhone SE (1st gen)","iPhone 7","iPhone 7 Plus",
    "iPhone 8","iPhone 8 Plus","iPhone X","iPhone XR","iPhone XS","iPhone XS Max",
    "iPhone 11","iPhone 11 Pro","iPhone 11 Pro Max","iPhone SE (2nd gen)",
    "iPhone 12 mini","iPhone 12","iPhone 12 Pro","iPhone 12 Pro Max",
    "iPhone 13 mini","iPhone 13","iPhone 13 Pro","iPhone 13 Pro Max","iPhone SE (3rd gen)",
    "iPhone 14","iPhone 14 Plus","iPhone 14 Pro","iPhone 14 Pro Max",
    "iPhone 15","iPhone 15 Plus","iPhone 15 Pro","iPhone 15 Pro Max",
    "iPhone 16","iPhone 16 Plus","iPhone 16 Pro","iPhone 16 Pro Max"
  ];

  const Categories = {
    "Силиконови": ["Тънък", "Soft-touch", "MagSafe"],
    "Прозрачни": ["Твърд (PC)", "Гъвкав (TPU)", "Anti-yellow"],
    "Кожени": ["Класически", "С магнит", "Портфейл (wallet)"],
    "Удароустойчиви": ["Rugged", "Bumper", "Military-grade"],
    "Премиум": ["Алуминиев", "Карбон", "Designer"]
  };

  /* ================= CART (localStorage) ================= */
  function getCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
    catch { return []; }
  }

  function setCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    updateCartBadge();
  }

  function cartCount() {
    return getCart().reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
  }

  function updateCartBadge() {
    const b = qs("#cartBadge");
    if (b) b.textContent = String(cartCount());
  }

  function addToCart(productSlug, qty = 1, model = "") {
    const cart = getCart();
    const key = `${productSlug}__${model}`;
    const found = cart.find((i) => i.key === key);
    if (found) found.qty += qty;
    else cart.push({ key, productSlug, model, qty });
    setCart(cart);
    toast("Добавено в количката ✅");
  }

  function removeFromCart(key) {
    setCart(getCart().filter((i) => i.key !== key));
  }

  function updateQty(key, qty) {
    const cart = getCart();
    const it = cart.find((i) => i.key === key);
    if (!it) return;
    it.qty = Math.max(1, Number(qty) || 1);
    setCart(cart);
  }

  /* ================= SUPABASE QUERIES ================= */
  async function fetchFeatured(limit = 16) {
  const { data, error } = await sb
    .from("products")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(error);
    toast("Грешка при зареждане на продукти");
    return [];
  }
  return data || [];
}


  async function fetchProductBySlug(slugOrId) {
  // 1) пробвай по slug
  let res = await sb.from("products").select("*").eq("slug", slugOrId).maybeSingle();
  if (res?.data) return res.data;

  // 2) ако няма slug колона/няма резултат -> пробвай по id (ако id е текст/uuid)
  res = await sb.from("products").select("*").eq("id", slugOrId).maybeSingle();
  if (res?.data) return res.data;

  // 3) ако id е uuid, а ти подаваш текст, може да гръмне -> върни null
  if (res?.error) console.error(res.error);
  return null;
}


  async function fetchModels(productId) {
    // ако нямаш таблица product_models, ще върне error -> fallback към всички модели
    const { data, error } = await sb
      .from("product_models")
      .select("model")
      .eq("product_id", productId)
      .order("id", { ascending: true });

    if (error) return [];
    return (data || []).map((x) => x.model);
  }

  async function fetchProductsForCategory(params) {
    const category = params.category || "Силиконови";
    const sub = params.sub || "";
    const q = (params.q || "").trim();
    const sort = params.sort || "popular";

    let query = sb
      .from("products")
      .select("id,slug,name,price_eur,category,subcategory,description,image_url,rating,created_at,active")
      .eq("category", category);

    if (sub) query = query.eq("subcategory", sub);
    if (q) query = query.ilike("name", `%${q}%`);

    if (sort === "price_asc") query = query.order("price_eur", { ascending: true });
    else if (sort === "price_desc") query = query.order("price_eur", { ascending: false });
    else if (sort === "rating") query = query.order("rating", { ascending: false });
    else query = query.order("created_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error(error);
      toast("Грешка при филтриране");
      return [];
    }

    return (data || []).filter(p => p.active !== false);
  }

    /* ================= UI: PRODUCT CARD ================= */

  function productPriceText(p) {
    // ако имаш price_min/price_max (пример: 24.99 - 29.99)
    const min = p.price_min ?? p.min_price ?? null;
    const max = p.price_max ?? p.max_price ?? null;

    if (min != null && max != null) {
      return `€${Number(min).toFixed(2).replace(".", ",")} EUR – €${Number(max).toFixed(2).replace(".", ",")} EUR`;
    }

    const price = p.price_eur ?? p.price ?? 0;
    return `€${Number(price).toFixed(2).replace(".", ",")} EUR`;
  }

  function resolveImageUrl(p) {
    const raw = (p.image_url || p.img || "").trim();
    if (!raw) return "";

    // ако вече е пълен линк
    if (/^https?:\/\//i.test(raw)) return raw;

    // ако е локален път (пример Images/xxx.jpg)
    if (raw.startsWith("Images/") || raw.startsWith("assets/") || raw.startsWith("/")) return raw;

    // иначе приемаме, че е файл в Supabase Storage (bucket: images)
    // ако твоят bucket е с друго име -> смени "images" на твоето
    try {
      const { data } = sb.storage.from("images").getPublicUrl(raw);
      return data?.publicUrl || raw;
    } catch {
      return raw;
    }
  }

  function productCard(p) {
    const slug = p.slug || p.id;
    const img = resolveImageUrl(p);

    // ако нямаш badge, остави "" (или сложи твой файл)
    const badge = "Images/lab.png";

    return `
      <div class="product-tile">
        <a href="product.html?id=${encodeURIComponent(slug)}">
          <div class="product-media">
            <img src="${escapeHtml(img)}" alt="${escapeHtml(p.name || "")}">
            ${badge ? `<img class="product-badge" src="${escapeHtml(badge)}" alt="">` : ``}
          </div>
        </a>
        <div class="product-price">${productPriceText(p)}</div>
      </div>
    `;
  }

  function wireAddButtons(root) {
    root.querySelectorAll("button.add").forEach((btn) => {
      btn.addEventListener("click", () => {
        toast("Отвори 'Детайли' и избери модел 👇");
        window.location.href = `product.html?id=${encodeURIComponent(btn.dataset.slug)}`;
      });
    });
  }

  /* ================= PAGES ================= */

  // HOME
  async function renderFeatured() {
    const box = qs("#featuredGrid");
    if (!box) return;

    const list = await fetchFeatured(16);
    box.innerHTML = list.map(productCard).join("");
    wireAddButtons(box);
  }

  // CATEGORY
  async function renderCategoryPage() {
    const grid = qs("#categoryGrid");
    if (!grid) return;

    const params = parseParams();
    const category = params.category || "Силиконови";
    const subcategory = params.sub || "";
    const model = params.model || "";
    const sort = params.sort || "popular";

    fillSelect("#filterCategory", Object.keys(Categories), category);
    fillSelect("#filterSub", ["(всички)"].concat(Categories[category] || []), subcategory ? subcategory : "(всички)");
    fillSelect("#filterModel", ["(всички)"].concat(iPhoneModels), model ? model : "(всички)");
    fillSelect("#filterSort", ["popular", "price_asc", "price_desc", "rating"], sort);

    const h = qs("#catTitle");
    if (h) h.textContent = subcategory ? `${category} • ${subcategory}` : category;

    const s = qs("#catSubtitle");
    if (s) {
      const parts = [];
      if (model) parts.push(`модел: ${model}`);
      if (params.q) parts.push(`търсене: "${params.q}"`);
      s.textContent = parts.length ? parts.join(" • ") : "Избери подкатегория и модел, за да филтрираш.";
    }

    const products = await fetchProductsForCategory(params);

    if (products.length === 0) {
      grid.innerHTML = `<div class="card" style="grid-column:1/-1">
        <b>Няма резултати</b>
        <p class="muted">Пробвай друга подкатегория или търсене.</p>
      </div>`;
      return;
    }

    grid.innerHTML = products.map(productCard).join("");
    wireAddButtons(grid);

    const catSel = qs("#filterCategory");
    const subSel = qs("#filterSub");
    const modelSel = qs("#filterModel");
    const sortSel = qs("#filterSort");
    const searchInput = qs("#pageSearch");

    catSel?.addEventListener("change", () => {
      fillSelect("#filterSub", ["(всички)"].concat(Categories[catSel.value] || []), "(всички)");
    });

    function go() {
      const c = catSel.value;
      const subVal = subSel.value === "(всички)" ? "" : subSel.value;
      const modelVal = modelSel.value === "(всички)" ? "" : modelSel.value;
      const sortVal = sortSel.value;
      const qVal = searchInput.value.trim();

      const url = new URL(window.location.href);
      url.searchParams.set("category", c);
      if (subVal) url.searchParams.set("sub", subVal); else url.searchParams.delete("sub");
      if (modelVal) url.searchParams.set("model", modelVal); else url.searchParams.delete("model");
      if (qVal) url.searchParams.set("q", qVal); else url.searchParams.delete("q");
      url.searchParams.set("sort", sortVal);
      window.location.href = url.toString();
    }

    qs("#applyFilters")?.addEventListener("click", go);
    searchInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  }

  // PRODUCT
  async function renderProductPage() {
    const root = qs("#productRoot");
    if (!root) return;

    const { id } = parseParams(); // id == slug
    if (!id) return;

    const p = await fetchProductBySlug(id);
    if (!p) {
      toast("Продуктът не е намерен.");
      return;
    }

    qs("#pName").textContent = p.name;
    qs("#pPrice").textContent = money(p.price_eur);
    qs("#pMeta").textContent = `${p.category} • ${p.subcategory} • ⭐ ${Number(p.rating || 0).toFixed(1)}`;
    qs("#pDesc").textContent = p.description || "";

    const big = qs("#bigThumb");
    if (big) {
      big.innerHTML = `
        <img src="${escapeHtml(p.image_url || "")}"
          onerror="this.style.display='none'; this.parentElement.innerHTML='(липсва снимка)';"
          alt="${escapeHtml(p.name)}"
          style="width:100%; height:100%; object-fit:contain;">
      `;
    }

    // models
    let models = await fetchModels(p.id);
    if (models.length === 0) models = [...iPhoneModels];

    const pModels = qs("#pModels");
    if (pModels) pModels.innerHTML = `<span class="pill">${models.length} модела</span>`;

    // qty controls
    const qtyInput = qs("#qty");
    const minus = qs("#minus");
    const plus = qs("#plus");
    const addBtn = qs("#addBtn");

    function setQty(v) {
      const n = Math.max(1, Math.min(99, Number(v) || 1));
      qtyInput.value = n;
    }

    minus?.addEventListener("click", () => setQty(Number(qtyInput.value) - 1));
    plus?.addEventListener("click", () => setQty(Number(qtyInput.value) + 1));
    qtyInput?.addEventListener("change", () => setQty(qtyInput.value));

    // model dropdown
    let selectedModel = "";
    const modelInput = qs("#modelSearch");
    const modelList = qs("#modelList");
    const chosenText = qs("#chosenModelText");

    function openList() { if (modelList) modelList.style.display = "block"; }
    function closeList() { if (modelList) modelList.style.display = "none"; }

    function renderModelList(filter = "") {
      if (!modelList) return;
      const f = filter.toLowerCase();
      const list = models.filter((m) => m.toLowerCase().includes(f));

      modelList.innerHTML = list.map((m) => `
        <div style="padding:10px; border-radius:10px; cursor:pointer; border:1px solid #e5e7eb; margin-bottom:6px; background:#fff"
          data-model="${escapeHtml(m)}">
          <div class="row">
            <span>${escapeHtml(m)}</span>
            ${selectedModel === m ? `<span class="pill">избран</span>` : ``}
          </div>
        </div>
      `).join("") || `<div class="muted" style="padding:10px">Няма резултати…</div>`;

      modelList.querySelectorAll("[data-model]").forEach((el) => {
        el.addEventListener("click", () => {
          selectedModel = el.dataset.model;
          modelInput.value = selectedModel;
          if (chosenText) chosenText.textContent = selectedModel;
          closeList();
        });
      });
    }

    if (modelInput && modelList) {
      renderModelList("");
      modelInput.addEventListener("focus", () => { openList(); renderModelList(modelInput.value); });
      modelInput.addEventListener("input", () => { openList(); renderModelList(modelInput.value); });

      document.addEventListener("click", (e) => {
        if (!modelList.contains(e.target) && e.target !== modelInput) closeList();
      });
    }

    addBtn?.addEventListener("click", () => {
      if (!selectedModel) {
        toast("Моля избери модел телефон 👇");
        modelInput?.focus();
        openList();
        return;
      }
      addToCart(p.slug, Number(qtyInput.value) || 1, selectedModel);
    });

    // related
    const relatedBox = qs("#relatedGrid");
    if (relatedBox) {
      const { data, error } = await sb
        .from("products")
        .select("id,slug,name,price_eur,category,subcategory,description,image_url,rating,created_at,active")
        .eq("category", p.category)
        .order("created_at", { ascending: false })
        .limit(4);

      if (error) {
        console.error(error);
        return;
      }

      const rel = (data || [])
        .filter(x => x.slug !== p.slug)
        .filter(x => x.active !== false)
        .slice(0, 4);

      relatedBox.innerHTML = rel.map(productCard).join("");
      wireAddButtons(relatedBox);
    }
  }

  // CART PAGE
  async function renderCartPage() {
    const listBox = qs("#cartList");
    if (!listBox) return;

    const cart = getCart();
    if (cart.length === 0) {
      listBox.innerHTML = `<div class="panel">
        <h3>Количката е празна</h3>
        <p class="muted">Отиди в категориите и добави калъф.</p>
        <a class="btn" href="category.html?category=Силиконови">Към продуктите</a>
      </div>`;
      const sum = qs("#summaryBox");
      if (sum) sum.style.display = "none";
      return;
    }

    const slugs = Array.from(new Set(cart.map((i) => i.productSlug)));
    const { data: products, error } = await sb
      .from("products")
      .select("id,slug,name,price_eur,category,subcategory,image_url,active")
      .in("slug", slugs);

    if (error) {
      console.error(error);
      toast("Грешка при количката");
      return;
    }

    const map = new Map((products || []).map((p) => [p.slug, p]));
    let subtotal = 0;

    listBox.innerHTML = cart
      .map((item) => {
        const p = map.get(item.productSlug);
        if (!p || p.active === false) return "";
        const line = Number(p.price_eur) * Number(item.qty);
        subtotal += line;

        return `
          <div class="cart-item">
            <div class="cart-thumb">
              <img src="${escapeHtml(p.image_url || "")}" alt="${escapeHtml(p.name)}"
                style="width:100%; height:100%; object-fit:contain;">
            </div>
            <div>
              <h4><a href="product.html?id=${encodeURIComponent(p.slug)}">${escapeHtml(p.name)}</a></h4>
              <p>${escapeHtml(p.category)} • ${escapeHtml(p.subcategory)}</p>
              ${item.model ? `<p><span class="pill">Модел: <b>${escapeHtml(item.model)}</b></span></p>` : ""}

              <div class="qty" style="margin-top:10px">
                <button class="dec" data-key="${escapeHtml(item.key)}">-</button>
                <input class="q" data-key="${escapeHtml(item.key)}" value="${item.qty}" />
                <button class="inc" data-key="${escapeHtml(item.key)}">+</button>
                <span class="pill">Междинна сума: <b>${money(line)}</b></span>
              </div>
            </div>
            <div class="cart-actions">
              <b>${money(p.price_eur)}</b>
              <button class="btn outline small rm" data-key="${escapeHtml(item.key)}">Премахни</button>
            </div>
          </div>
        `;
      })
      .join("");

    qsa(".rm").forEach((btn) => {
      btn.addEventListener("click", () => {
        removeFromCart(btn.dataset.key);
        renderCartPage();
        toast("Премахнато 🗑️");
      });
    });

    qsa(".inc").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.key;
        const it = getCart().find((x) => x.key === key);
        updateQty(key, (it?.qty || 1) + 1);
        renderCartPage();
      });
    });

    qsa(".dec").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.key;
        const it = getCart().find((x) => x.key === key);
        updateQty(key, (it?.qty || 1) - 1);
        renderCartPage();
      });
    });

    qsa("input.q").forEach((inp) => {
      inp.addEventListener("change", () => {
        updateQty(inp.dataset.key, Number(inp.value) || 1);
        renderCartPage();
      });
    });

    const shipping = subtotal > 49 ? 0 : 5.9;
    const total = subtotal + shipping;

    qs("#subTotal") && (qs("#subTotal").textContent = money(subtotal));
    qs("#ship") && (qs("#ship").textContent = shipping === 0 ? "Безплатно" : money(shipping));
    qs("#grandTotal") && (qs("#grandTotal").textContent = money(total));

    qs("#toCheckout")?.addEventListener("click", () => {
      window.location.href = "checkout.html";
    });
  }

  /* ================= AUTH + PROFILE ================= */
  async function initAccountPage() {
    const btnLogin = qs("#btnLogin");
    const btnRegister = qs("#btnRegister");
    if (!btnLogin && !btnRegister) return;

    const emailEl = qs("#accEmail");
    const passEl = qs("#accPass");
    const nameEl = qs("#accName");

    btnRegister?.addEventListener("click", async () => {
      const email = (emailEl?.value || "").trim().toLowerCase();
      const password = (passEl?.value || "");
      const full_name = (nameEl?.value || "").trim();

      if (!email || !password) return toast("Попълни имейл и парола.");

      const { error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { full_name } }
      });

      if (error) return toast("Грешка: " + error.message);
      toast("Регистрация ✅ (провери email ако иска потвърждение)");
      setTimeout(() => (window.location.href = "profile.html"), 500);
    });

    btnLogin?.addEventListener("click", async () => {
      const email = (emailEl?.value || "").trim().toLowerCase();
      const password = (passEl?.value || "");

      if (!email || !password) return toast("Въведи имейл и парола.");

      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return toast("Грешка: " + error.message);

      toast("Вход ✅");
      setTimeout(() => (window.location.href = "profile.html"), 400);
    });
  }

  async function initProfilePage() {
    const box = qs("#profileInfo");
    if (!box) return;

    const { data } = await sb.auth.getSession();
    const session = data.session;

    if (!session?.user) {
      box.innerHTML = `Нямаш активен профил. <a href="account.html">Вход / Регистрация</a>`;
      return;
    }

    const user = session.user;
    const fullName = user.user_metadata?.full_name || "Потребител";

    box.innerHTML = `
      <div><b>Име:</b> ${escapeHtml(fullName)}</div>
      <div style="margin-top:6px;"><b>Имейл:</b> ${escapeHtml(user.email || "")}</div>
      <div class="muted" style="margin-top:10px;">Профилът е реален (Supabase Auth).</div>
    `;

    qs("#btnLogout")?.addEventListener("click", async () => {
      await sb.auth.signOut();
      toast("Изход ✅");
      setTimeout(() => (window.location.href = "index.html"), 400);
    });
  }

  /* ================= CHECKOUT (orders + order_items) ================= */
  async function renderCheckout() {
    const form = qs("#checkoutForm");
    if (!form) return;

    // must be logged in
    const { data } = await sb.auth.getSession();
    const session = data.session;
    if (!session?.user) {
      toast("Моля влез в профила си първо.");
      setTimeout(() => (window.location.href = "account.html"), 600);
      return;
    }

    const cart = getCart();
    const itemsBox = qs("#orderItems");
    if (!itemsBox) return;

    if (cart.length === 0) {
      itemsBox.innerHTML = `<p class="muted">Няма продукти. <a href="category.html?category=Силиконови">Добави калъф</a></p>`;
      return;
    }

    const slugs = Array.from(new Set(cart.map((i) => i.productSlug)));
    const { data: products, error } = await sb
      .from("products")
      .select("id,slug,name,price_eur,active")
      .in("slug", slugs);

    if (error) {
      console.error(error);
      toast("Грешка при checkout");
      return;
    }

    const map = new Map((products || []).map((p) => [p.slug, p]));
    let subtotal = 0;

    itemsBox.innerHTML = cart
      .map((item) => {
        const p = map.get(item.productSlug);
        if (!p || p.active === false) return "";
        const line = Number(p.price_eur) * Number(item.qty);
        subtotal += line;
        const title = item.model ? `${p.name} (${item.model})` : p.name;

        return `<div class="row" style="margin:6px 0">
          <span>${escapeHtml(title)} × ${item.qty}</span>
          <b>${money(line)}</b>
        </div>`;
      })
      .join("");

    const shipping = subtotal >= 80 ? 0 : 5.9;
    const total = subtotal + shipping;

    qs("#cSub") && (qs("#cSub").textContent = money(subtotal));
    qs("#cShip") && (qs("#cShip").textContent = shipping === 0 ? "Безплатно" : money(shipping));
    qs("#cTotal") && (qs("#cTotal").textContent = money(total));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const name = (qs("#name")?.value || "").trim();
      const phone = (qs("#phone")?.value || "").trim();
      const addr = (qs("#address")?.value || "").trim();

      if (name.length < 2 || phone.length < 6 || addr.length < 6) {
        toast("Моля попълни коректно данните.");
        return;
      }

      // 1) insert order
      const orderPayload = {
        user_id: session.user.id,
        customer_name: name,
        phone,
        address: addr,
        payment_method: "COD",
        subtotal: Number(subtotal.toFixed(2)),
        shipping: Number(shipping.toFixed(2)),
        total: Number(total.toFixed(2)),
        status: "new"
      };

      const { data: order, error: orderErr } = await sb
        .from("orders")
        .insert(orderPayload)
        .select("id")
        .single();

      if (orderErr) {
        console.error(orderErr);
        toast("Грешка при поръчка: " + orderErr.message);
        return;
      }

      // 2) insert items
      const items = cart
        .map((item) => {
          const p = map.get(item.productSlug);
          if (!p || p.active === false) return null;

          const price = Number(p.price_eur || 0);
          const qty = Number(item.qty || 1);
          const line = price * qty;

          return {
            order_id: order.id,
            product_id: p.id,
            product_name: p.name,
            price_eur: Number(price.toFixed(2)),
            qty,
            model: item.model || "",
            line_total: Number(line.toFixed(2))
          };
        })
        .filter(Boolean);

      const { error: itemsErr } = await sb.from("order_items").insert(items);
      if (itemsErr) {
        console.error(itemsErr);
        toast("Поръчката е записана, но има проблем с артикулите: " + itemsErr.message);
        return;
      }

      // success
      localStorage.removeItem(CART_KEY);
      updateCartBadge();
      qs("#success") && (qs("#success").style.display = "block");
      form.reset();
      toast("Поръчката е записана ✅");
    });
  }

  /* ================= PROMO BAR ================= */
  function initPromoBar() {
    const PROMO_KEY = "promoBarClosed_v1";
    const promoBar = qs("#promoBar");
    const promoClose = qs("#promoClose");
    if (!promoBar) return;

    if (localStorage.getItem(PROMO_KEY) === "1") promoBar.style.display = "none";
    promoClose?.addEventListener("click", () => {
      promoBar.style.display = "none";
      localStorage.setItem(PROMO_KEY, "1");
    });
  }

  /* ================= INIT ================= */
  document.addEventListener("DOMContentLoaded", () => {
    updateCartBadge();
    initPromoBar();

    // Render pages (ако е съответната страница)
    renderFeatured();
    renderCategoryPage();
    renderProductPage();
    renderCartPage();
    renderCheckout();

    initAccountPage();
    initProfilePage();
  });
})();
