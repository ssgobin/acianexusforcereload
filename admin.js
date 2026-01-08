import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

import {
  getFirestore, doc, setDoc, updateDoc, getDoc,
  collection, getDocs, addDoc, orderBy, query, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* -------------------------------------
  CONFIG FIREBASE (MESMO PROJETO DO NEXUS)
-------------------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyA7l0LovQnLdv9obeR3YSH6MTdR2d6xcug",
  authDomain: "hubacia-407c1.firebaseapp.com",
  projectId: "hubacia-407c1",
  storageBucket: "hubacia-407c1.appspot.com",
  messagingSenderId: "633355141941",
  appId: "1:633355141941:web:e65270fdabe95da64cc27c",
  measurementId: "G-LN9BEKHCD5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

/* -------------------------------------
  NAV UI
-------------------------------------- */
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const target = btn.dataset.target;
    document.querySelectorAll(".view").forEach(v => v.classList.remove("visible"));
    const v = document.getElementById(target);
    if (v) v.classList.add("visible");
  };
});

/* -------------------------------------
  LOGIN AUTOMÁTICO (TI)
  ATENÇÃO: uso interno apenas.
-------------------------------------- */
async function autoLogin() {
  try {
    const email = "ti@acia.com.br";
    const password = "J@123456";

    await signInWithEmailAndPassword(auth, email, password);
    // sucesso -> onAuthStateChanged irá cuidar do resto
  } catch (err) {
    console.error("[Admin] Falha no login automático:", err);
    alert("Não foi possível autenticar automaticamente o usuário TI. Verifique o usuário e a senha.");
  }
}

/* -------------------------------------
  PROTEÇÃO (apenas role = admin)
-------------------------------------- */
async function ensureAdminRole(user) {
  const snap = await getDoc(doc(db, "users", user.uid));
  const data = snap.exists() ? snap.data() : null;
  const role = data?.role || "member";

  const emailEl = document.getElementById("admin-user-email");
  if (emailEl) {
    emailEl.textContent = `${user.email || "Usuário"} • role: ${role}`;
  }

  if (role !== "admin") {
    alert("Seu usuário não possui permissão de administrador para acessar este painel.");
    // Redireciona para a aplicação principal (ajuste o caminho se necessário)
    window.location.href = "../index.html#/";
    throw new Error("Acesso negado (role != admin)");
  }

  return data;
}

/* -------------------------------------
  KPIs / DASHBOARD
-------------------------------------- */
async function loadKpis() {
  try {
    // usuários
    const usersSnap = await getDocs(collection(db, "users"));
    const totalUsers = usersSnap.size || 0;

    // presença (online)
    const presenceSnap = await getDocs(collection(db, "presence"));
    const now = Date.now();
    let onlineCount = 0;
    presenceSnap.forEach(d => {
      const p = d.data();
      const lastSeen = Number(p.lastSeen || 0);
      const isOnline = p.online && (now - lastSeen) < 20000;
      if (isOnline) onlineCount++;
    });

    // mural
    const muralSnap = await getDocs(collection(db, "mural"));
    const muralCount = muralSnap.size || 0;

    // último broadcast
    const bcSnap = await getDoc(doc(db, "admin", "broadcast"));
    let lastReload = "—";
    if (bcSnap.exists()) {
      const data = bcSnap.data();
      if (data.forceReloadAt) {
        lastReload = new Date(Number(data.forceReloadAt)).toLocaleString("pt-BR");
      }
    }

    document.getElementById("kpi-users").textContent = totalUsers;
    document.getElementById("kpi-online").textContent = onlineCount;
    document.getElementById("kpi-mural").textContent = muralCount;
    document.getElementById("kpi-reload").textContent = lastReload;

    renderDashboardLastBroadcast(bcSnap.exists() ? bcSnap.data() : null);
  } catch (err) {
    console.error("[Admin] Erro ao carregar KPIs:", err);
  }
}

function renderDashboardLastBroadcast(data) {
  const el = document.getElementById("dashboard-last-broadcast");
  if (!el) return;

  if (!data) {
    el.innerHTML = '<p class="muted">Nenhuma atualização registrada ainda.</p>';
    return;
  }

  const dt = data.forceReloadAt
    ? new Date(Number(data.forceReloadAt)).toLocaleString("pt-BR")
    : "—";

  el.innerHTML = `
    <p><strong>${data.category || "Atualização"}</strong></p>
    <p>${data.message || ""}</p>
    ${data.ref ? `<p class="muted">Referência: ${escapeHtml(data.ref)}</p>` : ""}
    <p class="muted">Enviado por: ${escapeHtml(data.by || "Admin")} • ${dt}</p>
  `;
}

