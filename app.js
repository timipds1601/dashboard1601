import { initializeApp } from "https://www.gstatic.comfirebasejs/9.22.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

const firebaseConfig = { databaseURL: "https://indigoapp-fafa0-default-rtdb.asia-southeast1.firebasedatabase.app/" };
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const map = L.map('map').setView([-6.2000, 106.8166], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

const allMarkers = L.layerGroup().addTo(map);
const redIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

// --- VARIABEL GLOBAL ---
let allBusinessData = [];
let currentlySelectedMarker = null;
const regionLayers = {};
let geojsonData = null;
let statistikData = {};

// Variabel untuk Rekap Dashboard
let rekapData = [];
let currentRekapPage = 1;
let itemsPerPage = 10;
let currentRekapSearch = '';

// DOM Elements untuk peta
const filterKategori = document.getElementById('filterKategori');
const dataList = document.getElementById('dataList');
const searchInput = document.getElementById('searchInput');
const searchIdsls = document.getElementById('searchIdsls');
const idslsList = document.getElementById('idsls-list');

// DOM Elements untuk rekap
const searchRekap = document.getElementById('searchRekap');
const exportExcelBtn = document.getElementById('exportExcel');
const exportPDFBtn = document.getElementById('exportPDF');
const rekapTableContainer = document.getElementById('rekapTableContainer');

// ==================== FUNGSI BANTU UNTUK MENDAPATKAN NAMA LENGKAP ====================
function getDisplayName(usaha) {
    // Coba berbagai kemungkinan field nama pemilik
    const namaPemilik = usaha.namaPemilik || usaha.pemilik || usaha.nama_pemilik || usaha.owner || '';
    const namaUsaha = usaha.namaUsaha || usaha.nama_usaha || usaha.nama || '';
    
    if (namaUsaha && namaPemilik) {
        return `${namaUsaha} - ${namaPemilik}`;
    } else if (namaUsaha) {
        return namaUsaha;
    } else if (namaPemilik) {
        return namaPemilik;
    } else {
        return 'Tidak ada nama';
    }
}

// ==================== FUNGSI NAVIGASI ====================
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const petaContent = document.getElementById('petaContent');
    const rekapContent = document.getElementById('rekapContent');
    
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            navItems.forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');
            
            const menuType = this.getAttribute('data-menu');
            
            if (menuType === 'peta') {
                petaContent.style.display = 'flex';
                rekapContent.style.display = 'none';
                setTimeout(() => {
                    map.invalidateSize();
                }, 100);
            } else if (menuType === 'rekap') {
                petaContent.style.display = 'none';
                rekapContent.style.display = 'flex';
                renderRekapDashboard();
            }
        });
    });
}

// ==================== FUNGSI MENGHITUNG TAGGING PER WILAYAH ====================
function hitungStatistikWilayah() {
    if (!geojsonData || allBusinessData.length === 0) return;
    
    statistikData = {};
    
    geojsonData.features.forEach(feature => {
        const idsls = feature.properties.idsls || "unknown";
        const nmsls = feature.properties.nmsls || "Unknown";
        const nmkec = feature.properties.nmkec || "-";
        const nmdesa = feature.properties.nmdesa || "-";
        
        statistikData[idsls] = {
            idsls: idsls,
            nmsls: nmsls,
            nmkec: nmkec,
            nmdesa: nmdesa,
            total: 0,
            menggunakanInternet: 0,
            kategori: {}
        };
    });
    
    allBusinessData.forEach(usaha => {
        const kategori = usaha.kategoriUsaha || "Lainnya";
        const menggunakanInternet = usaha.isMenggunakanInternet === true || 
                                     usaha.isMenggunakanInternet === "true" || 
                                     usaha.isMenggunakanInternet === 1;
        
        const point = turf.point([parseFloat(usaha.longitude), parseFloat(usaha.latitude)]);
        
        geojsonData.features.forEach(feature => {
            const idsls = feature.properties.idsls;
            if (idsls && turf.booleanPointInPolygon(point, feature)) {
                statistikData[idsls].total++;
                if (menggunakanInternet) {
                    statistikData[idsls].menggunakanInternet++;
                }
                if (!statistikData[idsls].kategori[kategori]) {
                    statistikData[idsls].kategori[kategori] = 0;
                }
                statistikData[idsls].kategori[kategori]++;
            }
        });
    });
    
    updateRekapData();
    tampilkanStatistik();
    updatePopupWilayah();
}

