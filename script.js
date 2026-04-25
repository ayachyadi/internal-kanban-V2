// ==========================================
// 1. IMPORT FIREBASE & KONFIGURASI
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot, addDoc, updateDoc, deleteDoc, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBehvCRHrpP5WtJWlNEkUR4Ua-aqVsgITI",
    authDomain: "internal-kanban.firebaseapp.com",
    projectId: "internal-kanban",
    storageBucket: "internal-kanban.firebasestorage.app",
    messagingSenderId: "972175676296",
    appId: "1:972175676296:web:bd3b11000504fae8c5a03d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================
// 2. VARIABEL GLOBAL
// ==========================================
let currentUserEmail = "Anonim";
let dataTugas = [], dataArsip = [], dataLog = [], dataNotifikasi = [];
let daftarKategoriGlobal = ["Desain", "Engineering", "Marketing", "Lainnya"];
let semuaProfilMap = {}, dataProfilUser = { role: 'admin' }, currentSelectedPics = [];
let modeEditId = null, kolomTarget = null, aktifMentionTarget = null;

// ==========================================
// 3. OTENTIKASI & AUTO-REGISTER
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (!user && (window.location.pathname.includes("index") || window.location.pathname === "/")) {
        window.location.href = "login.html";
    } else if (user) {
        currentUserEmail = user.email;
        try {
            const docRef = doc(db, "profiles", currentUserEmail);
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) {
                await setDoc(docRef, {
                    nama: user.displayName || currentUserEmail.split('@')[0],
                    avatar: user.photoURL || `https://ui-avatars.com/api/?name=${currentUserEmail.split('@')[0]}`,
                    role: 'viewer' 
                });
            }
        } catch (error) { console.error("Gagal auto-register: ", error); }
        inisialisasiDataRealtime();
    }
});

window.prosesLogout = function() { signOut(auth).then(() => { window.location.href = "login.html"; }); };

// ==========================================
// 4. MESIN PEMUAT DATA REAL-TIME TUNGGAL
// ==========================================
window.inisialisasiDataRealtime = function() {
    
    // 4.1 Profil & Tim
    onSnapshot(collection(db, "profiles"), (snapshot) => {
        semuaProfilMap = {};
        snapshot.forEach(doc => { 
            semuaProfilMap[doc.id] = doc.data(); 
            if (currentUserEmail && doc.id === currentUserEmail) dataProfilUser = doc.data();
        });
        if (document.getElementById("inputNamaProfil") && typeof renderHalamanProfil === "function") renderHalamanProfil();
        if (document.getElementById("teamList") && typeof renderManajemenTim === "function") renderManajemenTim();
    });

    // 4.2 Papan Kanban
    onSnapshot(collection(db, "tugas"), (snapshot) => {
        dataTugas = [];
        snapshot.forEach(doc => { dataTugas.push(doc.data()); });
        if (document.getElementById("list-todo")) renderPapanKanban();
        if (document.getElementById("categoryChart")) renderLaporan();
        if (document.getElementById("myTasksList") && typeof renderTugasSaya === "function") renderTugasSaya();
        
        if (modeEditId && document.getElementById("cardModal")?.style.display === "flex") {
            let tugasAktif = dataTugas.find(t => t.id === modeEditId);
            if(tugasAktif) renderKomentar(tugasAktif.komentar || []);
        }

        const urlParams = new URLSearchParams(window.location.search);
        const tugasBukaId = urlParams.get('buka');
        if (tugasBukaId && document.getElementById("cardModal") && typeof bukaModalEdit === "function") {
            bukaModalEdit(tugasBukaId);
            window.history.replaceState(null, '', window.location.pathname);
        }
    });

    // 4.3 Arsip
    onSnapshot(collection(db, "arsip_tugas"), (snapshot) => {
        dataArsip = [];
        snapshot.forEach(doc => { dataArsip.push(doc.data()); });
        if (document.getElementById("archiveList")) renderDaftarArsip();
        if (document.getElementById("categoryChart")) renderLaporan(); 
    });

    // 4.4 Pengaturan Kategori Global
    onSnapshot(doc(db, "pengaturan", "kategori_board"), (docSnap) => {
        if (docSnap.exists()) daftarKategoriGlobal = docSnap.data().list || ["Desain", "Engineering", "Marketing", "Lainnya"];
        if(document.getElementById("inputCategory")) renderDropdownKategori();
        if(document.getElementById("listKategoriPengaturan")) renderPengaturanKategori();
    });

    // 4.5 Log Aktivitas
    onSnapshot(query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(50)), (snapshot) => {
        dataLog = []; snapshot.forEach(doc => dataLog.push(doc.data()));
        if (document.getElementById("logTableBody")) renderTabelLog();
        if (document.getElementById("userHistoryList")) renderHistoryProfil();
    });

    // 4.6 Notifikasi
    onSnapshot(collection(db, "notifikasi"), (snapshot) => {
        dataNotifikasi = [];
        snapshot.forEach(doc => {
            let n = doc.data(); n.id = doc.id;
            if (n.toEmail === currentUserEmail || n.toName === dataProfilUser.nama) dataNotifikasi.push(n);
        });
        dataNotifikasi.sort((a,b) => b.timestamp - a.timestamp);
        const unreadCount = dataNotifikasi.filter(n => !n.isRead).length;
        const badge = document.getElementById("notifBadge");
        if(badge) badge.style.display = unreadCount > 0 ? "flex" : "none";
        if(badge && unreadCount > 0) badge.innerText = unreadCount;
        if(document.getElementById("userNotifList")) renderNotifikasi();
    });
}