/* -------------------------------------
  BROADCAST / FORCE RELOAD
-------------------------------------- */
document.getElementById("bc-send")?.addEventListener("click", async () => {
  const category = document.getElementById("bc-category").value.trim();
  const refVal = document.getElementById("bc-ref").value.trim();
  const message = document.getElementById("bc-message").value.trim();
  const statusEl = document.getElementById("bc-status");

  if (!category || !message) {
    statusEl.textContent = "Preencha categoria e mensagem antes de enviar.";
    statusEl.className = "status err";
    return;
  }

  try {
    const user = auth.currentUser;
    const by = user?.email || "Admin";

    const payload = {
      forceReloadAt: Date.now(),
      category,
      ref: refVal,
      message,
      by
    };

    await setDoc(doc(db, "admin", "broadcast"), payload, { merge: true });

    // grava também nos logs
    await addDoc(collection(db, "admin", "broadcastLogs", "items"), {
      ts: Date.now(),
      category,
      ref: refVal,
      message,
      by
    });

    statusEl.textContent = "Atualização enviada e reload forçado com sucesso!";
    statusEl.className = "status ok";

    // limpa campos
    document.getElementById("bc-category").value = "";
    document.getElementById("bc-ref").value = "";
    document.getElementById("bc-message").value = "";

    await loadKpis();
    await loadBroadcastLogs();
  } catch (err) {
    console.error("[Admin] Erro ao enviar broadcast:", err);
    statusEl.textContent = "Erro ao enviar atualização. Veja o console.";
    statusEl.className = "status err";
  }
});

document.getElementById("bc-test")?.addEventListener("click", () => {
  const category = document.getElementById("bc-category").value.trim() || "Atualização do sistema";
  const refVal = document.getElementById("bc-ref").value.trim();
  const message = document.getElementById("bc-message").value.trim() || "Mensagem de exemplo para visualização.";

  const data = {
    category,
    ref: refVal,
    message,
    by: auth.currentUser?.email || "admin@teste",
    forceReloadAt: Date.now()
  };

  // === PREVIEW NO PAINEL ADMIN ===
  const wrap = document.getElementById("broadcast-preview");
  const content = document.getElementById("broadcast-preview-content");
  wrap.style.display = "block";

  content.innerHTML = `
    <p><strong>${escapeHtml(data.category)}</strong></p>
    <p>${escapeHtml(data.message)}</p>
    ${data.ref ? `<p class="muted">Referência: ${escapeHtml(data.ref)}</p>` : ""}
    <p class="muted">Enviado por: ${escapeHtml(data.by)}</p>
  `;

  const statusEl = document.getElementById("bc-status");
  statusEl.textContent = "Pré-visualização gerada abaixo 👇";
  statusEl.className = "status muted";
});

async function loadBroadcastLogs() {
  const listEl = document.getElementById("log-list");
  if (!listEl) return;

  listEl.innerHTML = "<p class='muted'>Carregando...</p>";

  try {
    const qRef = query(
      collection(db, "admin", "broadcastLogs", "items"),
      orderBy("ts", "desc"),
      limit(30)
    );

    const snap = await getDocs(qRef);
    if (snap.empty) {
      listEl.innerHTML = "<p class='muted'>Nenhum log registrado ainda.</p>";
      return;
    }

    const html = [];
    snap.forEach(d => {
      const x = d.data();
      const dt = x.ts ? new Date(Number(x.ts)).toLocaleString("pt-BR") : "—";
      html.push(`
        <div class="log-item">
          <strong>${escapeHtml(x.category || "Atualização")}</strong><br>
          <small>${dt}</small><br><br>
          <div>${escapeHtml(x.message || "")}</div>
          ${x.ref ? `<small>Ref: ${escapeHtml(x.ref)}</small><br>` : ""}
          <small>Enviado por: ${escapeHtml(x.by || "Admin")}</small>
        </div>
      `);
    });

    listEl.innerHTML = html.join("");
  } catch (err) {
    console.error("[Admin] Erro ao carregar logs:", err);
    listEl.innerHTML = "<p class='muted'>Erro ao carregar logs.</p>";
  }
}

