import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
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
let geoJsonLayer = null;

// Variabel untuk Rekap Dashboard
let rekapData = [];
let rekapByKecamatan = [];
let currentRekapPage = 1;
let currentKecamatanPage = 1;
let itemsPerPage = 10;
let itemsKecamatanPerPage = 10;
let currentRekapSearch = '';
let currentKecamatanSearch = '';

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

// ==================== FUNGSI BANTU ====================
function getDisplayName(usaha) {
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
                    if (geoJsonLayer && geoJsonLayer.getBounds().isValid()) {
                        map.fitBounds(geoJsonLayer.getBounds());
                    }
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
    const kecamatanMap = new Map();
    
    geojsonData.features.forEach(feature => {
        // Menggunakan IDSUB SLS sebagai key
        const idsubsls = feature.properties.idsubsls || "unknown";
        const nmsubsls = feature.properties.nmsls || feature.properties.nmsubsls || "Unknown";
        const nmkec = feature.properties.nmkec || "-";
        const nmdesa = feature.properties.nmdesa || "-";
        const idsls = feature.properties.idsls || "-";
        
        // Ambil data usaha dan muatan dari GeoJSON
        const usahaGeoJSON = parseInt(feature.properties.usaha) || 0;
        const muatanGeoJSON = parseInt(feature.properties.muatan) || 0;
        
        statistikData[idsubsls] = {
            idsubsls: idsubsls,
            nmsubsls: nmsubsls,
            idsls: idsls,
            nmkec: nmkec,
            nmdesa: nmdesa,
            total: 0,
            menggunakanInternet: 0,
            kategori: {},
            usahaGeoJSON: usahaGeoJSON,
            muatanGeoJSON: muatanGeoJSON
        };
        
        // Inisialisasi data per kecamatan
        if (!kecamatanMap.has(nmkec)) {
            kecamatanMap.set(nmkec, {
                nmkec: nmkec,
                totalUsaha: 0,
                totalUsahaGeoJSON: 0,
                totalMuatanGeoJSON: 0,
                jumlahSUB: 0,
                desa: new Set(),
                idsubslsList: []
            });
        }
        const kecData = kecamatanMap.get(nmkec);
        kecData.usahaGeoJSON += usahaGeoJSON;
        kecData.muatanGeoJSON += muatanGeoJSON;
        kecData.jumlahSUB++;
        kecData.desa.add(nmdesa);
        kecData.idsubslsList.push(idsubsls);
    });
    
    allBusinessData.forEach(usaha => {
        const kategori = usaha.kategoriUsaha || "Lainnya";
        const menggunakanInternet = usaha.isMenggunakanInternet === true || 
                                     usaha.isMenggunakanInternet === "true" || 
                                     usaha.isMenggunakanInternet === 1;
        
        const point = turf.point([parseFloat(usaha.longitude), parseFloat(usaha.latitude)]);
        
        geojsonData.features.forEach(feature => {
            const idsubsls = feature.properties.idsubsls;
            const nmkec = feature.properties.nmkec || "-";
            if (idsubsls && turf.booleanPointInPolygon(point, feature)) {
                statistikData[idsubsls].total++;
                if (menggunakanInternet) {
                    statistikData[idsubsls].menggunakanInternet++;
                }
                if (!statistikData[idsubsls].kategori[kategori]) {
                    statistikData[idsubsls].kategori[kategori] = 0;
                }
                statistikData[idsubsls].kategori[kategori]++;
                
                // Update data per kecamatan
                if (kecamatanMap.has(nmkec)) {
                    const kecData = kecamatanMap.get(nmkec);
                    kecData.totalUsaha++;
                }
            }
        });
    });
    
    // Konversi kecamatanMap ke array
    rekapByKecamatan = Array.from(kecamatanMap.values())
        .map(kec => ({
            ...kec,
            desa: Array.from(kec.desa)
        }))
        .sort((a, b) => a.nmkec.localeCompare(b.nmkec));
    
    updateRekapData();
    tampilkanStatistik();
    updatePopupWilayah();
}

