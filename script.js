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

// ==========================================
// 2. VARIABEL GLOBAL
// ==========================================
let currentUserEmail = "Anonim";
let dataTugas = [];
let dataArsip = []; 
let dataLog = [];
let dataNotifikasi = [];
let daftarKategoriGlobal = ["Desain", "Engineering", "Marketing", "Lainnya"];
let semuaProfilMap = {}; 
let dataProfilUser = {}; 
let currentSelectedPics = []; 
let aktifMentionTarget = null;

const currentPath = window.location.pathname;
const isProtectedPage = currentPath.includes("index") || currentPath.includes("tentang") || currentPath.includes("log") || currentPath.includes("report") || currentPath.includes("profile") || currentPath === "/";

if (isProtectedPage) {
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = "login.html";
        } else {
            currentUserEmail = user.email;
            inisialisasiDataRealtime();
        }
    });
}

window.prosesLogout = function() { signOut(auth).then(() => { window.location.href = "login.html"; }); };

// ==========================================
// 3. FIRESTORE REAL-TIME LISTENERS
// ==========================================
function inisialisasiDataRealtime() {
    
    // A. Sinkronisasi Profil
    onSnapshot(collection(db, "profiles"), (snapshot) => {
        semuaProfilMap = {};
        snapshot.forEach(doc => { semuaProfilMap[doc.id] = doc.data(); });

        let inisial = currentUserEmail.charAt(0).toUpperCase();
        dataProfilUser = semuaProfilMap[currentUserEmail] || { 
            nama: currentUserEmail.split('@')[0], 
            avatar: `https://ui-avatars.com/api/?name=${inisial}&background=CCFA59&color=282828&size=150&bold=true` 
        };
        
        const navIcon = document.getElementById("navProfileIcon");
        if(navIcon) navIcon.src = dataProfilUser.avatar;
        
        if (document.getElementById("formProfil")) renderHalamanProfil();
        if (document.getElementById("logTableBody")) renderTabelLog(); 
        if (document.getElementById("list-todo")) renderPapanKanban(); 
    });

    // B. Sinkronisasi Tugas (Papan Utama)
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

    // C. Sinkronisasi KOLEKSI ARSIP
    onSnapshot(collection(db, "arsip_tugas"), (snapshot) => {
        dataArsip = [];
        snapshot.forEach(doc => { dataArsip.push(doc.data()); });
        
        if (document.getElementById("archiveList")) renderDaftarArsip();
        if (document.getElementById("categoryChart")) renderLaporan(); 
    });

    // D. Sinkronisasi Log (Dibatasi 50 Terbaru)
    const qLogs = query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(50));
    onSnapshot(qLogs, (snapshot) => {
        dataLog = [];
        snapshot.forEach(doc => { dataLog.push(doc.data()); });
        
        if (document.getElementById("logTableBody")) renderTabelLog();
        if (document.getElementById("userHistoryList")) renderHistoryProfil();
    });

    // E. Sinkronisasi Notifikasi
    onSnapshot(collection(db, "notifikasi"), (snapshot) => {
        dataNotifikasi = [];
        snapshot.forEach(doc => {
            let notif = doc.data();
            notif.id = doc.id;
            if (notif.toEmail === currentUserEmail || notif.toName === dataProfilUser.nama) {
                dataNotifikasi.push(notif);
            }
        });
        
        dataNotifikasi.sort((a,b) => b.timestamp - a.timestamp);
        
        const unreadCount = dataNotifikasi.filter(n => !n.isRead).length;
        const badge = document.getElementById("notifBadge");
        if(badge) badge.style.display = unreadCount > 0 ? "block" : "none";

        if(document.getElementById("userNotifList")) renderNotifikasi();
    });

    // F. Sinkronisasi Kategori Global
    onSnapshot(doc(db, "pengaturan", "kategori_board"), (docSnap) => {
        if (docSnap.exists()) {
            daftarKategoriGlobal = docSnap.data().list || ["Lainnya"];
        } else {
            setDoc(doc(db, "pengaturan", "kategori_board"), { list: daftarKategoriGlobal });
        }
        
        if(document.getElementById("listKategoriPengaturan")) renderPengaturanKategori();
        if(document.getElementById("inputCategory")) renderDropdownKategori();
    });

    setupAutocompletePIC(); 
}