/* -------------------------------------
  MURAL
-------------------------------------- */
document.getElementById("mural-send")?.addEventListener("click", async () => {
  const titleEl = document.getElementById("mural-title");
  const bodyEl = document.getElementById("mural-body");
  const statusEl = document.getElementById("mural-status");

  const titulo = titleEl.value.trim();
  const corpo = bodyEl.value.trim();

  if (!titulo || !corpo) {
    statusEl.textContent = "Preencha título e mensagem do comunicado.";
    statusEl.className = "status err";
    return;
  }

  try {
    const user = auth.currentUser;
    const by = user?.email || "Admin";

    await addDoc(collection(db, "mural"), {
      titulo,
      corpo,
      createdAt: new Date().toISOString(),
      createdBy: by,
      lidoBy: {}
    });

    statusEl.textContent = "Comunicado publicado com sucesso!";
    statusEl.className = "status ok";

    titleEl.value = "";
    bodyEl.value = "";

    await loadMuralList();
    await loadKpis();
  } catch (err) {
    console.error("[Admin] Erro ao publicar mural:", err);
    statusEl.textContent = "Erro ao publicar comunicado.";
    statusEl.className = "status err";
  }
});

async function loadMuralList() {
  const listEl = document.getElementById("mural-list");
  if (!listEl) return;

  listEl.innerHTML = "<p class='muted'>Carregando...</p>";

  try {
    const qRef = query(
      collection(db, "mural"),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const snap = await getDocs(qRef);
    if (snap.empty) {
      listEl.innerHTML = "<p class='muted'>Nenhum comunicado cadastrado.</p>";
      return;
    }

    const html = [];
    snap.forEach(d => {
      const x = d.data();
      const dt = x.createdAt
        ? new Date(x.createdAt).toLocaleString("pt-BR")
        : "—";

      html.push(`
        <div class="mural-item">
          <strong>${escapeHtml(x.title || "(sem título)")}</strong><br>
          <div>${escapeHtml(x.corpo || "")}</div>
          <small class="muted">${dt} • por ${escapeHtml(x.authorName || "Admin")}</small>
        </div>
      `);
    });

    listEl.innerHTML = html.join("");
  } catch (err) {
    console.error("[Admin] Erro ao carregar mural:", err);
    listEl.innerHTML = "<p class='muted'>Erro ao carregar comunicados.</p>";
  }
}

/* -------------------------------------
  PRESENÇA ONLINE
-------------------------------------- */
async function loadPresence() {
  const listEl = document.getElementById("presence-list");
  if (!listEl) return;
  listEl.innerHTML = "<p class='muted'>Carregando...</p>";

  try {
    const snap = await getDocs(collection(db, "presence"));
    const now = Date.now();

    const rows = [];
    snap.forEach(d => {
      const data = d.data() || {};
      const lastSeen = Number(data.lastSeen || 0);
      const isOnline = data.online && (now - lastSeen) < 20000;

      rows.push({
        id: d.id,
        name: data.name || "(sem nome)",
        email: data.email || "",
        online: isOnline,
        lastSeen,
        raw: data
      });
    });

    if (!rows.length) {
      listEl.innerHTML = "<p class='muted'>Nenhum registro de presença encontrado.</p>";
      return;
    }

    rows.sort((a, b) => Number(b.online) - Number(a.online) || b.lastSeen - a.lastSeen);

    const html = rows.map(r => `
      <div class="presence-item">
        <div class="presence-main">
          <div class="dot ${r.online ? "dot-online" : "dot-offline"}"></div>
          <div>
            <div class="presence-name">${escapeHtml(r.name)}</div>
            <div class="presence-email">${escapeHtml(r.email || r.id)}</div>
          </div>
        </div>
        <div class="muted" style="font-size:12px">
          ${r.online ? "Online agora" : ("Último acesso: " + formatLastSeen(r.lastSeen))}
        </div>
      </div>
    `).join("");

    listEl.innerHTML = html;
  } catch (err) {
    console.error("[Admin] Erro ao carregar presença:", err);
    listEl.innerHTML = "<p class='muted'>Erro ao carregar presença.</p>";
  }
}

/* -------------------------------------
  USUÁRIOS & PERMISSÕES
-------------------------------------- */
async function loadUsers() {
  const listEl = document.getElementById("users-list");
  if (!listEl) return;

  listEl.innerHTML = "<p class='muted'>Carregando...</p>";

  try {
    const snap = await getDocs(collection(db, "users"));

    if (snap.empty) {
      listEl.innerHTML = "<p class='muted'>Nenhum usuário encontrado.</p>";
      return;
    }

    let html = `
      <div class="user-row header">
        <div>Nome</div>
        <div>E-mail</div>
        <div>Função (role)</div>
        <div>Ações</div>
      </div>
    `;

    snap.forEach(d => {
      const u = d.data() || {};
      const id = d.id;
      html += `
        <div class="user-row">
          <div>${escapeHtml(u.name || "(sem nome)")}</div>
          <div>${escapeHtml(u.email || id)}</div>
          <div>
            <select class="user-role" data-uid="${id}">
              <option value="member" ${u.role === "member" ? "selected" : ""}>member</option>
              <option value="editor" ${u.role === "editor" ? "selected" : ""}>editor</option>
              <option value="admin" ${u.role === "admin" ? "selected" : ""}>admin</option>
            </select>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-secondary btn-sm" data-save="${id}">Salvar</button>
            <button class="btn btn-secondary btn-sm" data-reload="${id}">🔄 Reload</button>
          </div>

        </div>
      `;
    });

    listEl.innerHTML = html;
    listEl.querySelectorAll("[data-reload]").forEach(btn => {
      btn.onclick = async () => {
        const uid = btn.dataset.reload;

        btn.disabled = true;
        btn.textContent = "Forçando...";

        try {
          await forceReloadUser(uid);
          btn.textContent = "Enviado ✔";
        } catch (err) {
          console.error("[Admin] Erro ao forçar reload:", err);
          btn.textContent = "Erro ❌";
        }

        setTimeout(() => {
          btn.textContent = "🔄 Reload";
          btn.disabled = false;
        }, 1200);
      };
    });


    // listeners
    listEl.querySelectorAll("[data-save]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const uid = btn.getAttribute("data-save");
        const select = listEl.querySelector(`select[data-uid="${uid}"]`);
        if (!select) return;
        const newRole = select.value;

        btn.disabled = true;
        btn.textContent = "Salvando...";

        try {
          await updateDoc(doc(db, "users", uid), { role: newRole });
          btn.textContent = "Salvo";
          setTimeout(() => {
            btn.textContent = "Salvar";
            btn.disabled = false;
          }, 1200);
        } catch (err) {
          console.error("[Admin] Erro ao salvar role:", err);
          btn.textContent = "Erro";
          setTimeout(() => {
            btn.textContent = "Salvar";
            btn.disabled = false;
          }, 1500);
        }
      });
    });
  } catch (err) {
    console.error("[Admin] Erro ao carregar usuários:", err);
    listEl.innerHTML = "<p class='muted'>Erro ao carregar lista de usuários.</p>";
  }
}