// Update data untuk rekap dashboard
function updateRekapData() {
    rekapData = Object.values(statistikData)
        .filter(wilayah => wilayah.idsubsls !== "unknown")
        .map(wilayah => ({
            idsubsls: wilayah.idsubsls,
            nmsubsls: wilayah.nmsubsls,
            idsls: wilayah.idsls,
            nmkec: wilayah.nmkec,
            nmdesa: wilayah.nmdesa,
            totalUsaha: wilayah.total,
            menggunakanInternet: wilayah.menggunakanInternet,
            tidakMenggunakanInternet: wilayah.total - wilayah.menggunakanInternet,
            persenInternet: wilayah.total > 0 ? ((wilayah.menggunakanInternet / wilayah.total) * 100).toFixed(1) : 0,
            kategori: wilayah.kategori,
            usahaGeoJSON: wilayah.usahaGeoJSON || 0,
            muatanGeoJSON: wilayah.muatanGeoJSON || 0
        }))
        .sort((a, b) => a.idsubsls.localeCompare(b.idsubsls));
}

// Update right navigasi statistik ringkas
function updateRightNavigation(filteredData) {
    const totalUsaha = filteredData.reduce((sum, item) => sum + item.totalUsaha, 0);
    const totalSLS = filteredData.length;
    const avgUsaha = totalSLS > 0 ? (totalUsaha / totalSLS).toFixed(1) : 0;
    const menggunakanInternet = filteredData.reduce((sum, item) => sum + (item.menggunakanInternet || 0), 0);
    const persenInternet = totalUsaha > 0 ? ((menggunakanInternet / totalUsaha) * 100).toFixed(1) : 0;
    
    const totalUsahaGeoJSON = filteredData.reduce((sum, item) => sum + (item.usahaGeoJSON || 0), 0);
    const totalMuatanGeoJSON = filteredData.reduce((sum, item) => sum + (item.muatanGeoJSON || 0), 0);
    
    const statRingkasHtml = `
        <div class="stat-ringkas-item">
            <span class="stat-ringkas-label"><i class="fas fa-store"></i> Total Usaha</span>
            <span class="stat-ringkas-value">${totalUsaha}</span>
        </div>
        <div class="stat-ringkas-item">
            <span class="stat-ringkas-label"><i class="fas fa-building"></i> Total SUB SLS</span>
            <span class="stat-ringkas-value">${totalSLS}</span>
        </div>
        <div class="stat-ringkas-item">
            <span class="stat-ringkas-label"><i class="fas fa-city"></i> Total Kecamatan</span>
            <span class="stat-ringkas-value">${rekapByKecamatan.length}</span>
        </div>
        <div class="stat-ringkas-item">
            <span class="stat-ringkas-label"><i class="fas fa-chart-line"></i> Rata-rata per SLS</span>
            <span class="stat-ringkas-value">${avgUsaha}</span>
        </div>
        <div class="stat-ringkas-item">
            <span class="stat-ringkas-label"><i class="fas fa-wifi"></i> Pengguna Internet</span>
            <span class="stat-ringkas-value">${menggunakanInternet} (${persenInternet}%)</span>
        </div>
        <div class="stat-ringkas-item" style="border-top: 1px solid #e0e0e0; margin-top: 8px; padding-top: 8px;">
            <span class="stat-ringkas-label"><i class="fas fa-database"></i> Data GeoJSON</span>
            <span class="stat-ringkas-value" style="font-size: 13px;">Usaha: ${totalUsahaGeoJSON}</span>
        </div>
        <div class="stat-ringkas-item" style="margin-top: -5px;">
            <span class="stat-ringkas-label" style="color: #666; font-size: 10px;">Muatan</span>
            <span class="stat-ringkas-value" style="font-size: 13px;">${totalMuatanGeoJSON}</span>
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
            <div class="top-sls-item" onclick="zoomToSLS('${item.idsubsls}')">
                <div class="top-sls-rank">${index + 1}</div>
                <div class="top-sls-info">
                    <div class="top-sls-id">${item.idsubsls}</div>
                    <div class="top-sls-name">${item.nmsubsls || '-'}</div>
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
                <i class="fas fa-trophy"></i> Top 5 SUB SLS Terbanyak
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
            item.idsubsls.toLowerCase().includes(currentRekapSearch.toLowerCase()) ||
            item.nmsubsls.toLowerCase().includes(currentRekapSearch.toLowerCase()) ||
            item.nmkec.toLowerCase().includes(currentRekapSearch.toLowerCase()) ||
            item.nmdesa.toLowerCase().includes(currentRekapSearch.toLowerCase()) ||
            (item.idsls && item.idsls.toLowerCase().includes(currentRekapSearch.toLowerCase()))
        );
    }
    
    // Filter data kecamatan
    let filteredKecamatan = [...rekapByKecamatan];
    if (currentKecamatanSearch) {
        filteredKecamatan = filteredKecamatan.filter(item => 
            item.nmkec.toLowerCase().includes(currentKecamatanSearch.toLowerCase())
        );
    }
    
    updateRightNavigation(filteredData);
    
    const totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentRekapPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = filteredData.slice(startIndex, endIndex);
    
    // Pagination untuk kecamatan
    const totalKecItems = filteredKecamatan.length;
    const totalKecPages = Math.ceil(totalKecItems / itemsKecamatanPerPage);
    const startKecIndex = (currentKecamatanPage - 1) * itemsKecamatanPerPage;
    const endKecIndex = startKecIndex + itemsKecamatanPerPage;
    const pageKecData = filteredKecamatan.slice(startKecIndex, endKecIndex);
    
    const totalUsaha = filteredData.reduce((sum, item) => sum + item.totalUsaha, 0);
    const totalSLS = filteredData.length;
    const avgUsaha = totalSLS > 0 ? (totalUsaha / totalSLS).toFixed(1) : 0;
    const totalUsahaGeoJSON = filteredData.reduce((sum, item) => sum + (item.usahaGeoJSON || 0), 0);
    const totalMuatanGeoJSON = filteredData.reduce((sum, item) => sum + (item.muatanGeoJSON || 0), 0);
    
    const totalSLSEl = document.getElementById('totalSLS');
    const totalUsahaAllEl = document.getElementById('totalUsahaAll');
    const avgUsahaEl = document.getElementById('avgUsaha');
    
    if (totalSLSEl) totalSLSEl.textContent = totalSLS;
    if (totalUsahaAllEl) {
        totalUsahaAllEl.textContent = `${totalUsaha}`;
    }
    if (avgUsahaEl) avgUsahaEl.textContent = avgUsaha;
    
    let html = `
        <div class="rekap-info">
            <strong>${totalSLS}</strong> SUB SLS | 
            <strong>${totalUsaha}</strong> Total Usaha (Real) | 
            <strong>${totalUsahaGeoJSON}</strong> Perkiraan Usaha | 
            <strong>${totalMuatanGeoJSON}</strong> Muatan |
            <strong>${rekapByKecamatan.length}</strong> Kecamatan |
            Halaman <strong>${currentRekapPage}</strong> dari <strong>${totalPages || 1}</strong>
        </div>
        
        <!-- TABEL REKAP PER KECAMATAN -->
        <div style="background: #f8f9fa; padding: 10px 15px; border-radius: 8px; margin-bottom: 15px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <h4 style="margin: 0; color: #1a1a2e; font-size: 14px;">
                    <i class="fas fa-city" style="color: #667eea;"></i> Rekap per Kecamatan
                </h4>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <div style="position: relative; min-width: 200px;">
                        <i class="fas fa-search" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #999;"></i>
                        <input type="text" id="searchKecamatan" placeholder="Cari kecamatan..." 
                               style="padding: 6px 10px 6px 30px; border: 1px solid #ddd; border-radius: 6px; font-size: 12px; width: 100%;">
                    </div>
                </div>
            </div>
            <div style="overflow-x: auto; margin-top: 10px;">
                <table class="rekap-table" style="min-width: 500px; font-size: 12px;">
                    <thead>
                        <tr>
                            <th>No</th>
                            <th>Kecamatan</th>
                            <th>Jumlah SUB SLS</th>
                            <th>Total Usaha (Real)</th>
                            <th>Perkiraan Usaha</th>
                            <th>Muatan</th>
                            <th>Desa</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    if (pageKecData.length === 0) {
        html += `
            <tr>
                <td colspan="7" style="text-align:center; padding:20px; color:#999;">
                    <i class="fas fa-database"></i> Tidak ada data kecamatan
                </td>
            </tr>
        `;
    } else {
        pageKecData.forEach((item, index) => {
            const isDifferent = item.totalUsaha !== item.totalUsahaGeoJSON;
            const diffClass = isDifferent ? 'style="background-color: #fff3cd;"' : '';
            html += `
                <tr ${diffClass}>
                    <td>${startKecIndex + index + 1}</td>
                    <td><strong>${item.nmkec}</strong></td>
                    <td style="text-align:center;">${item.jumlahSUB}</td>
                    <td style="text-align:center; font-weight: bold; color: #667eea;">${item.totalUsaha}</td>
                    <td style="text-align:center; color: #28a745;">${item.totalUsahaGeoJSON || 0}</td>
                    <td style="text-align:center; color: #dc3545;">${item.totalMuatanGeoJSON || 0}</td>
                    <td style="font-size: 10px; color: #666;">${item.desa.join(', ')}</td>
                </tr>
            `;
        });
    }
    
    html += `
                    </tbody>
                </table>
            </div>
            ${totalKecPages > 1 ? `
            <div class="rekap-pagination" style="padding: 10px 0; border-top: 1px solid #e0e0e0; margin-top: 10px;">
                ${Array.from({ length: Math.min(totalKecPages, 5) }, (_, i) => i + 1).map(pageNum => `
                    <button class="${pageNum === currentKecamatanPage ? 'active' : ''}" onclick="goToKecamatanPage(${pageNum})">${pageNum}</button>
                `).join('')}
                ${totalKecPages > 5 ? `<span style="padding: 6px;">...</span><button onclick="goToKecamatanPage(${totalKecPages})">${totalKecPages}</button>` : ''}
            </div>
            ` : ''}
        </div>
        
        <!-- TABEL REKAP PER SUB SLS -->
        <div style="margin-top: 10px;">
            <h4 style="margin: 0 0 10px 0; color: #1a1a2e; font-size: 14px;">
                <i class="fas fa-layer-group" style="color: #667eea;"></i> Detail per SUB SLS
            </h4>
            <div class="rekap-table-wrapper">
                <table class="rekap-table">
                    <thead>
                        <tr>
                            <th>No</th>
                            <th>ID SUB SLS</th>
                            <th>Nama SUB SLS</th>
                            <th>IDSLS</th>
                            <th>Kecamatan</th>
                            <th>Desa</th>
                            <th>Total Usaha</th>
                            <th>Perkiraan Usaha</th>
                            <th>Muatan</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    if (pageData.length === 0) {
        html += `
            <tr>
                <td colspan="9" class="rekap-no-data">
                    <i class="fas fa-database"></i> Tidak ada data ditemukan
                </td>
            </tr>
        `;
    } else {
        pageData.forEach((item, index) => {
            const isDifferent = item.totalUsaha !== item.usahaGeoJSON;
            const diffClass = isDifferent ? 'style="background-color: #fff3cd;"' : '';
            
            html += `
                <tr onclick="zoomToSLS('${item.idsubsls}')" style="cursor: pointer;" ${diffClass}>
                    <td>${startIndex + index + 1}</td>
                    <td><strong>${item.idsubsls}</strong></td>
                    <td>${item.nmsubsls}</td>
                    <td style="font-size: 11px; color: #666;">${item.idsls || '-'}</td>
                    <td>${item.nmkec}</td>
                    <td>${item.nmdesa}</td>
                    <td style="text-align: center; font-weight: bold; color: #667eea;">${item.totalUsaha}</td>
                    <td style="text-align: center; color: #28a745; font-weight: bold;">
                        ${item.usahaGeoJSON || '-'}
                    </td>
                    <td style="text-align: center; color: #dc3545; font-weight: bold;">
                        ${item.muatanGeoJSON || '-'}
                    </td>
                </tr>
            `;
        });
    }
    
    html += `
                    </tbody>
                </table>
            </div>
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
    
    // Event listener untuk search kecamatan
    const searchKecamatan = document.getElementById('searchKecamatan');
    if (searchKecamatan) {
        searchKecamatan.addEventListener('input', (e) => {
            currentKecamatanSearch = e.target.value;
            currentKecamatanPage = 1;
            renderRekapDashboard();
        });
    }
}