// ==========================================
// 4. FUNGSI UTILITAS & NOTIFIKASI
// ==========================================
async function catatLog(aksi, namaTugas) {
    const waktuSekarang = new Date().toLocaleString('id-ID');
    await addDoc(collection(db, "logs"), {
        waktu: waktuSekarang, pengguna: currentUserEmail, aksi: aksi, tugas: namaTugas, timestamp: Date.now()
    });
}

function dapatkanNamaTampil(email) {
    return semuaProfilMap[email] ? semuaProfilMap[email].nama : email.split('@')[0];
}

async function kirimNotifikasi(toName, toEmail, pesan) {
    if ((toEmail && toEmail === currentUserEmail) || (toName && toName === dataProfilUser.nama)) return;
    await addDoc(collection(db, "notifikasi"), {
        toName: toName, toEmail: toEmail, pesan: pesan, isRead: false, timestamp: Date.now()
    });
}

window.pindaiDanKirimNotifMention = function(teks, judulTugas) {
    let members = dapatkanDaftarMember();
    members.forEach(member => {
        if (teks.includes('@' + member)) {
            kirimNotifikasi(member, null, `<strong>${dataProfilUser.nama}</strong> menyebut Anda di tugas: <em>${judulTugas}</em>`);
        }
    });
}

window.renderNotifikasi = function() {
    const list = document.getElementById("userNotifList");
    if(!list) return;
    list.innerHTML = "";
    
    const unreadNotifs = dataNotifikasi.filter(n => !n.isRead);
    if(unreadNotifs.length === 0) {
        list.innerHTML = "<p style='color:gray; font-size:13px;'>Hore! Tidak ada notifikasi baru.</p>";
        return;
    }

    unreadNotifs.forEach(n => {
        let dateStr = new Date(n.timestamp).toLocaleString('id-ID');
        list.innerHTML += `<div class="notif-item"><div class="notif-time">${dateStr}</div><div>${n.pesan}</div></div>`;
    });
}

window.tandaiSemuaDibaca = async function() {
    const unreadNotifs = dataNotifikasi.filter(n => !n.isRead);
    for (let n of unreadNotifs) {
        await updateDoc(doc(db, "notifikasi", n.id), { isRead: true });
    }
}

// ==========================================
// 5. FITUR MENTION (@)
// ==========================================
window.deteksiMention = function(e) {
    const target = e.target;
    
    // Perbaikan 1: Ubah "spasi gaib" (non-breaking space) menjadi spasi normal
    const val = target.tagName === 'DIV' ? target.innerText.replace(/\u00A0/g, ' ') : target.value;
    const words = val.split(/[\s\n]+/);
    const lastWord = words[words.length - 1];
    const kotakSaran = document.getElementById('mentionBox');

    // Jika kata terakhir diawali @
    if (lastWord.startsWith('@')) {
        const keyword = lastWord.substring(1).toLowerCase();
        const cocok = dapatkanDaftarMember().filter(m => m.toLowerCase().includes(keyword));
        
        if (cocok.length > 0) {
            aktifMentionTarget = target;
            kotakSaran.innerHTML = '';
            cocok.forEach(m => {
                kotakSaran.innerHTML += `<div class="suggestion-item" onclick="pilihMention('${m}', '${lastWord}')">${m}</div>`;
            });
            
            // Perbaikan 2: Gunakan position 'fixed' dan Z-index absolut agar menembus Modal
            const rect = target.getBoundingClientRect();
            kotakSaran.style.position = 'fixed';
            kotakSaran.style.top = (rect.bottom + 5) + 'px';
            kotakSaran.style.left = rect.left + 'px';
            kotakSaran.style.zIndex = '999999'; // Prioritas layer tertinggi
            kotakSaran.style.display = 'block';
        } else {
            kotakSaran.style.display = 'none';
        }
    } else {
        kotakSaran.style.display = 'none';
    }
}

window.pilihMention = function(namaMember, keywordLama) {
    if(!aktifMentionTarget) return;
    
    if (aktifMentionTarget.tagName === 'DIV') {
        // Mode Deskripsi (Rich Text)
        let teksMentionHTML = `<strong style="color:#CCFA59; background:#282828; padding:2px 6px; border-radius:4px;">@${namaMember}</strong>&nbsp;`;
        aktifMentionTarget.innerHTML = aktifMentionTarget.innerHTML.replace(keywordLama, teksMentionHTML);
        
        // Perbaikan 3: Paksa kursor kembali ke ujung kanan setelah mention dimasukkan
        let range = document.createRange();
        let sel = window.getSelection();
        range.selectNodeContents(aktifMentionTarget);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    } else {
        // Mode Input Komentar
        aktifMentionTarget.value = aktifMentionTarget.value.replace(keywordLama, "@" + namaMember + " ");
    }
    
    document.getElementById('mentionBox').style.display = 'none';
    aktifMentionTarget.focus();
}