// Update data untuk rekap dashboard
function updateRekapData() {
    rekapData = Object.values(statistikData)
        .filter(wilayah => wilayah.idsls !== "unknown")
        .map(wilayah => ({
            idsls: wilayah.idsls,
            nmsls: wilayah.nmsls,
            nmkec: wilayah.nmkec,
            nmdesa: wilayah.nmdesa,
            totalUsaha: wilayah.total,
            menggunakanInternet: wilayah.menggunakanInternet,
            tidakMenggunakanInternet: wilayah.total - wilayah.menggunakanInternet,
            persenInternet: wilayah.total > 0 ? ((wilayah.menggunakanInternet / wilayah.total) * 100).toFixed(1) : 0,
            kategori: wilayah.kategori
        }))
        .sort((a, b) => a.idsls.localeCompare(b.idsls));
}

// Update right navigasi statistik ringkas
function updateRightNavigation(filteredData) {
    const totalUsaha = filteredData.reduce((sum, item) => sum + item.totalUsaha, 0);
    const totalSLS = filteredData.length;
    const avgUsaha = totalSLS > 0 ? (totalUsaha / totalSLS).toFixed(1) : 0;
    const menggunakanInternet = filteredData.reduce((sum, item) => sum + (item.menggunakanInternet || 0), 0);
    const persenInternet = totalUsaha > 0 ? ((menggunakanInternet / totalUsaha) * 100).toFixed(1) : 0;
    
    const statRingkasHtml = `
        <div class="stat-ringkas-item">
            <span class="stat-ringkas-label"><i class="fas fa-store"></i> Total Usaha</span>
            <span class="stat-ringkas-value">${totalUsaha}</span>
        </div>
        <div class="stat-ringkas-item">
            <span class="stat-ringkas-label"><i class="fas fa-building"></i> Total SLS</span>
            <span class="stat-ringkas-value">${totalSLS}</span>
        </div>
        <div class="stat-ringkas-item">
            <span class="stat-ringkas-label"><i class="fas fa-chart-line"></i> Rata-rata per SLS</span>
            <span class="stat-ringkas-value">${avgUsaha}</span>
        </div>
        <div class="stat-ringkas-item">
            <span class="stat-ringkas-label"><i class="fas fa-wifi"></i> Pengguna Internet</span>
            <span class="stat-ringkas-value">${menggunakanInternet} (${persenInternet}%)</span>
        </div>
    `;
    
    const kategoriMap = new Map();
    filteredData.forEach(item => {
        Object.entries(item.kategori || {}).forEach(([kat, jml]) => {
            kategoriMap.set(kat, (kategoriMap.get(kat) || 0) + jml);
        });
    });
    
    const topKategori = Array.from(kategoriMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    
    const kategoriIcons = {
        'Perdagangan': 'fa-store',
        'Kuliner': 'fa-utensils',
        'Jasa': 'fa-hand-sparkles',
        'Lainnya': 'fa-ellipsis-h'
    };
    
    let topKategoriHtml = '';
    topKategori.forEach(([kat, jml]) => {
        const icon = kategoriIcons[kat] || 'fa-tag';
        topKategoriHtml += `
            <div class="top-kategori-item">
                <span class="kategori-name">
                    <i class="fas ${icon}"></i> ${kat}
                </span>
                <span class="kategori-count">${jml}</span>
            </div>
        `;
    });
    
    if (topKategori.length === 0) {
        topKategoriHtml = '<div style="text-align:center; color:#999; padding:20px;">Belum ada data</div>';
    }
    
    const topSLS = [...filteredData]
        .sort((a, b) => b.totalUsaha - a.totalUsaha)
        .slice(0, 5);
    
    let topSLSHtml = '';
    topSLS.forEach((item, index) => {
        topSLSHtml += `
            <div class="top-sls-item" onclick="zoomToSLS('${item.idsls}')">
                <div class="top-sls-rank">${index + 1}</div>
                <div class="top-sls-info">
                    <div class="top-sls-id">${item.idsls}</div>
                    <div class="top-sls-name">${item.nmsls || '-'}</div>
                </div>
                <div class="top-sls-count">${item.totalUsaha}</div>
            </div>
        `;
    });
    
    if (topSLS.length === 0) {
        topSLSHtml = '<div style="text-align:center; color:#999; padding:20px;">Belum ada data</div>';
    }
    
    const statRingkasDiv = document.getElementById('statRingkas');
    const topKategoriDiv = document.getElementById('topKategori');
    const topSLSDiv = document.getElementById('topSLS');
    
    if (statRingkasDiv) statRingkasDiv.innerHTML = statRingkasHtml;
    if (topKategoriDiv) {
        topKategoriDiv.innerHTML = `
            <div class="right-nav-subtitle">
                <i class="fas fa-tags"></i> Top Kategori Usaha
            </div>
            ${topKategoriHtml}
        `;
    }
    if (topSLSDiv) {
        topSLSDiv.innerHTML = `
            <div class="right-nav-subtitle">
                <i class="fas fa-trophy"></i> Top 5 SLS Terbanyak
            </div>
            ${topSLSHtml}
        `;
    }
}

// Render Rekap Dashboard
function renderRekapDashboard() {
    if (!rekapTableContainer) return;
    
    let filteredData = [...rekapData];
    if (currentRekapSearch) {
        filteredData = filteredData.filter(item => 
            item.idsls.toLowerCase().includes(currentRekapSearch.toLowerCase()) ||
            item.nmsls.toLowerCase().includes(currentRekapSearch.toLowerCase()) ||
            item.nmkec.toLowerCase().includes(currentRekapSearch.toLowerCase()) ||
            item.nmdesa.toLowerCase().includes(currentRekapSearch.toLowerCase())
        );
    }
    
    updateRightNavigation(filteredData);
    
    const totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentRekapPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = filteredData.slice(startIndex, endIndex);
    
    const totalUsaha = filteredData.reduce((sum, item) => sum + item.totalUsaha, 0);
    const totalSLS = filteredData.length;
    const avgUsaha = totalSLS > 0 ? (totalUsaha / totalSLS).toFixed(1) : 0;
    
    const totalSLSEl = document.getElementById('totalSLS');
    const totalUsahaAllEl = document.getElementById('totalUsahaAll');
    const avgUsahaEl = document.getElementById('avgUsaha');
    
    if (totalSLSEl) totalSLSEl.textContent = totalSLS;
    if (totalUsahaAllEl) totalUsahaAllEl.textContent = totalUsaha;
    if (avgUsahaEl) avgUsahaEl.textContent = avgUsaha;
    
    let html = `
        <div class="rekap-info">
            <strong>${totalSLS}</strong> SLS | 
            <strong>${totalUsaha}</strong> Total Usaha | 
            Rata-rata <strong>${avgUsaha}</strong> per SLS |
            Halaman <strong>${currentRekapPage}</strong> dari <strong>${totalPages || 1}</strong>
        </div>
        <div class="rekap-table-wrapper">
            <table class="rekap-table">
                <thead>
                    <tr>
                        <th>No</th>
                        <th>IDSLS</th>
                        <th>Nama SLS</th>
                        <th>Kecamatan</th>
                        <th>Desa</th>
                        <th>Total Usaha</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    if (pageData.length === 0) {
        html += `
            <tr>
                <td colspan="6" class="rekap-no-data">
                    <i class="fas fa-database"></i> Tidak ada data ditemukan
                </td>
            </tr>
        `;
    } else {
        pageData.forEach((item, index) => {
            html += `
                <tr onclick="zoomToSLS('${item.idsls}')" style="cursor: pointer;">
                    <td>${startIndex + index + 1}</td>
                    <td><strong>${item.idsls}</strong></td>
                    <td>${item.nmsls}</td>
                    <td>${item.nmkec}</td>
                    <td>${item.nmdesa}</td>
                    <td style="text-align: center; font-weight: bold; color: #667eea;">${item.totalUsaha}</td>
                </tr>
            `;
        });
    }
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    if (totalPages > 1) {
        html += `<div class="rekap-pagination">`;
        for (let i = 1; i <= Math.min(totalPages, 10); i++) {
            html += `<button class="${i === currentRekapPage ? 'active' : ''}" onclick="goToRekapPage(${i})">${i}</button>`;
        }
        if (totalPages > 10) {
            html += `<span style="padding: 6px;">...</span>`;
            html += `<button onclick="goToRekapPage(${totalPages})">${totalPages}</button>`;
        }
        html += `</div>`;
    }
    
    rekapTableContainer.innerHTML = html;
}

// Fungsi zoom ke SLS tertentu
window.zoomToSLS = function(idsls) {
    const petaNav = document.querySelector('.nav-item[data-menu="peta"]');
    if (petaNav) {
        petaNav.click();
    }
    
    setTimeout(() => {
        if (regionLayers[idsls]) {
            map.fitBounds(regionLayers[idsls].getBounds());
            regionLayers[idsls].openPopup();
        } else {
            alert(`Wilayah dengan IDSLS "${idsls}" tidak ditemukan di peta`);
        }
    }, 300);
};

// Fungsi ganti halaman rekap
window.goToRekapPage = function(page) {
    currentRekapPage = page;
    renderRekapDashboard();
};

// ==================== FUNGSI RENDER DISPLAY PETA ====================
function renderDisplay(filterValue) {
    dataList.innerHTML = "";
    allMarkers.clearLayers();

    allBusinessData.forEach(data => {
        const kategori = data.kategoriUsaha || "Lainnya";
        
        if (filterValue === "Semua" || kategori === filterValue) {
            const marker = L.marker([data.latitude, data.longitude]);
            const internetStatus = data.isMenggunakanInternet === true ? '✅ Ya' : '❌ Tidak';
            
            const displayName = getDisplayName(data);
            
            marker.bindPopup(`
                <b>${displayName}</b><br>
                Kategori: ${kategori}<br>
                🌐 Internet: ${internetStatus}
            `);
            
            marker.bindTooltip(displayName, {
                permanent: false,
                direction: 'top',
                offset: [0, -20]
            });
            
            allMarkers.addLayer(marker);

            const div = document.createElement('div');
            div.className = 'item';
            div.innerHTML = `
                <h4>${displayName}</h4>
                <p>Kategori: ${kategori}</p>
                <p>🌐 Internet: ${internetStatus}</p>
            `;
            
            div.onclick = () => {
                if (currentlySelectedMarker) currentlySelectedMarker.setIcon(new L.Icon.Default());
                marker.setIcon(redIcon);
                currentlySelectedMarker = marker;
                map.flyTo([data.latitude, data.longitude], 17);
                marker.openPopup();
            };
            dataList.appendChild(div);
        }
    });
    
    const totalCount = document.getElementById('totalUsahaCount');
    if (totalCount) {
        totalCount.textContent = allBusinessData.length;
    }
}

// ==================== FUNGSI STATISTIK WILAYAH (DISEDERHANAKAN) ====================
function tampilkanStatistik() {
    let statsDiv = document.getElementById('statsWilayah');
    if (!statsDiv) {
        const filterDiv = document.querySelector('.filter-group');
        if (!filterDiv) return;
        
        statsDiv = document.createElement('div');
        statsDiv.id = 'statsWilayah';
        statsDiv.className = 'stats-wilayah';
        filterDiv.parentNode.insertBefore(statsDiv, filterDiv.nextSibling);
        
        const filterInput = document.createElement('input');
        filterInput.id = 'filterStatIdsls';
        filterInput.placeholder = '🔍 Cari IDSLS, Kecamatan, atau Desa...';
        filterInput.className = 'stats-filter-input';
        filterInput.addEventListener('input', () => tampilkanStatistik());
        statsDiv.parentNode.insertBefore(filterInput, statsDiv);
        
        statsDiv.innerHTML = `
            <div class="stats-header" onclick="toggleStats()">
                <span>📊 STATISTIK PER WILAYAH</span>
                <span id="statsToggleIcon">▼</span>
            </div>
            <div id="statsContent" class="stats-content"></div>
        `;
        
        const handle = document.createElement('div');
        handle.className = 'stats-resize-handle';
        handle.innerHTML = '<div class="resize-indicator"></div>';
        statsDiv.parentNode.insertBefore(handle, statsDiv.nextSibling);
        
        initResizableStats();
    }
    
    const statsContent = document.getElementById('statsContent');
    if (!statsContent) return;
    
    const filterText = document.getElementById('filterStatIdsls')?.value.toLowerCase() || '';
    const totalWilayah = Object.keys(statistikData).length;
    
    const headerSpan = document.querySelector('#statsWilayah .stats-header span');
    if (headerSpan) {
        headerSpan.innerHTML = `📊 STATISTIK PER WILAYAH (${totalWilayah} Wilayah)`;
    }
    
    let filteredData = Object.values(statistikData);
    if (filterText) {
        filteredData = filteredData.filter(wilayah => 
            (wilayah.idsls || "").toLowerCase().includes(filterText) ||
            (wilayah.nmkec || "").toLowerCase().includes(filterText) ||
            (wilayah.nmdesa || "").toLowerCase().includes(filterText)
        );
    }
    
    filteredData.sort((a, b) => (a.idsls || "").localeCompare(b.idsls || ""));
    
    let html = '';
    if (filterText && filteredData.length !== totalWilayah) {
        html += `<div class="stats-filter-info">Menampilkan ${filteredData.length} dari ${totalWilayah} wilayah</div>`;
    }
    
    if (filteredData.length === 0) {
        html += `<div class="stats-no-data">Tidak ada wilayah yang ditemukan</div>`;
    } else {
        filteredData.forEach(wilayah => {
            const total = wilayah.total || 0;
            
            // Tampilan sederhana: hanya IDSLS, Kecamatan, Desa, dan Total Usaha
            html += `
                <div class="stat-item" onclick="zoomKeWilayah('${wilayah.idsls}')">
                    <div class="stat-header-row">
                        <div class="stat-idsls">${wilayah.idsls || '-'}</div>
                        <div class="stat-total-badge">${total} usaha</div>
                    </div>
                    <div class="stat-location">
                        <span>📍 Kec: ${wilayah.nmkec || '-'}</span>
                        <span> | Desa: ${wilayah.nmdesa || '-'}</span>
                    </div>
                </div>
            `;
        });
    }
    
    statsContent.innerHTML = html;
}

function updatePopupWilayah() {
    Object.keys(regionLayers).forEach(idsls => {
        const layer = regionLayers[idsls];
        if (layer && statistikData[idsls]) {
            const data = statistikData[idsls];
            const total = data.total || 0;
            const menggunakanInternet = data.menggunakanInternet || 0;
            const tidakMenggunakanInternet = total - menggunakanInternet;
            const persenInternet = total > 0 ? ((menggunakanInternet / total) * 100).toFixed(1) : 0;
            
            let daftarUsahaHtml = '';
            if (total > 0 && total <= 10) {
                const usahaDiWilayah = allBusinessData.filter(usaha => {
                    const point = turf.point([parseFloat(usaha.longitude), parseFloat(usaha.latitude)]);
                    return turf.booleanPointInPolygon(point, layer.feature);
                });
                
                if (usahaDiWilayah.length > 0) {
                    daftarUsahaHtml = '<div style="margin-top:8px"><strong>📋 Daftar Usaha:</strong><br>';
                    usahaDiWilayah.slice(0, 5).forEach(usaha => {
                        const displayName = getDisplayName(usaha);
                        daftarUsahaHtml += `• ${displayName}<br>`;
                    });
                    if (usahaDiWilayah.length > 5) {
                        daftarUsahaHtml += `<small>dan ${usahaDiWilayah.length - 5} usaha lainnya...</small>`;
                    }
                    daftarUsahaHtml += '</div>';
                }
            }
            
            // Popup untuk wilayah (tetap lengkap karena tidak terlalu mengganggu)
            layer.bindPopup(`
                <div style="min-width:280px; max-width:350px; max-height:400px; overflow-y:auto;">
                    <b>🏢 ${data.nmsls || '-'}</b><br>
                    <small>IDSLS: ${data.idsls || '-'}</small><br>
                    <small>📍 ${data.nmkec || '-'} | ${data.nmdesa || '-'}</small>
                    <hr style="margin:8px 0;">
                    <b>📊 Total Usaha: ${total}</b>
                    <div style="margin-top:8px; padding:8px; background:#f0f9ff; border-radius:6px;">
                        <b>🌐 Penggunaan Internet:</b><br>
                        ✅ Menggunakan: ${menggunakanInternet} usaha<br>
                        ❌ Tidak menggunakan: ${tidakMenggunakanInternet} usaha
                        ${total > 0 ? `<br><br><div style="height:6px; background:#ddd; border-radius:3px;"><div style="width:${persenInternet}%; height:100%; background:#4caf50; border-radius:3px;"></div></div>
                        <div style="text-align:center; margin-top:4px;">${persenInternet}% menggunakan internet</div>` : ''}
                    </div>
                    ${daftarUsahaHtml}
                </div>
            `);
        }
    });
}

// Fungsi global
window.toggleStats = function() {
    const content = document.getElementById('statsContent');
    const icon = document.getElementById('statsToggleIcon');
    if (content) {
        if (content.style.display === 'none') {
            content.style.display = 'block';
            if (icon) icon.textContent = '▼';
        } else {
            content.style.display = 'none';
            if (icon) icon.textContent = '▶';
        }
    }
};

window.zoomKeWilayah = function(idsls) {
    if (regionLayers[idsls]) {
        map.fitBounds(regionLayers[idsls].getBounds());
        regionLayers[idsls].openPopup();
    }
};

function initResizableStats() {
    const handle = document.querySelector('.stats-resize-handle');
    const statsContent = document.getElementById('statsContent');
    
    if (!handle || !statsContent) return;
    
    let startY = 0;
    let startHeight = 0;
    let isResizing = false;
    
    function saveHeight(height) {
        localStorage.setItem('statsPanelHeight', height);
    }
    
    function loadHeight() {
        const saved = localStorage.getItem('statsPanelHeight');
        if (saved && parseInt(saved) > 100) {
            statsContent.style.maxHeight = saved + 'px';
        } else {
            statsContent.style.maxHeight = '200px';
        }
    }
    
    handle.addEventListener('mousedown', function(e) {
        e.preventDefault();
        isResizing = true;
        startY = e.clientY;
        startHeight = statsContent.offsetHeight;
        
        document.body.style.cursor = 'ns-resize';
        let overlay = document.getElementById('resize-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'resize-overlay';
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'block';
    });
    
    window.addEventListener('mousemove', function(e) {
        if (!isResizing) return;
        const deltaY = e.clientY - startY;
        let newHeight = startHeight + deltaY;
        newHeight = Math.min(400, Math.max(100, newHeight));
        statsContent.style.maxHeight = newHeight + 'px';
    });
    
    window.addEventListener('mouseup', function() {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            const overlay = document.getElementById('resize-overlay');
            if (overlay) overlay.style.display = 'none';
            saveHeight(statsContent.offsetHeight);
        }
    });
    
    loadHeight();
    statsContent.style.overflowY = 'auto';
}

// ==================== EVENT LISTENER REKAP ====================
if (searchRekap) {
    searchRekap.addEventListener('input', (e) => {
        currentRekapSearch = e.target.value;
        currentRekapPage = 1;
        renderRekapDashboard();
    });
}

if (exportExcelBtn) {
    exportExcelBtn.addEventListener('click', () => {
        let dataToExport = [...rekapData];
        if (currentRekapSearch) {
            dataToExport = dataToExport.filter(item => 
                item.idsls.toLowerCase().includes(currentRekapSearch.toLowerCase()) ||
                item.nmsls.toLowerCase().includes(currentRekapSearch.toLowerCase())
            );
        }
        
        const excelData = dataToExport.map((item, index) => ({
            'No': index + 1,
            'IDSLS': item.idsls,
            'Nama SLS': item.nmsls,
            'Kecamatan': item.nmkec,
            'Desa': item.nmdesa,
            'Total Usaha': item.totalUsaha,
            'Menggunakan Internet': item.menggunakanInternet,
            'Tidak Pakai Internet': item.tidakMenggunakanInternet,
            'Persen Internet': item.persenInternet + '%'
        }));
        
        const headers = Object.keys(excelData[0]);
        const csvContent = [
            headers.join(','),
            ...excelData.map(row => headers.map(header => `"${row[header]}"`).join(','))
        ].join('\n');
        
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.setAttribute('download', `rekap_usaha_per_sls_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        alert('Export Excel berhasil!');
    });
}