// Fungsi ganti halaman kecamatan
window.goToKecamatanPage = function(page) {
    currentKecamatanPage = page;
    renderRekapDashboard();
};

// Fungsi zoom ke SLS tertentu
window.zoomToSLS = function(idsubsls) {
    const petaNav = document.querySelector('.nav-item[data-menu="peta"]');
    if (petaNav) {
        petaNav.click();
    }
    
    setTimeout(() => {
        if (regionLayers[idsubsls]) {
            map.fitBounds(regionLayers[idsubsls].getBounds());
            regionLayers[idsubsls].openPopup();
        } else {
            alert(`Wilayah dengan ID SUB SLS "${idsubsls}" tidak ditemukan di peta`);
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

// ==================== FUNGSI STATISTIK WILAYAH ====================
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
        filterInput.placeholder = '🔍 Cari ID SUB SLS, Nama SLS, Kecamatan, atau Desa...';
        filterInput.className = 'stats-filter-input';
        filterInput.addEventListener('input', () => tampilkanStatistik());
        statsDiv.parentNode.insertBefore(filterInput, statsDiv);
        
        statsDiv.innerHTML = `
            <div class="stats-header" onclick="toggleStats()">
                <span>📊 STATISTIK PER WILAYAH (SUB SLS)</span>
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
        headerSpan.innerHTML = `📊 STATISTIK PER WILAYAH (${totalWilayah} SUB SLS)`;
    }
    
    let filteredData = Object.values(statistikData);
    if (filterText) {
        filteredData = filteredData.filter(wilayah => 
            (wilayah.idsubsls || "").toLowerCase().includes(filterText) ||
            (wilayah.nmsubsls || "").toLowerCase().includes(filterText) ||
            (wilayah.nmkec || "").toLowerCase().includes(filterText) ||
            (wilayah.nmdesa || "").toLowerCase().includes(filterText)
        );
    }
    
    filteredData.sort((a, b) => (a.idsubsls || "").localeCompare(b.idsubsls || ""));
    
    let html = '';
    if (filterText && filteredData.length !== totalWilayah) {
        html += `<div class="stats-filter-info">Menampilkan ${filteredData.length} dari ${totalWilayah} sub SLS</div>`;
    }
    
    if (filteredData.length === 0) {
        html += `<div class="stats-no-data">Tidak ada wilayah yang ditemukan</div>`;
    } else {
        filteredData.forEach(wilayah => {
            const total = wilayah.total || 0;
            const usahaGeo = wilayah.usahaGeoJSON || 0;
            const muatanGeo = wilayah.muatanGeoJSON || 0;
            
            html += `
                <div class="stat-item" onclick="zoomKeWilayah('${wilayah.idsubsls}')">
                    <div class="stat-header-row">
                        <div class="stat-idsls">${wilayah.idsubsls || '-'}</div>
                        <div class="stat-total-badge">${total} usaha</div>
                    </div>
                    <div class="stat-nmsls" style="font-size: 11px; color: #333;">${wilayah.nmsubsls || '-'}</div>
                    <div class="stat-location">
                        <span>📍 Kec: ${wilayah.nmkec || '-'}</span>
                        <span> | Desa: ${wilayah.nmdesa || '-'}</span>
                    </div>
                    <div style="display: flex; gap: 10px; margin-top: 4px; font-size: 10px; color: #666;">
                        <span>📊 Perkiraan: ${usahaGeo} | Muatan: ${muatanGeo}</span>
                    </div>
                </div>
            `;
        });
    }
    
    statsContent.innerHTML = html;
}

function updatePopupWilayah() {
    Object.keys(regionLayers).forEach(idsubsls => {
        const layer = regionLayers[idsubsls];
        if (layer && statistikData[idsubsls]) {
            const data = statistikData[idsubsls];
            const total = data.total || 0;
            const menggunakanInternet = data.menggunakanInternet || 0;
            const tidakMenggunakanInternet = total - menggunakanInternet;
            const persenInternet = total > 0 ? ((menggunakanInternet / total) * 100).toFixed(1) : 0;
            const usahaGeo = data.usahaGeoJSON || 0;
            const muatanGeo = data.muatanGeoJSON || 0;
            
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
            
            layer.bindPopup(`
                <div style="min-width:280px; max-width:350px; max-height:400px; overflow-y:auto;">
                    <b>🏢 ${data.nmsubsls || '-'}</b><br>
                    <small>ID SUB SLS: ${data.idsubsls || '-'}</small><br>
                    <small>IDSLS: ${data.idsls || '-'}</small><br>
                    <small>📍 ${data.nmkec || '-'} | ${data.nmdesa || '-'}</small>
                    <hr style="margin:8px 0;">
                    <b>📊 Total Usaha: ${total}</b><br>
                    <small>📦 Perkiraan: ${usahaGeo} | Muatan: ${muatanGeo}</small>
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

window.zoomKeWilayah = function(idsubsls) {
    if (regionLayers[idsubsls]) {
        map.fitBounds(regionLayers[idsubsls].getBounds());
        regionLayers[idsubsls].openPopup();
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
                item.idsubsls.toLowerCase().includes(currentRekapSearch.toLowerCase()) ||
                item.nmsubsls.toLowerCase().includes(currentRekapSearch.toLowerCase()) ||
                item.nmkec.toLowerCase().includes(currentRekapSearch.toLowerCase()) ||
                item.nmdesa.toLowerCase().includes(currentRekapSearch.toLowerCase())
            );
        }
        
        const excelData = dataToExport.map((item, index) => ({
            'No': index + 1,
            'ID SUB SLS': item.idsubsls,
            'Nama SUB SLS': item.nmsubsls,
            'IDSLS': item.idsls || '-',
            'Kecamatan': item.nmkec,
            'Desa': item.nmdesa,
            'Total Usaha (Real)': item.totalUsaha,
            'Perkiraan Usaha': item.usahaGeoJSON || 0,
            'Muatan': item.muatanGeoJSON || 0,
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
        link.setAttribute('download', `rekap_usaha_per_subsls_${new Date().toISOString().split('T')[0]}.csv`);
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
                item.idsubsls.toLowerCase().includes(currentRekapSearch.toLowerCase()) ||
                item.nmsubsls.toLowerCase().includes(currentRekapSearch.toLowerCase()) ||
                item.nmkec.toLowerCase().includes(currentRekapSearch.toLowerCase()) ||
                item.nmdesa.toLowerCase().includes(currentRekapSearch.toLowerCase())
            );
        }
        
        let htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Rekap Total Usaha per SUB SLS</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    h2 { color: #1a1a2e; text-align: center; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 9px; }
                    th { background-color: #1a1a2e; color: white; }
                    .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #666; }
                    .highlight { background-color: #fff3cd; }
                    .section-title { background: #f0f0f0; padding: 10px; margin-top: 20px; font-weight: bold; }
                </style>
            </head>
            <body>
                <h2>Rekap Total Usaha per SUB SLS</h2>
                <p>Tanggal: ${new Date().toLocaleString('id-ID')}</p>
                <p>Total SUB SLS: ${dataToExport.length} | Total Usaha: ${dataToExport.reduce((s, i) => s + i.totalUsaha, 0)}</p>
                <p>Total Perkiraan Usaha: ${dataToExport.reduce((s, i) => s + (i.usahaGeoJSON || 0), 0)} | Total Muatan: ${dataToExport.reduce((s, i) => s + (i.muatanGeoJSON || 0), 0)}</p>
                
                <div class="section-title">REKAP PER KECAMATAN</div>
                <table>
                    <thead>
                        <tr>
                            <th>No</th>
                            <th>Kecamatan</th>
                            <th>Jumlah SUB SLS</th>
                            <th>Total Usaha</th>
                            <th>Perkiraan Usaha</th>
                            <th>Muatan</th>
                            <th>Desa</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        rekapByKecamatan.forEach((item, index) => {
            htmlContent += `<tr>
                <td>${index + 1}</td>
                <td>${item.nmkec}</td>
                <td style="text-align:center">${item.jumlahSUB}</td>
                <td style="text-align:center">${item.totalUsaha}</td>
                <td style="text-align:center">${item.totalUsahaGeoJSON || 0}</td>
                <td style="text-align:center">${item.totalMuatanGeoJSON || 0}</td>
                <td>${item.desa.join(', ')}</td>
            </tr>`;
        });
        
        htmlContent += `
                    </tbody>
                </table>
                
                <div class="section-title">DETAIL PER SUB SLS</div>
                <table>
                    <thead>
                        <tr>
                            <th>No</th>
                            <th>ID SUB SLS</th>
                            <th>Nama SUB SLS</th>
                            <th>IDSLS</th>
                            <th>Kecamatan</th>
                            <th>Desa</th>
                            <th>Total Usaha</th>
                            <th>Perkiraan Usaha</th>
                            <th>Muatan</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        dataToExport.forEach((item, index) => {
            const isDifferent = item.totalUsaha !== item.usahaGeoJSON;
            const rowClass = isDifferent ? 'class="highlight"' : '';
            htmlContent += `<tr ${rowClass}>
                <td>${index + 1}</td>
                <td>${item.idsubsls}</td>
                <td>${item.nmsubsls}</td>
                <td>${item.idsls || '-'}</td>
                <td>${item.nmkec}</td>
                <td>${item.nmdesa}</td>
                <td style="text-align:center">${item.totalUsaha}</td>
                <td style="text-align:center">${item.usahaGeoJSON || 0}</td>
                <td style="text-align:center">${item.muatanGeoJSON || 0}</td>
            </tr>`;
        });
        
        htmlContent += `
                    </tbody>
                </table>
                <div class="footer">Dicetak dari Dashboard Monitoring Usaha</div>
                <p style="font-size: 9px; color: #666; margin-top: 10px;">
                    * Baris dengan latar kuning menandakan perbedaan antara Total Usaha dan Perkiraan Usaha
                </p>
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
        
        geoJsonLayer = L.geoJSON(data, {
            style: { color: "#ff7800", weight: 2, fillOpacity: 0.1 },
            onEachFeature: (feature, layer) => {
                const idsubsls = feature.properties.idsubsls || feature.properties.idsls || "Tanpa ID";
                regionLayers[idsubsls] = layer;
            }
        }).addTo(map);

        if (geoJsonLayer.getBounds().isValid()) {
            map.fitBounds(geoJsonLayer.getBounds());
            console.log('Peta langsung zoom ke area GeoJSON');
        }

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
    const value = e.target.value;
    if (regionLayers[value]) {
        map.fitBounds(regionLayers[value].getBounds());
        regionLayers[value].openPopup();
    }
});

// ==================== FUNGSI TOGGLE NAVIGASI ====================
window.toggleNav = function() {
    const leftNav = document.getElementById('leftNav');
    const toggleIcon = document.getElementById('toggleIcon');
    
    if (!leftNav) return;
    
    leftNav.classList.toggle('collapsed');
    
    if (toggleIcon) {
        if (leftNav.classList.contains('collapsed')) {
            toggleIcon.className = 'fas fa-chevron-right';
        } else {
            toggleIcon.className = 'fas fa-chevron-left';
        }
    }
    
    setTimeout(() => {
        if (typeof map !== 'undefined' && map) {
            map.invalidateSize();
        }
    }, 350);
};

// Keyboard shortcut: Ctrl + B untuk toggle
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        toggleNav();
    }
});

// Hover tooltip untuk collapsed state
const leftNav = document.getElementById('leftNav');
if (leftNav) {
    leftNav.addEventListener('mouseenter', function() {
        if (this.classList.contains('collapsed')) {
            const tooltip = document.getElementById('navTooltip');
            if (tooltip) {
                tooltip.style.opacity = '1';
            }
        }
    });
    
    leftNav.addEventListener('mouseleave', function() {
        const tooltip = document.getElementById('navTooltip');
        if (tooltip) {
            tooltip.style.opacity = '0';
        }
    });
}

// ==================== INISIALISASI ====================
initNavigation();

console.log('Dashboard siap!');
console.log('💡 Tips: Tekan Ctrl+B untuk toggle navigasi');