// ==========================================
// 6. LOGIKA AUTOCOMPLETE MULTI-PIC
// ==========================================
function dapatkanDaftarMember() {
    let members = new Set(["Budi Santoso", "Siti Aminah", "Andi Susanto", "Rina Marlina", "Dewi Lestari"]);
    members.add(dataProfilUser.nama);
    for (let email in semuaProfilMap) members.add(semuaProfilMap[email].nama);
    return Array.from(members);
}

window.renderPicTags = function() {
    const container = document.getElementById('selectedPics');
    if(!container) return;
    container.innerHTML = '';
    currentSelectedPics.forEach((pic, index) => {
        container.innerHTML += `<span class="pic-tag">${pic} <span class="remove-tag" onclick="hapusPic(${index})">&times;</span></span>`;
    });
}

window.hapusPic = function(index) { currentSelectedPics.splice(index, 1); renderPicTags(); }
window.tambahPic = function(nama) {
    if(!currentSelectedPics.includes(nama)) currentSelectedPics.push(nama);
    document.getElementById('inputPerson').value = '';
    document.getElementById('picSuggestions').style.display = 'none';
    renderPicTags();
}

function setupAutocompletePIC() {
    const input = document.getElementById('inputPerson');
    if(!input) return;

    input.addEventListener('input', function(e) {
        const val = e.target.value.toLowerCase();
        const box = document.getElementById('picSuggestions');
        box.innerHTML = '';
        if(!val) { box.style.display = 'none'; return; }

        const cocok = dapatkanDaftarMember().filter(m => m.toLowerCase().includes(val) && !currentSelectedPics.includes(m));
        if(cocok.length > 0) {
            box.style.display = 'block';
            cocok.forEach(m => { box.innerHTML += `<div class="suggestion-item" onclick="tambahPic('${m}')">${m}</div>`; });
        } else {
            box.style.display = 'block';
            box.innerHTML = `<div class="suggestion-item" onclick="tambahPic('${e.target.value}')"><em>+ Tambah "${e.target.value}"</em></div>`;
        }
    });

    input.addEventListener('keydown', function(e) {
        if(e.key === 'Backspace' && input.value === '' && currentSelectedPics.length > 0) {
            currentSelectedPics.pop(); renderPicTags();
        }
    });

    document.addEventListener('click', function(e) {
        if(!e.target.closest('.multi-select-container')) {
            const box = document.getElementById('picSuggestions');
            if(box) box.style.display = 'none';
        }
    });
}