// ==========================================
// 5. FUNGSI UTILITAS, NOTIF & MENTION
// ==========================================
async function catatLog(aksi, namaTugas) { await addDoc(collection(db, "logs"), { waktu: new Date().toLocaleString('id-ID'), pengguna: currentUserEmail, aksi: aksi, tugas: namaTugas, timestamp: Date.now() }); }
function dapatkanNamaTampil(email) { return semuaProfilMap[email] ? semuaProfilMap[email].nama : email.split('@')[0]; }
async function kirimNotifikasi(toName, toEmail, pesan) {
    if ((toEmail && toEmail === currentUserEmail) || (toName && toName === dataProfilUser.nama)) return;
    await addDoc(collection(db, "notifikasi"), { toName: toName, toEmail: toEmail, pesan: pesan, isRead: false, timestamp: Date.now() });
}
window.pindaiDanKirimNotifMention = function(teks, judulTugas) {
    let members = window.dapatkanDaftarMember(); 
    members.forEach(member => { if (teks.includes('@' + member)) kirimNotifikasi(member, null, `<strong>${dataProfilUser.nama}</strong> menyebut Anda di tugas: <em>${judulTugas}</em>`); });
}
window.renderNotifikasi = function() {
    const list = document.getElementById("userNotifList"); if(!list) return; list.innerHTML = "";
    const unread = dataNotifikasi.filter(n => !n.isRead);
    if(unread.length === 0) { list.innerHTML = "<p style='color:gray; font-size:13px;'>Tidak ada notifikasi.</p>"; return; }
    unread.forEach(n => { list.innerHTML += `<div class="notif-item"><div class="notif-time">${new Date(n.timestamp).toLocaleString('id-ID')}</div><div>${n.pesan}</div></div>`; });
}
window.tandaiSemuaDibaca = async function() {
    const unread = dataNotifikasi.filter(n => !n.isRead);
    for (let n of unread) await updateDoc(doc(db, "notifikasi", n.id), { isRead: true });
}

window.dapatkanDaftarMember = function() {
    let members = new Set(["Budi Santoso", "Siti Aminah", "Andi Susanto", "Rina Marlina", "Dewi Lestari"]);
    if (dataProfilUser && dataProfilUser.nama) members.add(dataProfilUser.nama);
    for (let email in semuaProfilMap) { if (semuaProfilMap[email] && semuaProfilMap[email].nama) members.add(semuaProfilMap[email].nama); }
    return Array.from(members);
}

window.deteksiMention = function(e) {
    const target = e.target;
    const val = target.tagName === 'DIV' ? target.innerText.replace(/\u00A0/g, ' ') : target.value;
    const words = val.split(/[\s\n]+/); 
    const lastWord = words[words.length - 1];
    const kotakSaran = document.getElementById('mentionBox');

    if (lastWord.startsWith('@')) {
        const keyword = lastWord.substring(1).toLowerCase();
        const members = window.dapatkanDaftarMember(); 
        const cocok = members.filter(m => m.toLowerCase().includes(keyword));
        
        if (cocok.length > 0) {
            aktifMentionTarget = target; 
            kotakSaran.innerHTML = '';
            cocok.forEach(m => { kotakSaran.innerHTML += `<div class="suggestion-item" onmousedown="event.preventDefault(); pilihMention('${m}', '${lastWord}')">${m}</div>`; });
            
            kotakSaran.style.position = 'fixed'; kotakSaran.style.zIndex = '1000000';
            const rect = target.getBoundingClientRect();
            if (target.tagName === 'DIV') {
                const sel = window.getSelection();
                if (sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0).cloneRange(); range.collapse(false);
                    const cursorRect = range.getBoundingClientRect();
                    kotakSaran.style.top = (cursorRect.bottom + 5) + 'px'; kotakSaran.style.left = cursorRect.left + 'px';
                }
            } else { 
                kotakSaran.style.top = (rect.bottom + 5) + 'px'; kotakSaran.style.left = rect.left + 'px'; 
            }
            kotakSaran.style.display = 'block';
        } else { kotakSaran.style.display = 'none'; }
    } else { kotakSaran.style.display = 'none'; }
}