/* -------------------------------------
  TOOLS / TESTES
-------------------------------------- */
document.getElementById("tool-inbox-test")?.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) {
    alert("Nenhum usuário logado. Verifique o login automático.");
    return;
  }

  try {
    await addDoc(collection(db, "users", user.uid, "inbox"), {
      title: "Notificação de teste (Admin)",
      body: "Se você está vendo esta mensagem na inbox do Nexus, o painel admin está funcional.",
      createdAt: new Date().toISOString(),
      read: false
    });

    alert("Notificação de teste enviada com sucesso para a inbox do usuário atual.");
  } catch (err) {
    console.error("[Admin] Erro ao enviar inbox de teste:", err);
    alert("Erro ao enviar notificação de teste. Veja o console.");
  }
});

document.getElementById("tool-ping")?.addEventListener("click", async () => {
  const el = document.getElementById("tool-ping-result");
  if (!el) return;
  el.textContent = "Executando ping...";
  el.className = "status muted";

  try {
    // Apenas tenta ler um doc conhecido (admin/broadcast)
    await getDoc(doc(db, "admin", "broadcast"));
    el.textContent = "Firestore respondendo normalmente ✅";
    el.className = "status ok";
  } catch (err) {
    console.error("[Admin] Erro no ping Firestore:", err);
    el.textContent = "Erro ao acessar o Firestore ❌";
    el.className = "status err";
  }
});