// ==========================================
// 7. PENGATURAN KATEGORI & PROFIL
// ==========================================
window.renderPengaturanKategori = function() {
    const container = document.getElementById("listKategoriPengaturan");
    if(!container) return;
    container.innerHTML = "";
    
    daftarKategoriGlobal.forEach((kat, index) => {
        container.innerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; background: #FAFAFA; padding: 10px 12px; border: 1px solid rgba(40,40,40,0.1); border-radius: 8px;">
                <span style="font-size: 13px; font-weight: 700; color: #282828;">${kat}</span>
                <button type="button" onclick="hapusKategori(${index})" style="background: none; border: none; color: #E23B3B; cursor: pointer; font-size: 18px; line-height: 1; padding: 0 4px;">&times;</button>
            </div>`;
    });
}

window.tambahKategoriBaru = async function() {
    const input = document.getElementById("inputKategoriBaru");
    const val = input.value.trim();
    if(val !== "" && !daftarKategoriGlobal.includes(val)) {
        let newList = [...daftarKategoriGlobal, val];
        await setDoc(doc(db, "pengaturan", "kategori_board"), { list: newList });
        input.value = "";
        catatLog("Menambahkan kategori papan baru", val);
    } else if (daftarKategoriGlobal.includes(val)) {
        alert("Kategori tersebut sudah ada!");
    }
}

window.hapusKategori = async function(index) {
    let deleted = daftarKategoriGlobal[index];
    if(confirm(`Hapus kategori "${deleted}" secara global untuk semua tim?`)) {
        let newList = [...daftarKategoriGlobal];
        newList.splice(index, 1);
        if(newList.length === 0) newList = ["Lainnya"]; 
        await setDoc(doc(db, "pengaturan", "kategori_board"), { list: newList });
        catatLog("Menghapus kategori papan", deleted);
    }
}

window.renderDropdownKategori = function() {
    const select = document.getElementById("inputCategory");
    if(!select) return;
    const currentValue = select.value; 
    select.innerHTML = "";
    daftarKategoriGlobal.forEach(kat => {
        select.innerHTML += `<option value="${kat}">${kat}</option>`;
    });
    if(daftarKategoriGlobal.includes(currentValue)) select.value = currentValue;
}

window.renderHalamanProfil = function() {
    document.getElementById("inputEmailProfil").value = currentUserEmail;
    document.getElementById("inputNamaProfil").value = dataProfilUser.nama;
    document.getElementById("avatarPreview").src = dataProfilUser.avatar;
    renderHistoryProfil();
}

window.renderHistoryProfil = function() {
    const historyList = document.getElementById("userHistoryList");
    if (!historyList) return;
    const myLogs = dataLog.filter(log => log.pengguna === currentUserEmail);
    if (myLogs.length === 0) {
        historyList.innerHTML = "<p style='color:gray; font-size:13px;'>Anda belum melakukan aktivitas apapun.</p>";
        return;
    }
    historyList.innerHTML = "";
    myLogs.forEach(log => {
        historyList.innerHTML += `<div class="history-item"><div class="history-time">${log.waktu}</div><div class="history-content">Memproses <strong>${log.tugas}</strong>: ${log.aksi}</div></div>`;
    });
}

window.gantiAvatar = function(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) { document.getElementById('avatarPreview').src = e.target.result; }
        reader.readAsDataURL(file);
    }
}

window.simpanProfil = async function(event) {
    event.preventDefault();
    const namaBaru = document.getElementById("inputNamaProfil").value;
    const avatarBaru = document.getElementById("avatarPreview").src;
    
    await setDoc(doc(db, "profiles", currentUserEmail), { nama: namaBaru, avatar: avatarBaru });
    alert("Profil berhasil diperbarui di Cloud!");
}

// ==========================================
// 8. RENDER PAPAN KANBAN & DRAG DROP
// ==========================================
window.renderPapanKanban = function() {
    if (!document.getElementById("list-todo")) return;

    document.getElementById("list-todo").innerHTML = "";
    document.getElementById("list-doing").innerHTML = "";
    document.getElementById("list-review").innerHTML = "";
    document.getElementById("list-done").innerHTML = "";

    const selectElem = document.getElementById("sortSelect");
    const metodeSort = selectElem ? selectElem.value : "default";
    let dataDitampilkan = [...dataTugas];

    if (metodeSort === "dueDate") dataDitampilkan.sort((a, b) => new Date(a.tenggat || '2099-01-01') - new Date(b.tenggat || '2099-01-01'));
    else if (metodeSort === "category") dataDitampilkan.sort((a, b) => (a.kategori || '').localeCompare(b.kategori || ''));

    dataDitampilkan.forEach(tugas => {
        const kategoriHTML = tugas.kategori ? `<span class="card-category">${tugas.kategori}</span>` : '';
        const komentarCount = tugas.komentar ? tugas.komentar.length : 0;
        const infoKomentar = komentarCount > 0 ? ` 💬 ${komentarCount}` : '';
        
        let picDisplay = "Belum ada PIC";
        if (Array.isArray(tugas.pic) && tugas.pic.length > 0) picDisplay = tugas.pic.join(', ');
        else if (typeof tugas.pic === 'string' && tugas.pic) picDisplay = tugas.pic;

        const kartuHTML = `
            <div class="card" draggable="true" ondragstart="drag(event)" onclick="bukaModalEdit('${tugas.id}')" id="${tugas.id}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    ${kategoriHTML}
                    <button class="card-archive-btn" onclick="event.stopPropagation(); arsipTugasSatuan('${tugas.id}')" title="Arsipkan">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>
                    </button>
                </div>
                <h4>${tugas.judul}</h4>
                <p>${picDisplay} • ${tugas.tenggat || "-"}${infoKomentar}</p>
            </div>
        `;
        document.getElementById("list-" + tugas.status).innerHTML += kartuHTML;
    });
}

window.allowDrop = function(ev) { ev.preventDefault(); }
window.drag = function(ev) { ev.dataTransfer.setData("text", ev.target.id); }

window.drop = async function(ev, targetStatus) {
    ev.preventDefault();
    var idKartu = ev.dataTransfer.getData("text");
    let tugasPilihan = dataTugas.find(t => t.id === idKartu);
    
    if (tugasPilihan && tugasPilihan.status !== targetStatus) {
        let isDone = (targetStatus === 'review' || targetStatus === 'done');
        await updateDoc(doc(db, "tugas", idKartu), { status: targetStatus, isDone: isDone });
        catatLog("Memindahkan kartu ke kolom " + targetStatus.toUpperCase(), tugasPilihan.judul);
    }
}

// ==========================================
// 9. MODAL TUGAS CLOUD
// ==========================================
window.formatText = function(command) { document.execCommand(command, false, null); document.getElementById("inputDesc").focus(); }
window.tambahLink = function() { const url = prompt("Masukkan URL:"); if (url) document.execCommand("createLink", false, url); }
window.tambahGambar = function() { const url = prompt("URL Gambar:"); if (url) document.execCommand("insertImage", false, url); }

let modeEditId = null; 
let kolomTarget = null; 

window.bukaModalTambah = function(statusKolom) {
    const modal = document.getElementById("cardModal");
    if(!modal) return;
    modeEditId = null; kolomTarget = statusKolom;
    
    document.getElementById("modalHeader").innerText = "Tambah Tugas Baru";
    document.getElementById("taskForm").reset();
    document.getElementById("inputDesc").innerHTML = "";
    document.getElementById("commentSection").style.display = "none";
    document.getElementById("btnDelete").style.display = "none";
    document.getElementById("inputDoneCheck").checked = false;
    currentSelectedPics = [];
    renderPicTags();
    
    const tzOffset = (new Date()).getTimezoneOffset() * 60000; 
    const today = (new Date(Date.now() - tzOffset)).toISOString().split("T")[0];
    document.getElementById("inputDue").min = today;

    modal.style.display = "flex";
}

window.bukaModalEdit = function(id) {
    const modal = document.getElementById("cardModal");
    if(!modal) return;
    modeEditId = id;
    
    let tugas = dataTugas.find(t => t.id === id) || dataArsip.find(t => t.id === id);
    
    if(tugas) {
        document.getElementById("modalHeader").innerText = "Edit Tugas";
        document.getElementById("inputTitle").value = tugas.judul;
        document.getElementById("inputCategory").value = tugas.kategori || "Lainnya";
        document.getElementById("inputDue").value = tugas.tenggat;
        document.getElementById("inputDesc").innerHTML = tugas.deskripsi || "";
        document.getElementById("inputDoneCheck").checked = tugas.isDone || false;
        
        const tzOffset = (new Date()).getTimezoneOffset() * 60000; 
        const today = (new Date(Date.now() - tzOffset)).toISOString().split("T")[0];
        document.getElementById("inputDue").min = today;

        if (Array.isArray(tugas.pic)) currentSelectedPics = [...tugas.pic];
        else if (typeof tugas.pic === 'string' && tugas.pic) currentSelectedPics = tugas.pic.split(',').map(s=>s.trim());
        else currentSelectedPics = [];
        renderPicTags();
        
        document.getElementById("commentSection").style.display = "block";
        renderKomentar(tugas.komentar || []);
        document.getElementById("btnDelete").style.display = "inline-block";
        
        modal.style.display = "flex";
    }
}

window.tutupModal = function() {
    const modal = document.getElementById("cardModal");
    if(modal) modal.style.display = "none";
}

window.simpanTugas = async function(event) {
    event.preventDefault(); 
    const judul = document.getElementById("inputTitle").value;
    const kategori = document.getElementById("inputCategory").value;
    const tenggat = document.getElementById("inputDue").value;
    const deskripsiRichText = document.getElementById("inputDesc").innerHTML; 
    const isDone = document.getElementById("inputDoneCheck").checked;

    const sisaKetikanPic = document.getElementById("inputPerson").value.trim();
    if (sisaKetikanPic !== "" && !currentSelectedPics.includes(sisaKetikanPic)) {
        currentSelectedPics.push(sisaKetikanPic);
    }

    if (modeEditId) {
        let isDiPapan = dataTugas.some(t => t.id === modeEditId);
        let targetKoleksi = isDiPapan ? "tugas" : "arsip_tugas";
        let tugasAktif = dataTugas.find(t => t.id === modeEditId) || dataArsip.find(t => t.id === modeEditId);

        if(tugasAktif) {
            let newStatus = tugasAktif.status;
            if(isDone && (tugasAktif.status === 'todo' || tugasAktif.status === 'doing')) newStatus = 'review';
            
            let picLama = Array.isArray(tugasAktif.pic) ? tugasAktif.pic : (typeof tugasAktif.pic === 'string' ? tugasAktif.pic.split(',').map(s=>s.trim()) : []);
            let picBaru = currentSelectedPics.filter(p => !picLama.includes(p));
            picBaru.forEach(namaPekerja => {
                kirimNotifikasi(namaPekerja, null, `<strong>${dataProfilUser.nama}</strong> menambahkan Anda sebagai PIC di tugas: <em>${judul}</em>`);
            });

            pindaiDanKirimNotifMention(deskripsiRichText, judul);

            await updateDoc(doc(db, targetKoleksi, modeEditId), {
                judul: judul, kategori: kategori, tenggat: tenggat,
                pic: [...currentSelectedPics], deskripsi: deskripsiRichText, 
                isDone: isDone, status: newStatus
            });
            catatLog("Mengedit kartu", judul);
        }
    } else {
        const newId = "task_" + Date.now();
        
        currentSelectedPics.forEach(namaPekerja => {
            kirimNotifikasi(namaPekerja, null, `<strong>${dataProfilUser.nama}</strong> menugaskan Anda pada kartu baru: <em>${judul}</em>`);
        });

        pindaiDanKirimNotifMention(deskripsiRichText, judul);

        await setDoc(doc(db, "tugas", newId), {
            id: newId, 
            status: isDone ? 'review' : kolomTarget,
            judul: judul, kategori: kategori, tenggat: tenggat,
            pic: [...currentSelectedPics], 
            deskripsi: deskripsiRichText, isDone: isDone, komentar: []
        });
        catatLog("Membuat kartu baru", judul);
    }
    window.tutupModal();
}

window.hapusTugas = async function() {
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

// ==========================================
// 10. KOMENTAR & BALASAN CLOUD
// ==========================================
window.renderKomentar = function(komentarArray) {
    const list = document.getElementById("commentsList");
    if (!list) return;
    list.innerHTML = "";
    if(!komentarArray || komentarArray.length === 0) { list.innerHTML = "<p style='font-size:12px; color:gray;'>Belum ada komentar.</p>"; return; }
    
    komentarArray.forEach((komentar, index) => {
        let namaTampil = dapatkanNamaTampil(komentar.user);
        let replyBadgeHTML = komentar.replyToUser ? `<div class="reply-badge">↳ Membalas pesan dari <strong>${dapatkanNamaTampil(komentar.replyToUser)}</strong></div>` : "";

        list.innerHTML += `<div class="comment-item">${replyBadgeHTML}<div class="comment-meta"><strong>${namaTampil}</strong> • ${komentar.waktu}</div><div class="comment-text">${komentar.teks}</div><div class="comment-actions"><button type="button" class="btn-reply-toggle" onclick="tampilkanFormBalasan(${index})">Balas</button></div><div id="replyForm_${index}" class="reply-form" style="display:none;"><input type="text" id="inputReply_${index}" placeholder="Balas ke ${namaTampil}..." onkeyup="deteksiMention(event)"><button type="button" onclick="simpanBalasan('${komentar.user}', ${index})">Kirim</button></div></div>`;
    });
}

window.simpanKomentar = async function() {
    const teks = document.getElementById("inputComment").value.trim();
    if(teks !== "" && modeEditId) {
        let isDiPapan = dataTugas.some(t => t.id === modeEditId);
        let targetKoleksi = isDiPapan ? "tugas" : "arsip_tugas";
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

window.tampilkanFormBalasan = function(index) {
    const form = document.getElementById("replyForm_" + index);
    form.style.display = (form.style.display === "none") ? "flex" : "none";
}

window.simpanBalasan = async function(targetEmail, index) {
    const teks = document.getElementById("inputReply_" + index).value.trim();
    if(teks !== "" && modeEditId) {
        let isDiPapan = dataTugas.some(t => t.id === modeEditId);
        let targetKoleksi = isDiPapan ? "tugas" : "arsip_tugas";
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

// ==========================================
// 11. PUSAT ARSIP
// ==========================================
window.arsipTugasSatuan = async function(id) {
    let tugas = dataTugas.find(t => t.id === id);
    if (tugas) {
        tugas.status = 'archived';
        await setDoc(doc(db, "arsip_tugas", id), tugas); 
        await deleteDoc(doc(db, "tugas", id)); 
        catatLog("Mengarsipkan kartu", tugas.judul);
    }
}

window.arsipTugasSelesai = async function() {
    const tugasSelesai = dataTugas.filter(t => t.status === 'done');
    if (tugasSelesai.length === 0) { alert("Tidak ada tugas di kolom Done untuk diarsipkan."); return; }

    if (confirm(`Pindahkan ${tugasSelesai.length} tugas ke Pusat Arsip?`)) {
        for (let tugas of tugasSelesai) {
            tugas.status = 'archived';
            await setDoc(doc(db, "arsip_tugas", tugas.id), tugas);
            await deleteDoc(doc(db, "tugas", tugas.id));
        }
        catatLog("Mengarsipkan semua tugas selesai", "Mass Archive");
    }
}

window.bukaModalArsip = function() {
    document.getElementById("archiveModal").style.display = "flex";
    renderDaftarArsip();
}

window.renderDaftarArsip = function() {
    const list = document.getElementById("archiveList");
    if (!list) return;

    if (dataArsip.length === 0) {
        list.innerHTML = "<p style='color:gray; font-size:13px; text-align:center; padding: 32px 0;'>Pusat arsip kosong.</p>";
        return;
    }

    list.innerHTML = "";
    dataArsip.forEach(tugas => {
        let picDisplay = Array.isArray(tugas.pic) ? tugas.pic.join(', ') : (tugas.pic || "Tanpa PIC");
        list.innerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px; background: #FAFAFA; border: 1px solid rgba(40,40,40,0.1); border-radius: 8px; transition: all 0.2s ease; cursor: pointer;" onclick="bukaModalEdit('${tugas.id}')">
                <div>
                    <div style="font-size: 14px; font-weight: 700; color: #282828; margin-bottom: 4px;">${tugas.judul}</div>
                    <div style="font-size: 12px; color: rgba(40,40,40,0.55);">
                        <span style="background: rgba(40,40,40,0.06); padding: 2px 6px; border-radius: 4px; font-weight: 700; color: #282828; font-size: 10px; text-transform: uppercase;">${tugas.kategori || 'LAINNYA'}</span> 
                        &nbsp;•&nbsp; ${picDisplay}
                    </div>
                </div>
                <div style="display: flex; gap: 8px;" onclick="event.stopPropagation();">
                    <button onclick="pulihkanTugas('${tugas.id}')" style="background: #282828; color: #CCFA59; border: none; padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer;">Pulihkan</button>
                    <button onclick="hapusPermanenTugas('${tugas.id}')" style="background: #FFFFFF; color: #E23B3B; border: 1px solid rgba(226,59,59,0.3); padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer;">Hapus Permanen</button>
                </div>
            </div>`;
    });
}