window.pilihMention = function(namaMember, keywordLama) {
    if(!aktifMentionTarget) return;
    if (aktifMentionTarget.tagName === 'DIV') {
        const htmlMention = `<strong style="color:#CCFA59; background:#282828; padding:2px 6px; border-radius:4px;">@${namaMember}</strong>&nbsp;`;
        aktifMentionTarget.innerHTML = aktifMentionTarget.innerHTML.replace(keywordLama, htmlMention);
        const range = document.createRange(); const sel = window.getSelection();
        range.selectNodeContents(aktifMentionTarget); range.collapse(false);
        sel.removeAllRanges(); sel.addRange(range);
    } else { aktifMentionTarget.value = aktifMentionTarget.value.replace(keywordLama, "@" + namaMember + " "); }
    document.getElementById('mentionBox').style.display = 'none'; aktifMentionTarget.focus();
}

// ==========================================
// 6. PAPAN KANBAN (BOARD) & RBAC
// ==========================================
function getCategoryColor(name) {
    if (!name) return '#CCFA59';
    let hash = 0;
    for (let i = 0; i < name.length; i++) { hash = name.charCodeAt(i) + ((hash << 5) - hash); }
    const h = 65 + (Math.abs(hash) % 20); 
    const s = 75 + (Math.abs(hash) % 20);
    const l = 65 + (Math.abs(hash) % 15);
    return `hsl(${h}, ${s}%, ${l}%)`;
}

window.renderPapanKanban = function() {
    ["todo", "doing", "review", "done"].forEach(s => { const list = document.getElementById("list-" + s); if(list) list.innerHTML = ""; });

    let role = dataProfilUser.role || 'admin';
    const btnAddHTML = (role !== 'viewer') ? `<button class="icon-add-btn" onclick="bukaModalTambah('TARGET')" title="Tambah Tugas">+</button>` : '';
    
    if(document.getElementById("list-todo")) {
        document.getElementById("list-todo").previousElementSibling.innerHTML = `<h3>To-Do</h3> ${btnAddHTML.replace('TARGET', 'todo')}`;
        document.getElementById("list-doing").previousElementSibling.innerHTML = `<h3>Doing</h3> ${btnAddHTML.replace('TARGET', 'doing')}`;
    }

    const searchInput = document.getElementById("searchInput");
    const kataKunci = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const metodeSort = document.getElementById("sortSelect") ? document.getElementById("sortSelect").value : "default";
    
    let dataDitampilkan = dataTugas.filter(t => {
        if (kataKunci === "") return true;
        const judul = (t.judul || "").toLowerCase(); const kategori = (t.kategori || "").toLowerCase();
        const pic = Array.isArray(t.pic) ? t.pic.join(" ").toLowerCase() : (t.pic || "").toLowerCase();
        return judul.includes(kataKunci) || kategori.includes(kataKunci) || pic.includes(kataKunci);
    });

    if (metodeSort === "dueDate") dataDitampilkan.sort((a, b) => new Date(a.tenggat || '2099-01-01') - new Date(b.tenggat || '2099-01-01'));
    else if (metodeSort === "category") dataDitampilkan.sort((a, b) => (a.kategori || '').localeCompare(b.kategori || ''));

    dataDitampilkan.forEach(t => {
        const list = document.getElementById("list-" + t.status);
        if(list) {
            const pic = Array.isArray(t.pic) ? t.pic.join(", ") : (t.pic || "-");
            const catColor = getCategoryColor(t.kategori); 
            const dragAttr = (role !== 'viewer') ? `draggable="true" ondragstart="drag(event)"` : '';
            
            list.innerHTML += `
                <div class="card" ${dragAttr} onclick="bukaModalEdit('${t.id}')" id="${t.id}">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <span class="card-category" style="background-color: ${catColor}; color: #282828;">${t.kategori || "Lainnya"}</span>
                        <button class="card-archive-btn" onclick="event.stopPropagation(); arsipTugasSatuan('${t.id}')" title="Arsipkan">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line>
                            </svg>
                        </button>
                    </div>
                    <h4>
