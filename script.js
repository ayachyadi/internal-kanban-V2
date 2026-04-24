// ==========================================
// 1. IMPORT FIREBASE & KONFIGURASI
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDocs, onSnapshot, addDoc, updateDoc, deleteDoc, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// !!! MASUKKAN CONFIG FIREBASE ANDA DI SINI !!!
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

let currentUserEmail = "Anonim";
let dataTugas = [], dataArsip = [], dataLog = [], dataNotifikasi = [];
let daftarKategoriGlobal = ["Desain", "Engineering", "Marketing", "Lainnya"];
let semuaProfilMap = {}, dataProfilUser = { role: 'admin' }, currentSelectedPics = [];
let modeEditId = null, kolomTarget = null, aktifMentionTarget = null;

onAuthStateChanged(auth, (user) => {
    if (!user && (window.location.pathname.includes("index") || window.location.pathname === "/")) {
        window.location.href = "login.html";
    } else if (user) {
        currentUserEmail = user.email;
        inisialisasiDataRealtime();
    }
});

window.prosesLogout = function() { signOut(auth).then(() => { window.location.href = "login.html"; }); };

function inisialisasiDataRealtime() {
    onSnapshot(collection(db, "profiles"), (snapshot) => {
        snapshot.forEach(doc => { semuaProfilMap[doc.id] = doc.data(); });
        
        // Membaca Role dari Database, default ke 'admin' agar Anda tidak terkunci
        let pData = semuaProfilMap[currentUserEmail];
        dataProfilUser = pData || { nama: currentUserEmail.split('@')[0], avatar: "", role: 'admin' };
        if(!dataProfilUser.role) dataProfilUser.role = 'admin'; // Proteksi fallback

        const navIcon = document.getElementById("navProfileIcon");
        if(navIcon) navIcon.src = dataProfilUser.avatar || `https://ui-avatars.com/api/?name=${dataProfilUser.nama}`;
        
        if (document.getElementById("formProfil")) renderHalamanProfil();
        if (document.getElementById("list-todo")) renderPapanKanban(); 
    });

    onSnapshot(collection(db, "tugas"), (snapshot) => {
        dataTugas = [];
        snapshot.forEach(doc => { dataTugas.push(doc.data()); });
        if (document.getElementById("list-todo")) renderPapanKanban();
        if (document.getElementById("categoryChart")) renderLaporan();
        if (modeEditId && document.getElementById("cardModal")?.style.display === "flex") {
            let tugasAktif = dataTugas.find(t => t.id === modeEditId);
            if(tugasAktif) renderKomentar(tugasAktif.komentar || []);
        }
    });

    onSnapshot(collection(db, "arsip_tugas"), (snapshot) => {
        dataArsip = [];
        snapshot.forEach(doc => { dataArsip.push(doc.data()); });
        if (document.getElementById("archiveList")) renderDaftarArsip();
        if (document.getElementById("categoryChart")) renderLaporan(); 
    });

    onSnapshot(doc(db, "pengaturan", "kategori_board"), (docSnap) => {
        if (docSnap.exists()) daftarKategoriGlobal = docSnap.data().list;
        if(document.getElementById("inputCategory")) renderDropdownKategori();
        if(document.getElementById("listKategoriPengaturan")) renderPengaturanKategori();
    });

    onSnapshot(query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(50)), (snapshot) => {
        dataLog = []; snapshot.forEach(doc => dataLog.push(doc.data()));
        if (document.getElementById("logTableBody")) renderTabelLog();
        if (document.getElementById("userHistoryList")) renderHistoryProfil();
    });

    onSnapshot(collection(db, "notifikasi"), (snapshot) => {
        dataNotifikasi = [];
        snapshot.forEach(doc => {
            let n = doc.data(); n.id = doc.id;
            if (n.toEmail === currentUserEmail || n.toName === dataProfilUser.nama) dataNotifikasi.push(n);
        });
        dataNotifikasi.sort((a,b) => b.timestamp - a.timestamp);
        const unreadCount = dataNotifikasi.filter(n => !n.isRead).length;
        const badge = document.getElementById("notifBadge");
        if(badge) badge.style.display = unreadCount > 0 ? "block" : "none";
        if(document.getElementById("userNotifList")) renderNotifikasi();
    });
}