window.pulihkanTugas = async function(id) {
    let tugas = dataArsip.find(t => t.id === id);
    if (tugas) {
        tugas.status = 'done';
        await setDoc(doc(db, "tugas", id), tugas); 
        await deleteDoc(doc(db, "arsip_tugas", id)); 
        catatLog("Memulihkan tugas dari arsip", "Restore");
    }
}

window.hapusPermanenTugas = async function(id) {
    if(confirm("Yakin ingin menghapus tugas ini selamanya?")) {
        let tugas = dataArsip.find(t => t.id === id);
        await deleteDoc(doc(db, "arsip_tugas", id));
        catatLog("Menghapus permanen tugas dari arsip", tugas ? tugas.judul : "Unknown");
    }
}

// ==========================================
// 12. RENDER LOG GENERAL CLOUD
// ==========================================
window.renderTabelLog = function() {
    const tbody = document.getElementById("logTableBody");
    if (!tbody) return; 
    tbody.innerHTML = "";
    dataLog.forEach(log => {
        let namaTampil = dapatkanNamaTampil(log.pengguna);
        tbody.innerHTML += `<tr><td>${log.waktu}</td><td>${namaTampil}</td><td>${log.aksi}</td><td><strong>${log.tugas}</strong></td></tr>`;
    });
}