/* -------------------------------------
  HELPERS
-------------------------------------- */
function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;"
  }[c] || c));
}

function formatLastSeen(ts) {
  if (!ts) return "—";
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

/* -------------------------------------
  MAINTENANCE MODE TOGGLE
-------------------------------------- */
async function loadMaintenanceToggle() {
  const toggle = document.getElementById("toggleMaintenance");
  const status = document.getElementById("maintenanceStatus");

  // Se a view não estiver visível / elementos não existirem, não faz nada
  if (!toggle || !status) return;

  try {
    const snap = await getDoc(doc(db, "admin", "broadcast"));
    const data = snap.exists() ? snap.data() : {};

    toggle.checked = data.maintenance === true;

    status.textContent = toggle.checked
      ? "Modo de manutenção ATIVO"
      : "Modo de manutenção desativado";

    status.className = toggle.checked ? "status err" : "status ok";

    toggle.onchange = async () => {
      const newVal = toggle.checked;

      try {
        await setDoc(doc(db, "admin", "broadcast"), {
          maintenance: newVal,
          maintenanceUpdatedAt: Date.now(),
        }, { merge: true });

        status.textContent = newVal
          ? "Modo de manutenção ATIVO"
          : "Modo de manutenção desativado";

        status.className = newVal ? "status err" : "status ok";

      } catch (err) {
        console.error("[Admin] Erro ao atualizar modo de manutenção:", err);
        status.textContent = "Erro ao atualizar modo de manutenção.";
        status.className = "status err";
      }
    };

  } catch (err) {
    console.error("[Admin] Erro ao carregar modo de manutenção:", err);
    status.textContent = "Erro ao carregar status de manutenção.";
    status.className = "status err";
  }
}

/* -------------------------------------
  CARNAVAL THEME TOGGLE
-------------------------------------- */
async function loadCarnavalToggle() {
  const toggle = document.getElementById("toggleCarnavalTheme");
  const status = document.getElementById("carnavalStatus");
  if (!toggle || !status) return;

  try {
    const snap = await getDoc(doc(db, "admin", "broadcast"));
    const data = snap.exists() ? snap.data() : {};

    toggle.checked = data.carnavalTheme === true;

    status.textContent = toggle.checked
      ? "Tema de Carnaval ATIVO 🎉"
      : "Tema de Carnaval desativado";

    status.className = toggle.checked ? "status ok" : "status muted";

    toggle.onchange = async () => {
      const newVal = toggle.checked;
      try {
        await setDoc(doc(db, "admin", "broadcast"), {
          carnavalTheme: newVal,
          carnavalThemeUpdatedAt: Date.now(),
        }, { merge: true });

        status.textContent = newVal
          ? "Tema de Carnaval ATIVO 🎉"
          : "Tema de Carnaval desativado";

        status.className = newVal ? "status ok" : "status muted";
      } catch (err) {
        console.error("[Admin] Erro ao atualizar tema de Carnaval:", err);
        status.textContent = "Erro ao atualizar tema de Carnaval.";
        status.className = "status err";
      }
    };

  } catch (err) {
    console.error("[Admin] Erro ao carregar tema de Carnaval:", err);
    status.textContent = "Erro ao carregar status do tema de Carnaval.";
    status.className = "status err";
  }
}


async function forceReloadUser(uid) {
  await setDoc(
    doc(db, "users", uid, "control", "reload"),
    {
      forceReloadAt: Date.now(),
      by: auth.currentUser?.email || "admin"
    },
    { merge: true }
  );
}


/* -------------------------------------
  INIT
-------------------------------------- */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // se não estiver logado, tenta login automático
    await autoLogin();
    return;
  }

  try {
    await ensureAdminRole(user);
    await loadKpis();
    await loadBroadcastLogs();
    await loadMuralList();
    await loadPresence();
    await loadUsers();
    await loadMaintenanceToggle();
    await loadCarnavalToggle();
  } catch (err) {
    console.warn("[Admin] Acesso bloqueado ou erro durante init:", err);
  }
});

// tenta login automático ao abrir a página
autoLogin().catch(() => { });