if (exportPDFBtn) {
    exportPDFBtn.addEventListener('click', () => {
        let dataToExport = [...rekapData];
        if (currentRekapSearch) {
            dataToExport = dataToExport.filter(item => 
                item.idsls.toLowerCase().includes(currentRekapSearch.toLowerCase()) ||
                item.nmsls.toLowerCase().includes(currentRekapSearch.toLowerCase())
            );
        }
        
        let htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Rekap Total Usaha per SLS</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    h2 { color: #1a1a2e; text-align: center; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 11px; }
                    th { background-color: #1a1a2e; color: white; }
                    .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #666; }
                </style>
            </head>
            <body>
                <h2>Rekap Total Usaha per SLS</h2>
                <p>Tanggal: ${new Date().toLocaleString('id-ID')}</p>
                <p>Total SLS: ${dataToExport.length} | Total Usaha: ${dataToExport.reduce((s, i) => s + i.totalUsaha, 0)}</p>
                <table>
                    <thead>
                        <tr><th>No</th><th>IDSLS</th><th>Nama SLS</th><th>Kecamatan</th><th>Desa</th><th>Total Usaha</th></tr>
                    </thead>
                    <tbody>
        `;
        
        dataToExport.forEach((item, index) => {
            htmlContent += `<tr>
                <td>${index + 1}</td>
                <td>${item.idsls}</td>
                <td>${item.nmsls}</td>
                <td>${item.nmkec}</td>
                <td>${item.nmdesa}</td>
                <td style="text-align:center">${item.totalUsaha}</td>
            </tr>`;
        });
        
        htmlContent += `
                    </tbody>
                </table>
                <div class="footer">Dicetak dari Dashboard Monitoring Usaha</div>
            </body>
            </html>
        `;
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.print();
        printWindow.close();
    });
}

// ==================== LOAD DATA ====================
// LOAD GEOJSON
fetch('data/wilayah.geojson')
    .then(res => res.json())
    .then(data => {
        geojsonData = data;
        
        L.geoJSON(data, {
            style: { color: "#ff7800", weight: 2, fillOpacity: 0.1 },
            onEachFeature: (feature, layer) => {
                const idsls = feature.properties.idsls || "Tanpa ID";
                regionLayers[idsls] = layer;
            }
        }).addTo(map);

        Object.keys(regionLayers).sort().forEach(id => {
            const option = document.createElement('option');
            option.value = id;
            idslsList.appendChild(option);
        });
        
        if (allBusinessData.length > 0) hitungStatistikWilayah();
    })
    .catch(error => console.error('Error loading GeoJSON:', error));

// LOAD FIREBASE
const dbRef = ref(db, 'tagging_usaha');
onValue(dbRef, (snapshot) => {
    allBusinessData = [];
    const kategoriSet = new Set();

    snapshot.forEach((child) => {
        const data = child.val();
        if (data.latitude && data.longitude) {
            allBusinessData.push(data);
            kategoriSet.add(data.kategoriUsaha || "Lainnya");
        }
    });

    updateFilterOptions(kategoriSet);
    renderDisplay("Semua");
    if (geojsonData) hitungStatistikWilayah();
});

function updateFilterOptions(kategoriSet) {
    filterKategori.innerHTML = '<option value="Semua">-- Semua Kategori --</option>';
    Array.from(kategoriSet).sort().forEach(kat => {
        const option = document.createElement('option');
        option.value = kat;
        option.textContent = kat;
        filterKategori.appendChild(option);
    });
}

// ==================== EVENT LISTENERS PETA ====================
filterKategori.addEventListener('change', (e) => renderDisplay(e.target.value));

searchInput.addEventListener('input', (e) => {
    const filter = e.target.value.toLowerCase();
    document.querySelectorAll('.item').forEach(item => {
        const itemText = item.innerText.toLowerCase();
        item.style.display = itemText.includes(filter) ? "" : "none";
    });
});

searchIdsls.addEventListener('input', (e) => {
    if (regionLayers[e.target.value]) {
        map.fitBounds(regionLayers[e.target.value].getBounds());
        regionLayers[e.target.value].openPopup();
    }
});

// ==================== INISIALISASI ====================
initNavigation();