// ==========================================
// 13. RENDER LAPORAN KINERJA (GABUNGAN)
// ==========================================
window.renderLaporan = function() {
    const chartContainer = document.getElementById("categoryChart");
    if (!chartContainer) return; 

    const filterWaktu = document.getElementById("filterWaktu").value;
    const waktuSekarang = new Date();
    
    let selesai = 0, pending = 0, backlog = 0; 
    let statsKategori = {};

    const gabunganData = [...dataTugas, ...dataArsip];

    gabunganData.forEach(tugas => {
        let waktuDibuat = waktuSekarang;
        if (tugas.id && tugas.id.includes('_')) {
            const extractedTime = parseInt(tugas.id.split('_')[1]);
            if (!isNaN(extractedTime)) waktuDibuat = new Date(extractedTime);
        }
        
        let masukHitungan = false;
        if (filterWaktu === 'all') masukHitungan = true;
        else if (filterWaktu === 'week') masukHitungan = waktuDibuat >= new Date(waktuSekarang.getTime() - (7 * 24 * 60 * 60 * 1000));
        else if (filterWaktu === 'month') masukHitungan = (waktuDibuat.getMonth() === waktuSekarang.getMonth() && waktuDibuat.getFullYear() === waktuSekarang.getFullYear());
        else if (filterWaktu === 'year') masukHitungan = (waktuDibuat.getFullYear() === waktuSekarang.getFullYear());

        if (masukHitungan) {
            if (tugas.status === 'done' || tugas.status === 'review' || tugas.status === 'archived') selesai++;
            else if (tugas.status === 'doing') pending++;
            else if (tugas.status === 'todo') backlog++;

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
    const filterTeks = document.getElementById("filterWaktu").options[document.getElementById("filterWaktu").selectedIndex].text;
    const selesai = document.getElementById("countSelesai").innerText;
    const pending = document.getElementById("countPending").innerText;
    const backlog = document.getElementById("countBacklog").innerText;
    const chartHTMLData = document.getElementById("categoryChart").innerHTML;

    const htmlContent = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Sprout Report - ${filterTeks}</title><style>body { font-family: 'Segoe UI', Arial, sans-serif; background: #f7f7f7; color: #282828; padding: 40px; }.container { max-width: 900px; margin: 0 auto; background: transparent; }h1 { margin-bottom: 5px; } p { color: #666; margin-bottom: 30px; }.stats { display: flex; gap: 20px; margin-bottom: 40px; }.stat-box { flex: 1; padding: 24px; background: #fff; border-radius: 12px; border: 1px solid rgba(40,40,40,0.07); }.stat-box h2 { font-size: 40px; margin: 0 0 10px 0; }.chart-wrapper { background: #f7f7f7; padding-right: 40px; }.progress-row { display: flex; align-items: center; margin-bottom: 20px; }.progress-label { width: 160px; font-weight: bold; font-size: 14px; text-align: right; padding-right: 24px; }.progress-track { flex: 1; background-color: #FFFFFF; border: 1px solid rgba(40,40,40,0.07); border-radius: 8px; height: 48px; position: relative; overflow: hidden; }.progress-fill { height: 100%; border-radius: 8px; display: flex; align-items: center; justify-content: flex-end; padding-right: 20px; }.progress-fill.acid { background-color: #CCFA59; color: #282828; }.progress-fill.black { background-color: #282828; color: #CCFA59; }.progress-fill.grey { background-color: rgba(40,40,40,0.2); color: #282828; }.progress-text { font-weight: bold; font-size: 15px; }</style></head><body><div class="container"><h1>Laporan Kinerja Sprout</h1><p>Periode: <strong>${filterTeks}</strong> | Dihasilkan pada: ${new Date().toLocaleString('id-ID')}</p><div class="stats"><div class="stat-box" style="background:#282828; color:#CCFA59; border:none;"><h2>${selesai}</h2><span style="color: rgba(255,255,255,0.7); font-size:13px; font-weight:bold;">Tugas Selesai</span></div><div class="stat-box"><h2>${pending}</h2><span style="font-size:13px; font-weight:bold;">Pending (Doing)</span></div><div class="stat-box" style="border: 1px solid rgba(226,59,59,0.3);"><h2>${backlog}</h2><span style="color:#E23B3B; font-size:13px; font-weight:bold;">Backlog (To-Do)</span></div></div><h3 style="margin-bottom: 20px; font-size: 16px;">Tingkat Penyelesaian per Kategori</h3><div class="chart-wrapper">${chartHTMLData}</div></div></body></html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Sprout_Report_${filterTeks.replace(/\s+/g, '_')}.html`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}