// --- FUNGSI UTILITAS & MENTION ---
async function catatLog(aksi, namaTugas) { await addDoc(collection(db, "logs"), { waktu: new Date().toLocaleString('id-ID'), pengguna: currentUserEmail, aksi: aksi, tugas: namaTugas, timestamp: Date.now() }); }
function dapatkanNamaTampil(email) { return semuaProfilMap[email] ? semuaProfilMap[email].nama : email.split('@')[0]; }
async function kirimNotifikasi(toName, toEmail, pesan) {
    if ((toEmail && toEmail === currentUserEmail) || (toName && toName === dataProfilUser.nama)) return;
    await addDoc(collection(db, "notifikasi"), { toName: toName, toEmail: toEmail, pesan: pesan, isRead: false, timestamp: Date.now() });
}
window.pindaiDanKirimNotifMention = function(teks, judulTugas) {
    let members = Array.from(new Set([...Object.values(semuaProfilMap).map(p => p.nama)]));
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

window.deteksiMention = function(e) {
    const target = e.target;
    const val = target.tagName === 'DIV' ? target.innerText.replace(/\u00A0/g, ' ') : target.value;
    const words = val.split(/[\s\n]+/); const lastWord = words[words.length - 1];
    const kotakSaran = document.getElementById('mentionBox');
    if (lastWord.startsWith('@')) {
        const keyword = lastWord.substring(1).toLowerCase();
        const members = Array.from(new Set([...Object.values(semuaProfilMap).map(p => p.nama)]));
        const cocok = members.filter(m => m.toLowerCase().includes(keyword));
        if (cocok.length > 0) {
            aktifMentionTarget = target; kotakSaran.innerHTML = '';
            cocok.forEach(m => { kotakSaran.innerHTML += `<div class="suggestion-item" onmousedown="event.preventDefault(); pilihMention('${m}', '${lastWord}')">${m}</div>`; });
            const rect = target.getBoundingClientRect();
            if (target.tagName === 'DIV') {
                const sel = window.getSelection();
                if (sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0).cloneRange(); range.collapse(false);
                    const cursorRect = range.getBoundingClientRect();
                    kotakSaran.style.top = (cursorRect.bottom + 5) + 'px'; kotakSaran.style.left = cursorRect.left + 'px';
                }
            } else { kotakSaran.style.top = (rect.bottom + 5) + 'px'; kotakSaran.style.left = rect.left + 'px'; }
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

// --- LOGIKA BOARD DENGAN RBAC ---
window.renderPapanKanban = function() {
    ["todo", "doing", "review", "done"].forEach(s => {
        const list = document.getElementById("list-" + s);
        if(list) list.innerHTML = "";
    });

    // RBAC: Hanya memunculkan tombol '+' jika bukan Viewer
    let role = dataProfilUser.role || 'admin';
    const btnAddHTML = (role !== 'viewer') ? `<button class="icon-add-btn" onclick="bukaModalTambah('TARGET')" title="Tambah Tugas">+</button>` : '';
    
    if(document.getElementById("list-todo")) {
        document.getElementById("list-todo").previousElementSibling.innerHTML = `<h3>To-Do</h3> ${btnAddHTML.replace('TARGET', 'todo')}`;
        document.getElementById("list-doing").previousElementSibling.innerHTML = `<h3>Doing</h3> ${btnAddHTML.replace('TARGET', 'doing')}`;
    }

    const metodeSort = document.getElementById("sortSelect") ? document.getElementById("sortSelect").value : "default";
    let dataDitampilkan = [...dataTugas];
    if (metodeSort === "dueDate") dataDitampilkan.sort((a, b) => new Date(a.tenggat || '2099-01-01') - new Date(b.tenggat || '2099-01-01'));
    else if (metodeSort === "category") dataDitampilkan.sort((a, b) => (a.kategori || '').localeCompare(b.kategori || ''));

    dataDitampilkan.forEach(t => {
        const list = document.getElementById("list-" + t.status);
        if(list) {
            const pic = Array.isArray(t.pic) ? t.pic.join(", ") : (t.pic || "-");
            // RBAC: Kunci kemampuan drag & drop jika Viewer
            const dragAttr = (role !== 'viewer') ? `draggable="true" ondragstart="drag(event)"` : '';
            
            list.innerHTML += `
                <div class="card" ${dragAttr} onclick="bukaModalEdit('${t.id}')" id="${t.id}">
                    <div style="display: flex; justify-content: space-between;">
                        <span class="card-category">${t.kategori || "Lainnya"}</span>
                        <button class="card-archive-btn" onclick="event.stopPropagation(); arsipTugasSatuan('${t.id}')" title="Arsipkan">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="21 8 21 21 3 21 3 8"></polyline>
        <rect x="1" y="3" width="22" height="5"></rect>
        <line x1="10" y1="12" x2="14" y2="12"></line>
    </svg>
</button>
                    </div>
                    <h4>${t.judul}</h4>
                    <p>${pic} • ${t.tenggat || "-"}</p>
                </div>`;
        }
    });
}

window.allowDrop = function(ev) { if (dataProfilUser.role !== 'viewer') ev.preventDefault(); }
window.drag = function(ev) { if (dataProfilUser.role !== 'viewer') ev.dataTransfer.setData("text", ev.target.id); }
window.drop = async function(ev, targetStatus) {
    if (dataProfilUser.role === 'viewer') return; // RBAC Guard
    ev.preventDefault();
    var idKartu = ev.dataTransfer.getData("text");
    let tugasPilihan = dataTugas.find(t => t.id === idKartu);
    if (tugasPilihan && tugasPilihan.status !== targetStatus) {
        let isDone = (targetStatus === 'review' || targetStatus === 'done');
        await updateDoc(doc(db, "tugas", idKartu), { status: targetStatus, isDone: isDone });
        catatLog("Memindahkan kartu ke kolom " + targetStatus.toUpperCase(), tugasPilihan.judul);
    }
}

// --- MODAL TUGAS RBAC ---
window.formatText = function(command) { document.execCommand(command, false, null); document.getElementById("inputDesc").focus(); }
window.tambahLink = function() { const url = prompt("Masukkan URL:"); if (url) document.execCommand("createLink", false, url); }

// Mengunci UI form (Digunakan untuk role Viewer)
function aturKunciForm(kunci) {
    document.getElementById("inputTitle").disabled = kunci;
    document.getElementById("inputCategory").disabled = kunci;
    document.getElementById("inputDue").disabled = kunci;
    document.getElementById("inputPerson").disabled = kunci;
    document.getElementById("inputDoneCheck").disabled = kunci;
    document.getElementById("inputDesc").contentEditable = !kunci;
    
    // Sembunyikan Toolbar dan Tombol Simpan
    const toolbars = document.querySelectorAll('.rich-text-toolbar');
    toolbars.forEach(el => el.style.display = kunci ? 'none' : 'flex');
    const formActions = document.querySelector('.form-actions');
    if(formActions) formActions.style.display = kunci ? 'none' : 'flex';
}

window.bukaModalTambah = function(statusKolom) {
    if (dataProfilUser.role === 'viewer') { alert("Akses Ditolak: Anda adalah Viewer."); return; }
    const modal = document.getElementById("cardModal"); if(!modal) return;
    modeEditId = null; kolomTarget = statusKolom;
    document.getElementById("modalHeader").innerText = "Tambah Tugas Baru";
    document.getElementById("taskForm").reset();
    document.getElementById("inputDesc").innerHTML = "";
    document.getElementById("commentSection").style.display = "none";
    document.getElementById("btnDelete").style.display = "none";
    document.getElementById("inputDoneCheck").checked = false;
    currentSelectedPics = []; renderPicTags();
    aturKunciForm(false);
    modal.style.display = "flex";
}

window.bukaModalEdit = function(id) {
    const modal = document.getElementById("cardModal"); if(!modal) return;
    modeEditId = id;
    let tugas = dataTugas.find(t => t.id === id) || dataArsip.find(t => t.id === id);
    if(tugas) {
        let role = dataProfilUser.role || 'admin';
        document.getElementById("modalHeader").innerText = (role === 'viewer') ? "Detail Tugas (Read-Only)" : "Edit Tugas";
        document.getElementById("inputTitle").value = tugas.judul;
        document.getElementById("inputCategory").value = tugas.kategori || "Lainnya";
        document.getElementById("inputDue").value = tugas.tenggat;
        document.getElementById("inputDesc").innerHTML = tugas.deskripsi || "";
        document.getElementById("inputDoneCheck").checked = tugas.isDone || false;
        
        if (Array.isArray(tugas.pic)) currentSelectedPics = [...tugas.pic];
        else if (typeof tugas.pic === 'string' && tugas.pic) currentSelectedPics = tugas.pic.split(',').map(s=>s.trim());
        else currentSelectedPics = [];
        renderPicTags();
        
        document.getElementById("commentSection").style.display = "block";
        renderKomentar(tugas.komentar || []);
        
        // RBAC Check
        aturKunciForm(role === 'viewer');
        
        // Hanya Admin yang boleh melihat tombol Hapus
        document.getElementById("btnDelete").style.display = (role === 'admin') ? "inline-block" : "none";
        
        // Sembunyikan input komentar baru jika Viewer
        const addCommentBox = document.querySelector('.add-comment-box');
        if(addCommentBox) addCommentBox.style.display = (role === 'viewer') ? 'none' : 'flex';

        modal.style.display = "flex";
    }
}
window.tutupModal = function() { const modal = document.getElementById("cardModal"); if(modal) modal.style.display = "none"; }

window.simpanTugas = async function(event) {
    event.preventDefault(); 
    if (dataProfilUser.role === 'viewer') return; // RBAC Guard

    const judul = document.getElementById("inputTitle").value;
    const kategori = document.getElementById("inputCategory").value;
    const tenggat = document.getElementById("inputDue").value;
    const deskripsiRichText = document.getElementById("inputDesc").innerHTML; 
    const isDone = document.getElementById("inputDoneCheck").checked;

    const sisaKetikanPic = document.getElementById("inputPerson").value.trim();
    if (sisaKetikanPic !== "" && !currentSelectedPics.includes(sisaKetikanPic)) currentSelectedPics.push(sisaKetikanPic);

    if (modeEditId) {
        let isDiPapan = dataTugas.some(t => t.id === modeEditId);
        let targetKoleksi = isDiPapan ? "tugas" : "arsip_tugas";
        let tugasAktif = dataTugas.find(t => t.id === modeEditId) || dataArsip.find(t => t.id === modeEditId);
        if(tugasAktif) {
            let newStatus = tugasAktif.status;
            if(isDone && (tugasAktif.status === 'todo' || tugasAktif.status === 'doing')) newStatus = 'review';
            
            let picLama = Array.isArray(tugasAktif.pic) ? tugasAktif.pic : (typeof tugasAktif.pic === 'string' ? tugasAktif.pic.split(',').map(s=>s.trim()) : []);
            let picBaru = currentSelectedPics.filter(p => !picLama.includes(p));
            picBaru.forEach(namaPekerja => { kirimNotifikasi(namaPekerja, null, `<strong>${dataProfilUser.nama}</strong> menambahkan Anda sebagai PIC di tugas: <em>${judul}</em>`); });
            pindaiDanKirimNotifMention(deskripsiRichText, judul);
            await updateDoc(doc(db, targetKoleksi, modeEditId), { judul: judul, kategori: kategori, tenggat: tenggat, pic: [...currentSelectedPics], deskripsi: deskripsiRichText, isDone: isDone, status: newStatus });
            catatLog("Mengedit kartu", judul);
        }
    } else {
        const newId = "task_" + Date.now();
        currentSelectedPics.forEach(namaPekerja => { kirimNotifikasi(namaPekerja, null, `<strong>${dataProfilUser.nama}</strong> menugaskan Anda pada kartu baru: <em>${judul}</em>`); });
        pindaiDanKirimNotifMention(deskripsiRichText, judul);
        await setDoc(doc(db, "tugas", newId), { id: newId, status: isDone ? 'review' : kolomTarget, judul: judul, kategori: kategori, tenggat: tenggat, pic: [...currentSelectedPics], deskripsi: deskripsiRichText, isDone: isDone, komentar: [] });
        catatLog("Membuat kartu baru", judul);
    }
    window.tutupModal();
}

window.hapusTugas = async function() {
    if (dataProfilUser.role !== 'admin') { alert("Hanya Admin yang bisa menghapus tugas."); return; }
    if(confirm("Yakin ingin menghapus tugas ini secara permanen?")) {
        let isDiPapan = dataTugas.some(t => t.id === modeEditId);
        let targetKoleksi = isDiPapan ? "tugas" : "arsip_tugas";
        let tugasAktif = dataTugas.find(t => t.id === modeEditId) || dataArsip.find(t => t.id === modeEditId);
        if(tugasAktif) {
            await deleteDoc(doc(db, targetKoleksi, modeEditId));
            catatLog("Menghapus kartu", tugasAktif.judul);
            window.tutupModal();
        }
    }
}

// --- KOMENTAR ---
window.renderKomentar = function(komentarArray) {
    const list = document.getElementById("commentsList"); if (!list) return; list.innerHTML = "";
    if(!komentarArray || komentarArray.length === 0) { list.innerHTML = "<p style='font-size:12px; color:gray;'>Belum ada komentar.</p>"; return; }
    
    let role = dataProfilUser.role || 'admin';

    komentarArray.forEach((komentar, index) => {
        let namaTampil = dapatkanNamaTampil(komentar.user);
        let replyBadgeHTML = komentar.replyToUser ? `<div class="reply-badge">↳ Membalas pesan dari <strong>${dapatkanNamaTampil(komentar.replyToUser)}</strong></div>` : "";
        
        // RBAC: Sembunyikan tombol balas jika Viewer
        let btnBalas = (role === 'viewer') ? '' : `<div class="comment-actions"><button type="button" class="btn-reply-toggle" onclick="tampilkanFormBalasan(${index})">Balas</button></div>`;

        list.innerHTML += `<div class="comment-item">${replyBadgeHTML}<div class="comment-meta"><strong>${namaTampil}</strong> • ${komentar.waktu}</div><div class="comment-text">${komentar.teks}</div>${btnBalas}<div id="replyForm_${index}" class="reply-form" style="display:none;"><input type="text" id="inputReply_${index}" placeholder="Balas ke ${namaTampil}..." onkeyup="deteksiMention(event)"><button type="button" onclick="simpanBalasan('${komentar.user}', ${index})">Kirim</button></div></div>`;
    });
}
window.simpanKomentar = async function() {
    if (dataProfilUser.role === 'viewer') return;
    const teks = document.getElementById("inputComment").value.trim();
    if(teks !== "" && modeEditId) {
        let isDiPapan = dataTugas.some(t => t.id === modeEditId); let targetKoleksi = isDiPapan ? "tugas" : "arsip_tugas";
        let tugasAktif = dataTugas.find(t => t.id === modeEditId) || dataArsip.find(t => t.id === modeEditId);
        if(tugasAktif) {
            let arrayKomentar = tugasAktif.komentar || []; 
            arrayKomentar.push({ user: currentUserEmail, waktu: new Date().toLocaleString('id-ID'), teks: teks, replyToUser: null });
            pindaiDanKirimNotifMention(teks, tugasAktif.judul);
            await updateDoc(doc(db, targetKoleksi, modeEditId), { komentar: arrayKomentar });
            catatLog("Menambahkan komentar pada", tugasAktif.judul);
            document.getElementById("inputComment").value = "";
        }
    }
}
window.tampilkanFormBalasan = function(index) { const form = document.getElementById("replyForm_" + index); form.style.display = (form.style.display === "none") ? "flex" : "none"; }
window.simpanBalasan = async function(targetEmail, index) {
    if (dataProfilUser.role === 'viewer') return;
    const teks = document.getElementById("inputReply_" + index).value.trim();
    if(teks !== "" && modeEditId) {
        let isDiPapan = dataTugas.some(t => t.id === modeEditId); let targetKoleksi = isDiPapan ? "tugas" : "arsip_tugas";
        let tugasAktif = dataTugas.find(t => t.id === modeEditId) || dataArsip.find(t => t.id === modeEditId);
        if(tugasAktif) {
            let arrayKomentar = tugasAktif.komentar || [];
            arrayKomentar.push({ user: currentUserEmail, waktu: new Date().toLocaleString('id-ID'), teks: teks, replyToUser: targetEmail });
            kirimNotifikasi(null, targetEmail, `<strong>${dataProfilUser.nama}</strong> membalas komentar Anda di tugas: <em>${tugasAktif.judul}</em>`);
            pindaiDanKirimNotifMention(teks, tugasAktif.judul);
            await updateDoc(doc(db, targetKoleksi, modeEditId), { komentar: arrayKomentar });
            catatLog("Membalas komentar tim pada", tugasAktif.judul);
        }
    }
}

// --- ARSIP ---
window.arsipTugasSatuan = async function(id) {
    if (dataProfilUser.role === 'viewer') return;
    let tugas = dataTugas.find(t => t.id === id);
    if (tugas) { tugas.status = 'archived'; await setDoc(doc(db, "arsip_tugas", id), tugas); await deleteDoc(doc(db, "tugas", id)); catatLog("Mengarsipkan kartu", tugas.judul); }
}
window.bukaModalArsip = function() { document.getElementById("archiveModal").style.display = "flex"; renderDaftarArsip(); }
window.renderDaftarArsip = function() {
    const list = document.getElementById("archiveList"); if (!list) return;
    if (dataArsip.length === 0) { list.innerHTML = "<p style='color:gray; font-size:13px; text-align:center; padding: 32px 0;'>Pusat arsip kosong.</p>"; return; }
    list.innerHTML = "";
    
    let role = dataProfilUser.role || 'admin';

    dataArsip.forEach(tugas => {
        let picDisplay = Array.isArray(tugas.pic) ? tugas.pic.join(', ') : (tugas.pic || "Tanpa PIC");
        
        let btnPulihkan = (role !== 'viewer') ? `<button onclick="pulihkanTugas('${tugas.id}')" style="background: #282828; color: #CCFA59; border: none; padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer;">Pulihkan</button>` : '';
        let btnHapus = (role === 'admin') ? `<button onclick="hapusPermanenTugas('${tugas.id}')" style="background: #FFFFFF; color: #E23B3B; border: 1px solid rgba(226,59,59,0.3); padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer;">Hapus Permanen</button>` : '';

        list.innerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px; background: #FAFAFA; border: 1px solid rgba(40,40,40,0.1); border-radius: 8px; transition: all 0.2s ease; cursor: pointer;" onclick="bukaModalEdit('${tugas.id}')">
                <div>
                    <div style="font-size: 14px; font-weight: 700; color: #282828; margin-bottom: 4px;">${tugas.judul}</div>
                    <div style="font-size: 12px; color: rgba(40,40,40,0.55);"><span style="background: rgba(40,40,40,0.06); padding: 2px 6px; border-radius: 4px; font-weight: 700; color: #282828; font-size: 10px; text-transform: uppercase;">${tugas.kategori || 'LAINNYA'}</span> &nbsp;•&nbsp; ${picDisplay}</div>
                </div>
                <div style="display: flex; gap: 8px;" onclick="event.stopPropagation();">
                    ${btnPulihkan}
                    ${btnHapus}
                </div>
            </div>`;
    });
}
window.pulihkanTugas = async function(id) {
    if (dataProfilUser.role === 'viewer') return;
    let tugas = dataArsip.find(t => t.id === id);
    if (tugas) { tugas.status = 'done'; await setDoc(doc(db, "tugas", id), tugas); await deleteDoc(doc(db, "arsip_tugas", id)); catatLog("Memulihkan tugas dari arsip", "Restore"); }
}
window.hapusPermanenTugas = async function(id) {
    if (dataProfilUser.role !== 'admin') { alert("Hanya Admin yang bisa menghapus permanen."); return; }
    if(confirm("Yakin ingin menghapus tugas ini selamanya?")) {
        let tugas = dataArsip.find(t => t.id === id); await deleteDoc(doc(db, "arsip_tugas", id)); catatLog("Menghapus permanen tugas dari arsip", tugas ? tugas.judul : "Unknown");
    }
}

// --- PROFIL & KATEGORI GLOBAL ---
window.renderHalamanProfil = function() {
    document.getElementById("inputEmailProfil").value = currentUserEmail;
    document.getElementById("inputNamaProfil").value = dataProfilUser.nama;
    document.getElementById("avatarPreview").src = dataProfilUser.avatar;
    
    // Tampilkan role di dropdown testing (milik sendiri)
    const roleInput = document.getElementById("inputRoleProfil");
    if(roleInput) roleInput.value = dataProfilUser.role || 'admin';

    // RBAC: Tampilkan panel Kategori & Panel Tim HANYA jika Admin
    const isMimin = (dataProfilUser.role === 'admin');
    const katPanel = document.getElementById("kategoriPanel");
    if(katPanel) katPanel.style.display = isMimin ? 'block' : 'none';
    
    const teamPanel = document.getElementById("teamPanel");
    if(teamPanel) {
        teamPanel.style.display = isMimin ? 'block' : 'none';
        if(isMimin) renderManajemenTim(); // Gambar daftar tim!
    }

    renderHistoryProfil();
}
window.simpanProfil = async function(event) {
    event.preventDefault();
    const namaBaru = document.getElementById("inputNamaProfil").value;
    const avatarBaru = document.getElementById("avatarPreview").src;
    const roleUjiCoba = document.getElementById("inputRoleProfil").value; // Mengambil data role
    
    await setDoc(doc(db, "profiles", currentUserEmail), { nama: namaBaru, avatar: avatarBaru, role: roleUjiCoba }, { merge: true });
    alert("Profil (dan Role) berhasil diperbarui di Cloud!");
}
// ==========================================
// MANAJEMEN TIM (KHUSUS ADMIN)
// ==========================================
window.renderManajemenTim = function() {
    const container = document.getElementById("listTeamPengaturan");
    if (!container) return;
    container.innerHTML = "";

    // Membongkar data semua pengguna dari Firebase
    for (let email in semuaProfilMap) {
        let user = semuaProfilMap[email];
        let userRole = user.role || 'viewer'; // Jika belum punya role, anggap viewer
        
        // Mencegah admin membuang status adminnya sendiri dari panel ini 
        // (Biar tidak tidak sengaja terkunci dari sistem)
        let lockDiriSendiri = (email === currentUserEmail) ? 'disabled title="Gunakan form profil di atas untuk role Anda sendiri"' : '';

        container.innerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; background: #FAFAFA; padding: 12px; border: 1px solid rgba(40,40,40,0.1); border-radius: 8px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="${user.avatar || 'https://ui-avatars.com/api/?name='+user.nama+'&background=CCFA59&color=282828'}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
                    <div>
                        <div style="font-size: 13px; font-weight: 700; color: #282828;">${user.nama}</div>
                        <div style="font-size: 11px; color: rgba(40,40,40,0.6);">${email}</div>
                    </div>
                </div>
                <select class="sprout-select" style="padding: 4px 8px; font-size: 12px; min-width: 100px;" onchange="ubahRolePengguna('${email}', this.value)" ${lockDiriSendiri}>
                    <option value="admin" ${userRole === 'admin' ? 'selected' : ''}>Admin</option>
                    <option value="editor" ${userRole === 'editor' ? 'selected' : ''}>Editor</option>
                    <option value="viewer" ${userRole === 'viewer' ? 'selected' : ''}>Viewer</option>
                </select>
            </div>
        `;
    }
}

window.ubahRolePengguna = async function(emailTarget, roleBaru) {
    if (dataProfilUser.role !== 'admin') {
        alert("Akses Ditolak: Hanya Admin yang bisa mengubah hak akses.");
        return;
    }
    
    if (confirm(`Angkat pengguna ${emailTarget} menjadi ${roleBaru.toUpperCase()}?`)) {
        // Mengirim update langsung ke dokumen profil target
        await setDoc(doc(db, "profiles", emailTarget), { role: roleBaru }, { merge: true });
        catatLog("Mengubah hak akses (role)", emailTarget + " menjadi " + roleBaru);
        // Karena kita pakai Real-time Listener, UI akan otomatis berkedip menyesuaikan!
    } else {
        renderManajemenTim(); // Kembalikan ke posisi semula jika batal
    }
}

window.renderHistoryProfil = function() {
    const historyList = document.getElementById("userHistoryList"); if (!historyList) return;
    const myLogs = dataLog.filter(log => log.pengguna === currentUserEmail);
    if (myLogs.length === 0) { historyList.innerHTML = "<p style='color:gray; font-size:13px;'>Belum ada aktivitas.</p>"; return; }
    historyList.innerHTML = ""; myLogs.forEach(log => { historyList.innerHTML += `<div class="history-item"><div class="history-time">${log.waktu}</div><div class="history-content">Memproses <strong>${log.tugas}</strong>: ${log.aksi}</div></div>`; });
}
window.gantiAvatar = function(event) {
    const file = event.target.files[0];
    if (file) { const reader = new FileReader(); reader.onload = function(e) { document.getElementById('avatarPreview').src = e.target.result; }; reader.readAsDataURL(file); }
}
window.renderPengaturanKategori = function() {
    const container = document.getElementById("listKategoriPengaturan"); if(!container) return; container.innerHTML = "";
    daftarKategoriGlobal.forEach((kat, index) => {
        container.innerHTML += `<div style="display: flex; justify-content: space-between; align-items: center; background: #FAFAFA; padding: 10px 12px; border: 1px solid rgba(40,40,40,0.1); border-radius: 8px;"><span style="font-size: 13px; font-weight: 700; color: #282828;">${kat}</span><button type="button" onclick="hapusKategori(${index})" style="background: none; border: none; color: #E23B3B; cursor: pointer; font-size: 18px; line-height: 1; padding: 0 4px;">&times;</button></div>`;
    });
}
window.tambahKategoriBaru = async function() {
    if (dataProfilUser.role !== 'admin') return;
    const val = document.getElementById("inputKategoriBaru").value.trim();
    if(val !== "" && !daftarKategoriGlobal.includes(val)) { let newList = [...daftarKategoriGlobal, val]; await setDoc(doc(db, "pengaturan", "kategori_board"), { list: newList }); document.getElementById("inputKategoriBaru").value = ""; catatLog("Menambahkan kategori", val); }
}
window.hapusKategori = async function(index) {
    if (dataProfilUser.role !== 'admin') return;
    let deleted = daftarKategoriGlobal[index];
    if(confirm(`Hapus kategori "${deleted}" secara global?`)) { let newList = [...daftarKategoriGlobal]; newList.splice(index, 1); if(newList.length === 0) newList = ["Lainnya"]; await setDoc(doc(db, "pengaturan", "kategori_board"), { list: newList }); catatLog("Menghapus kategori", deleted); }
}
window.renderDropdownKategori = function() {
    const select = document.getElementById("inputCategory"); if(!select) return;
    const currentValue = select.value; select.innerHTML = "";
    daftarKategoriGlobal.forEach(kat => { select.innerHTML += `<option value="${kat}">${kat}</option>`; });
    if(daftarKategoriGlobal.includes(currentValue)) select.value = currentValue;
}

// --- PIC TAGS AUTOCOMPLETE ---
window.renderPicTags = function() {
    const container = document.getElementById('selectedPics'); if(!container) return; container.innerHTML = '';
    currentSelectedPics.forEach((pic, index) => {
        let hapusBtn = (dataProfilUser.role === 'viewer') ? '' : `<span class="remove-tag" onclick="hapusPic(${index})" style="cursor: pointer; font-size: 14px; opacity: 0.6;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">&times;</span>`;
        container.innerHTML += `<span class="pic-tag" style="display: inline-flex; align-items: center; background-color: #CCFA59; color: #282828; padding: 4px 10px; border-radius: 6px; font-size: 13px; font-weight: 700; white-space: nowrap; gap: 6px;">${pic} ${hapusBtn}</span>`;
    });
}
window.hapusPic = function(index) { if (dataProfilUser.role === 'viewer') return; currentSelectedPics.splice(index, 1); renderPicTags(); }
window.tambahPic = function(nama) {
    if (dataProfilUser.role === 'viewer') return;
    if(!currentSelectedPics.includes(nama)) currentSelectedPics.push(nama);
    document.getElementById('inputPerson').value = ''; document.getElementById('picSuggestions').style.display = 'none'; renderPicTags();
}
function setupAutocompletePIC() {
    const input = document.getElementById('inputPerson'); if(!input) return;
    input.addEventListener('input', function(e) {
        if (dataProfilUser.role === 'viewer') return;
        const val = e.target.value.toLowerCase(); const box = document.getElementById('picSuggestions'); box.innerHTML = '';
        if(!val) { box.style.display = 'none'; return; }
        const members = Array.from(new Set([...Object.values(semuaProfilMap).map(p => p.nama)]));
        const cocok = members.filter(m => m.toLowerCase().includes(val) && !currentSelectedPics.includes(m));
        if(cocok.length > 0) { box.style.display = 'block'; cocok.forEach(m => { box.innerHTML += `<div class="suggestion-item" onclick="tambahPic('${m}')">${m}</div>`; }); } 
        else { box.style.display = 'block'; box.innerHTML = `<div class="suggestion-item" onclick="tambahPic('${e.target.value}')"><em>+ Tambah "${e.target.value}"</em></div>`; }
    });
}

// --- GENERAL LOG & REPORT (TIDAK BERUBAH) ---
window.renderTabelLog = function() {
    const tbody = document.getElementById("logTableBody"); if (!tbody) return; tbody.innerHTML = "";
    dataLog.forEach(log => { tbody.innerHTML += `<tr><td>${log.waktu}</td><td>${dapatkanNamaTampil(log.pengguna)}</td><td>${log.aksi}</td><td><strong>${log.tugas}</strong></td></tr>`; });
}
// ==========================================
// 13. RENDER LAPORAN KINERJA (GABUNGAN)
// ==========================================
window.renderLaporan = function() {
    const chartContainer = document.getElementById("categoryChart");
    if (!chartContainer) return; 

    const filterWaktu = document.getElementById("filterWaktu");
    const nilaiFilter = filterWaktu ? filterWaktu.value : 'all';
    const waktuSekarang = new Date();
    
    let selesai = 0, pending = 0, backlog = 0; 
    let statsKategori = {};

    const gabunganData = [...dataTugas, ...dataArsip];

    gabunganData.forEach(tugas => {
        let waktuDibuat = waktuSekarang;
        // Mengambil timestamp dari ID tugas (misal: task_1623456789)
        if (tugas.id && tugas.id.includes('_')) {
            const extractedTime = parseInt(tugas.id.split('_')[1]);
            if (!isNaN(extractedTime)) waktuDibuat = new Date(extractedTime);
        }
        
        let masukHitungan = false;
        if (nilaiFilter === 'all') masukHitungan = true;
        else if (nilaiFilter === 'week') masukHitungan = waktuDibuat >= new Date(waktuSekarang.getTime() - (7 * 24 * 60 * 60 * 1000));
        else if (nilaiFilter === 'month') masukHitungan = (waktuDibuat.getMonth() === waktuSekarang.getMonth() && waktuDibuat.getFullYear() === waktuSekarang.getFullYear());
        else if (nilaiFilter === 'year') masukHitungan = (waktuDibuat.getFullYear() === waktuSekarang.getFullYear());

        if (masukHitungan) {
            // Logika Status
            if (tugas.status === 'done' || tugas.status === 'review' || tugas.status === 'archived') selesai++;
            else if (tugas.status === 'doing') pending++;
            else if (tugas.status === 'todo') backlog++;

            // Logika Kategori
            let kat = tugas.kategori || "Lainnya";
            if (!statsKategori[kat]) statsKategori[kat] = { total: 0, selesai: 0 };
            statsKategori[kat].total++;
            if (tugas.status === 'done' || tugas.status === 'review' || tugas.status === 'archived') statsKategori[kat].selesai++;
        }
    });

    if(document.getElementById("countSelesai")) document.getElementById("countSelesai").innerText = selesai;
    if(document.getElementById("countPending")) document.getElementById("countPending").innerText = pending;
    if(document.getElementById("countBacklog")) document.getElementById("countBacklog").innerText = backlog;

    let htmlGrafik = "";
    let arrKategori = Object.keys(statsKategori).map(key => {
        return { nama: key, persen: Math.round((statsKategori[key].selesai / statsKategori[key].total) * 100) };
    }).sort((a, b) => b.persen - a.persen);

    arrKategori.forEach(kat => {
        let colorClass = kat.persen >= 80 ? 'acid' : (kat.persen >= 40 ? 'black' : 'grey');
        let widthStyle = kat.persen === 0 ? "width: 5%;" : `width: ${kat.persen}%;`;
        htmlGrafik += `<div class="progress-row"><div class="progress-label">${kat.nama}</div><div class="progress-track"><div class="progress-fill ${colorClass}" style="${widthStyle}"><span class="progress-text">${kat.persen}%</span></div></div></div>`;
    });

    if (arrKategori.length === 0) htmlGrafik = "<p style='color:gray; font-size:13px; text-align:center;'>Belum ada data tugas.</p>";
    chartContainer.innerHTML = htmlGrafik;
}

window.downloadReportHTML = function() {
    const filterDropdown = document.getElementById("filterWaktu");
    const filterTeks = filterDropdown ? filterDropdown.options[filterDropdown.selectedIndex].text : "Semua Waktu";
    const selesai = document.getElementById("countSelesai") ? document.getElementById("countSelesai").innerText : "0";
    const pending = document.getElementById("countPending") ? document.getElementById("countPending").innerText : "0";
    const backlog = document.getElementById("countBacklog") ? document.getElementById("countBacklog").innerText : "0";
    
    const chartContainer = document.getElementById("categoryChart");
    const chartHTMLData = chartContainer ? chartContainer.innerHTML : "";

    const htmlContent = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Sprout Report - ${filterTeks}</title><style>body { font-family: 'Segoe UI', Arial, sans-serif; background: #f7f7f7; color: #282828; padding: 40px; }.container { max-width: 900px; margin: 0 auto; background: transparent; }h1 { margin-bottom: 5px; } p { color: #666; margin-bottom: 30px; }.stats { display: flex; gap: 20px; margin-bottom: 40px; }.stat-box { flex: 1; padding: 24px; background: #fff; border-radius: 12px; border: 1px solid rgba(40,40,40,0.07); }.stat-box h2 { font-size: 40px; margin: 0 0 10px 0; }.chart-wrapper { background: #f7f7f7; padding-right: 40px; }.progress-row { display: flex; align-items: center; margin-bottom: 20px; }.progress-label { width: 160px; font-weight: bold; font-size: 14px; text-align: right; padding-right: 24px; }.progress-track { flex: 1; background-color: #FFFFFF; border: 1px solid rgba(40,40,40,0.07); border-radius: 8px; height: 48px; position: relative; overflow: hidden; }.progress-fill { height: 100%; border-radius: 8px; display: flex; align-items: center; justify-content: flex-end; padding-right: 20px; }.progress-fill.acid { background-color: #CCFA59; color: #282828; }.progress-fill.black { background-color: #282828; color: #CCFA59; }.progress-fill.grey { background-color: rgba(40,40,40,0.2); color: #282828; }.progress-text { font-weight: bold; font-size: 15px; }</style></head><body><div class="container"><h1>Laporan Kinerja Sprout</h1><p>Periode: <strong>${filterTeks}</strong> | Dihasilkan pada: ${new Date().toLocaleString('id-ID')}</p><div class="stats"><div class="stat-box" style="background:#282828; color:#CCFA59; border:none;"><h2>${selesai}</h2><span style="color: rgba(255,255,255,0.7); font-size:13px; font-weight:bold;">Tugas Selesai</span></div><div class="stat-box"><h2>${pending}</h2><span style="font-size:13px; font-weight:bold;">Pending (Doing)</span></div><div class="stat-box" style="border: 1px solid rgba(226,59,59,0.3);"><h2>${backlog}</h2><span style="color:#E23B3B; font-size:13px; font-weight:bold;">Backlog (To-Do)</span></div></div><h3 style="margin-bottom: 20px; font-size: 16px;">Tingkat Penyelesaian per Kategori</h3><div class="chart-wrapper">${chartHTMLData}</div></div></body></html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Sprout_Report_${filterTeks.replace(/\s+/g, '_')}.html`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}
