import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

const firebaseConfig = { databaseURL: "https://indigoapp-fafa0-default-rtdb.asia-southeast1.firebasedatabase.app/" };
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ==================== INISIALISASI PETA ====================
const map = L.map('map').setView([-6.2000, 106.8166], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

// ==================== MARKER CLUSTER ====================
const markerCluster = L.markerClusterGroup({
    maxClusterRadius: 40,
    disableClusteringAtZoom: 17,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    chunkedLoading: true
}).addTo(map);

// ==================== IKO MARKER ====================
const redIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const defaultIcon = new L.Icon.Default();

// ==================== VARIABEL GLOBAL ====================
let allBusinessData = [];
let currentlySelectedMarker = null;
const regionLayers = {};
let geojsonData = null;
let statistikData = {};
let geoJsonLayer = null;
let isDataLoaded = false;
let isProcessing = false;

// Variabel Rekap
let rekapByKecamatan = [];
let currentKecamatanPage = 1;
let itemsKecamatanPerPage = 10;
let currentKecamatanSearch = '';

let rekapData = [];
let currentRekapPage = 1;
let itemsPerPage = 10;
let currentRekapSearch = '';

let rekapByPengawas = [];
let currentPengawasPage = 1;
let itemsPengawasPerPage = 10;
let currentPengawasSearch = '';

let rekapByPencacah = [];
let currentPencacahPage = 1;
let itemsPencacahPerPage = 10;
let currentPencacahSearch = '';

// ==================== DOM ELEMENTS ====================
const filterKategori = document.getElementById('filterKategori');
const dataList = document.getElementById('dataList');
const searchInput = document.getElementById('searchInput');
const searchIdsls = document.getElementById('searchIdsls');
const idslsList = document.getElementById('idsls-list');
const loadingOverlay = document.getElementById('loadingOverlay');

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

// ==================== HIDE LOADING ====================
function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.classList.add('hidden');
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
        }, 500);
    }
}

// ==================== NAVIGASI ====================
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const petaContent = document.getElementById('petaContent');
    const rekapKecamatanContent = document.getElementById('rekapKecamatanContent');
    const rekapSubslsContent = document.getElementById('rekapSubslsContent');
    const rekapPengawasContent = document.getElementById('rekapPengawasContent');
    const rekapPencacahContent = document.getElementById('rekapPencacahContent');
    
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            navItems.forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');
            
            const menuType = this.getAttribute('data-menu');
            
            petaContent.style.display = 'none';
            rekapKecamatanContent.style.display = 'none';
            rekapSubslsContent.style.display = 'none';
            rekapPengawasContent.style.display = 'none';
            rekapPencacahContent.style.display = 'none';
            
            if (menuType === 'peta') {
                petaContent.style.display = 'flex';
                setTimeout(() => {
                    map.invalidateSize();
                    if (geoJsonLayer && geoJsonLayer.getBounds().isValid()) {
                        map.fitBounds(geoJsonLayer.getBounds());
                    }
                }, 100);
            } else if (menuType === 'rekap-kecamatan') {
                rekapKecamatanContent.style.display = 'flex';
                renderRekapKecamatan();
            } else if (menuType === 'rekap-subsls') {
                rekapSubslsContent.style.display = 'flex';
                renderRekapSubsls();
            } else if (menuType === 'rekap-pengawas') {
                rekapPengawasContent.style.display = 'flex';
                renderRekapPengawas();
            } else if (menuType === 'rekap-pencacah') {
                rekapPencacahContent.style.display = 'flex';
                renderRekapPencacah();
            }
        });
    });
}

// ==================== HITUNG STATISTIK WILAYAH (SEDERHANA & CEPAT) ====================
function hitungStatistikWilayah() {
    if (!geojsonData || allBusinessData.length === 0 || isProcessing) {
        hideLoading();
        return;
    }
    
    isProcessing = true;
    
    try {
        statistikData = {};
        const kecamatanMap = new Map();
        const pengawasMap = new Map();
        const pencacahMap = new Map();
        
        // INISIALISASI dari GeoJSON
        geojsonData.features.forEach(feature => {
            const idsubsls = feature.properties.idsubsls || feature.properties.idsls || "unknown";
            const nmkec = feature.properties.nmkec || "-";
            const nmdesa = feature.properties.nmdesa || "-";
            const pengawas = feature.properties.pengawas || "Tidak Ada";
            const pencacah = feature.properties.pencacah || "Tidak Ada";
            
            statistikData[idsubsls] = {
                idsubsls: idsubsls,
                nmsubsls: feature.properties.nmsls || feature.properties.nmsubsls || "Unknown",
                nmkec: nmkec,
                nmdesa: nmdesa,
                idsls: feature.properties.idsls || "-",
                total: 0,
                menggunakanInternet: 0,
                kategori: {},
                usahaGeoJSON: parseInt(feature.properties.usaha) || 0,
                muatanGeoJSON: parseInt(feature.properties.muatan) || 0,
                pengawas: pengawas,
                pencacah: pencacah
            };
            
            // Inisialisasi Kecamatan
            if (!kecamatanMap.has(nmkec)) {
                kecamatanMap.set(nmkec, {
                    nmkec: nmkec,
                    totalUsaha: 0,
                    totalUsahaGeoJSON: parseInt(feature.properties.usaha) || 0,
                    totalMuatanGeoJSON: parseInt(feature.properties.muatan) || 0,
                    jumlahSUB: 1,
                    desa: new Set([nmdesa])
                });
            } else {
                const kec = kecamatanMap.get(nmkec);
                kec.totalUsahaGeoJSON += parseInt(feature.properties.usaha) || 0;
                kec.totalMuatanGeoJSON += parseInt(feature.properties.muatan) || 0;
                kec.jumlahSUB++;
                kec.desa.add(nmdesa);
            }
            
            // Inisialisasi Pengawas
            if (!pengawasMap.has(pengawas)) {
                pengawasMap.set(pengawas, {
                    namaPengawas: pengawas,
                    totalUsaha: 0,
                    totalUsahaGeoJSON: parseInt(feature.properties.usaha) || 0,
                    totalMuatanGeoJSON: parseInt(feature.properties.muatan) || 0,
                    jumlahSUB: 1,
                    kecamatan: new Set([nmkec]),
                    desa: new Set([nmdesa])
                });
            } else {
                const peng = pengawasMap.get(pengawas);
                peng.totalUsahaGeoJSON += parseInt(feature.properties.usaha) || 0;
                peng.totalMuatanGeoJSON += parseInt(feature.properties.muatan) || 0;
                peng.jumlahSUB++;
                peng.kecamatan.add(nmkec);
                peng.desa.add(nmdesa);
            }
            
            // Inisialisasi Pencacah
            if (!pencacahMap.has(pencacah)) {
                pencacahMap.set(pencacah, {
                    namaPencacah: pencacah,
                    totalUsaha: 0,
                    totalUsahaGeoJSON: parseInt(feature.properties.usaha) || 0,
                    totalMuatanGeoJSON: parseInt(feature.properties.muatan) || 0,
                    jumlahSUB: 1,
                    kecamatan: new Set([nmkec]),
                    desa: new Set([nmdesa])
                });
            } else {
                const penc = pencacahMap.get(pencacah);
                penc.totalUsahaGeoJSON += parseInt(feature.properties.usaha) || 0;
                penc.totalMuatanGeoJSON += parseInt(feature.properties.muatan) || 0;
                penc.jumlahSUB++;
                penc.kecamatan.add(nmkec);
                penc.desa.add(nmdesa);
            }
        });
        
        // PROSES DATA USAHA - Optimasi dengan bounding box sederhana
        const features = geojsonData.features;
        
        allBusinessData.forEach(usaha => {
            const kategori = usaha.kategoriUsaha || "Lainnya";
            const menggunakanInternet = usaha.isMenggunakanInternet === true || 
                                       usaha.isMenggunakanInternet === "true" || 
                                       usaha.isMenggunakanInternet === 1;
            
            const lon = parseFloat(usaha.longitude);
            const lat = parseFloat(usaha.latitude);
            const point = turf.point([lon, lat]);
            
            // Cari polygon yang mengandung titik
            for (const feature of features) {
                const idsubsls = feature.properties.idsubsls || feature.properties.idsls || "unknown";
                
                // Quick bounding box check
                const bbox = turf.bbox(feature);
                if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) {
                    continue;
                }
                
                if (turf.booleanPointInPolygon(point, feature)) {
                    const data = statistikData[idsubsls];
                    if (data) {
                        data.total++;
                        if (menggunakanInternet) data.menggunakanInternet++;
                        if (!data.kategori[kategori]) data.kategori[kategori] = 0;
                        data.kategori[kategori]++;
                        
                        // Update Kecamatan
                        const nmkec = feature.properties.nmkec || "-";
                        if (kecamatanMap.has(nmkec)) {
                            kecamatanMap.get(nmkec).totalUsaha++;
                        }
                        
                        // Update Pengawas
                        const pengawas = feature.properties.pengawas || "Tidak Ada";
                        if (pengawasMap.has(pengawas)) {
                            pengawasMap.get(pengawas).totalUsaha++;
                        }
                        
                        // Update Pencacah
                        const pencacah = feature.properties.pencacah || "Tidak Ada";
                        if (pencacahMap.has(pencacah)) {
                            pencacahMap.get(pencacah).totalUsaha++;
                        }
                    }
                    break;
                }
            }
        });
        
        // KONVERSI KE ARRAY
        rekapByKecamatan = Array.from(kecamatanMap.values())
            .map(kec => ({ ...kec, desa: Array.from(kec.desa) }))
            .sort((a, b) => a.nmkec.localeCompare(b.nmkec));
        
        rekapByPengawas = Array.from(pengawasMap.values())
            .map(peng => ({ 
                ...peng, 
                kecamatan: Array.from(peng.kecamatan),
                desa: Array.from(peng.desa)
            }))
            .sort((a, b) => a.namaPengawas.localeCompare(b.namaPengawas));
        
        rekapByPencacah = Array.from(pencacahMap.values())
            .map(penc => ({ 
                ...penc, 
                kecamatan: Array.from(penc.kecamatan),
                desa: Array.from(penc.desa)
            }))
            .sort((a, b) => a.namaPencacah.localeCompare(b.namaPencacah));
        
        updateRekapData();
        tampilkanStatistik();
        updatePopupWilayah();
        
    } catch (error) {
        console.error('Error hitung statistik:', error);
    }
    
    isProcessing = false;
    hideLoading();
}

// ==================== UPDATE REKAP DATA ====================
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
            muatanGeoJSON: wilayah.muatanGeoJSON || 0,
            pengawas: wilayah.pengawas,
            pencacah: wilayah.pencacah
        }))
        .sort((a, b) => a.idsubsls.localeCompare(b.idsubsls));
}

// ==================== UPDATE RIGHT NAV SUB SLS ====================
function updateRightNavigationSubsls(filteredData) {
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
    
    // Hitung Top Kategori
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
    
    // Hitung Top 5 SUB SLS
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
    
    const statRingkasDiv = document.getElementById('statRingkasSubsls');
    const topKategoriDiv = document.getElementById('topKategoriSubsls');
    const topSLSDiv = document.getElementById('topSLSSubsls');
    
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

// ==================== RENDER REKAP KECAMATAN ====================
function renderRekapKecamatan() {
    const container = document.getElementById('rekapKecamatanContainer');
    if (!container) return;
    
    let filteredData = [...rekapByKecamatan];
    if (currentKecamatanSearch) {
        filteredData = filteredData.filter(item => 
            item.nmkec.toLowerCase().includes(currentKecamatanSearch.toLowerCase())
        );
    }
    
    const totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / itemsKecamatanPerPage);
    const startIndex = (currentKecamatanPage - 1) * itemsKecamatanPerPage;
    const endIndex = startIndex + itemsKecamatanPerPage;
    const pageData = filteredData.slice(startIndex, endIndex);
    
    const totalUsaha = filteredData.reduce((sum, item) => sum + item.totalUsaha, 0);
    const totalKec = filteredData.length;
    const avgUsaha = totalKec > 0 ? (totalUsaha / totalKec).toFixed(1) : 0;
    const totalUsahaGeoJSON = filteredData.reduce((sum, item) => sum + (item.totalUsahaGeoJSON || 0), 0);
    const totalMuatanGeoJSON = filteredData.reduce((sum, item) => sum + (item.totalMuatanGeoJSON || 0), 0);
    
    document.getElementById('totalKecamatan').textContent = totalKec;
    document.getElementById('totalUsahaKecamatan').textContent = totalUsaha;
    document.getElementById('avgUsahaKecamatan').textContent = avgUsaha;
    
    let html = `
        <div class="rekap-info">
            <strong>${totalKec}</strong> Kecamatan | 
            <strong>${totalUsaha}</strong> Total Usaha (Real) | 
            <strong>${totalUsahaGeoJSON}</strong> Perkiraan Usaha | 
            <strong>${totalMuatanGeoJSON}</strong> Muatan |
            Halaman <strong>${currentKecamatanPage}</strong> dari <strong>${totalPages || 1}</strong>
        </div>
        <div class="rekap-table-wrapper">
            <table class="rekap-table">
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
    
    if (pageData.length === 0) {
        html += `
            <tr>
                <td colspan="7" class="rekap-no-data">
                    <i class="fas fa-database"></i> Tidak ada data kecamatan ditemukan
                </td>
            </tr>
        `;
    } else {
        pageData.forEach((item, index) => {
            const isDifferent = item.totalUsaha !== item.totalUsahaGeoJSON;
            const diffClass = isDifferent ? 'style="background-color: #fff3cd;"' : '';
            
            html += `
                <tr ${diffClass}>
                    <td>${startIndex + index + 1}</td>
                    <td><strong>${item.nmkec}</strong></td>
                    <td style="text-align:center;">${item.jumlahSUB}</td>
                    <td style="text-align:center; font-weight: bold; color: #28a745;">${item.totalUsaha}</td>
                    <td style="text-align:center; color: #28a745; font-weight: bold;">
                        ${item.totalUsahaGeoJSON || 0}
                    </td>
                    <td style="text-align:center; color: #dc3545; font-weight: bold;">
                        ${item.totalMuatanGeoJSON || 0}
                    </td>
                    <td style="font-size: 10px; color: #666;">${item.desa.join(', ')}</td>
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
            html += `<button class="${i === currentKecamatanPage ? 'active' : ''}" onclick="goToKecamatanPage(${i})">${i}</button>`;
        }
        if (totalPages > 10) {
            html += `<span style="padding: 6px;">...</span>`;
            html += `<button onclick="goToKecamatanPage(${totalPages})">${totalPages}</button>`;
        }
        html += `</div>`;
    }
    
    container.innerHTML = html;
}

// ==================== RENDER REKAP SUB SLS ====================
function renderRekapSubsls() {
    const container = document.getElementById('rekapSubslsContainer');
    if (!container) return;
    
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
    
    updateRightNavigationSubsls(filteredData);
    
    const totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentRekapPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = filteredData.slice(startIndex, endIndex);
    
    const totalUsaha = filteredData.reduce((sum, item) => sum + item.totalUsaha, 0);
    const totalSLS = filteredData.length;
    const avgUsaha = totalSLS > 0 ? (totalUsaha / totalSLS).toFixed(1) : 0;
    const totalUsahaGeoJSON = filteredData.reduce((sum, item) => sum + (item.usahaGeoJSON || 0), 0);
    const totalMuatanGeoJSON = filteredData.reduce((sum, item) => sum + (item.muatanGeoJSON || 0), 0);
    
    document.getElementById('totalSubsls').textContent = totalSLS;
    document.getElementById('totalUsahaSubsls').textContent = totalUsaha;
    document.getElementById('avgUsahaSubsls').textContent = avgUsaha;
    
    let html = `
        <div class="rekap-info">
            <strong>${totalSLS}</strong> SUB SLS | 
            <strong>${totalUsaha}</strong> Total Usaha (Real) | 
            <strong>${totalUsahaGeoJSON}</strong> Perkiraan Usaha | 
            <strong>${totalMuatanGeoJSON}</strong> Muatan |
            Halaman <strong>${currentRekapPage}</strong> dari <strong>${totalPages || 1}</strong>
        </div>
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
    `;
    
    if (totalPages > 1) {
        html += `<div class="rekap-pagination">`;
        for (let i = 1; i <= Math.min(totalPages, 10); i++) {
            html += `<button class="${i === currentRekapPage ? 'active' : ''}" onclick="goToSubslsPage(${i})">${i}</button>`;
        }
        if (totalPages > 10) {
            html += `<span style="padding: 6px;">...</span>`;
            html += `<button onclick="goToSubslsPage(${totalPages})">${totalPages}</button>`;
        }
        html += `</div>`;
    }
    
    container.innerHTML = html;
}

// ==================== RENDER REKAP PENGAWAS ====================
function renderRekapPengawas() {
    const container = document.getElementById('rekapPengawasContainer');
    if (!container) return;
    
    let filteredData = [...rekapByPengawas];
    if (currentPengawasSearch) {
        filteredData = filteredData.filter(item => 
            item.namaPengawas.toLowerCase().includes(currentPengawasSearch.toLowerCase())
        );
    }
    
    const totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / itemsPengawasPerPage);
    const startIndex = (currentPengawasPage - 1) * itemsPengawasPerPage;
    const endIndex = startIndex + itemsPengawasPerPage;
    const pageData = filteredData.slice(startIndex, endIndex);
    
    const totalUsaha = filteredData.reduce((sum, item) => sum + item.totalUsaha, 0);
    const totalPeng = filteredData.length;
    const avgUsaha = totalPeng > 0 ? (totalUsaha / totalPeng).toFixed(1) : 0;
    const totalUsahaGeoJSON = filteredData.reduce((sum, item) => sum + (item.totalUsahaGeoJSON || 0), 0);
    const totalMuatanGeoJSON = filteredData.reduce((sum, item) => sum + (item.totalMuatanGeoJSON || 0), 0);
    
    document.getElementById('totalPengawas').textContent = totalPeng;
    document.getElementById('totalUsahaPengawas').textContent = totalUsaha;
    document.getElementById('avgUsahaPengawas').textContent = avgUsaha;
    
    let html = `
        <div class="rekap-info">
            <strong>${totalPeng}</strong> Pengawas | 
            <strong>${totalUsaha}</strong> Total Usaha (Real) | 
            <strong>${totalUsahaGeoJSON}</strong> Perkiraan Usaha | 
            <strong>${totalMuatanGeoJSON}</strong> Muatan |
            Halaman <strong>${currentPengawasPage}</strong> dari <strong>${totalPages || 1}</strong>
        </div>
        <div class="rekap-table-wrapper">
            <table class="rekap-table">
                <thead>
                    <tr>
                        <th>No</th>
                        <th>Nama Pengawas</th>
                        <th>Jumlah SUB SLS</th>
                        <th>Total Usaha (Real)</th>
                        <th>Perkiraan Usaha</th>
                        <th>Muatan</th>
                        <th>Kecamatan</th>
                        <th>Desa</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    if (pageData.length === 0) {
        html += `
            <tr>
                <td colspan="8" class="rekap-no-data">
                    <i class="fas fa-database"></i> Tidak ada data pengawas ditemukan
                </td>
            </tr>
        `;
    } else {
        pageData.forEach((item, index) => {
            const isDifferent = item.totalUsaha !== item.totalUsahaGeoJSON;
            const diffClass = isDifferent ? 'style="background-color: #fff3cd;"' : '';
            
            html += `
                <tr ${diffClass}>
                    <td>${startIndex + index + 1}</td>
                    <td><strong>${item.namaPengawas}</strong></td>
                    <td style="text-align:center;">${item.jumlahSUB}</td>
                    <td style="text-align:center; font-weight: bold; color: #e67e22;">${item.totalUsaha}</td>
                    <td style="text-align:center; color: #e67e22;">${item.totalUsahaGeoJSON || 0}</td>
                    <td style="text-align:center; color: #dc3545;">${item.totalMuatanGeoJSON || 0}</td>
                    <td style="font-size: 10px; color: #666;">${item.kecamatan.join(', ')}</td>
                    <td style="font-size: 10px; color: #666;">${item.desa.join(', ')}</td>
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
            html += `<button class="${i === currentPengawasPage ? 'active' : ''}" onclick="goToPengawasPage(${i})">${i}</button>`;
        }
        if (totalPages > 10) {
            html += `<span style="padding: 6px;">...</span>`;
            html += `<button onclick="goToPengawasPage(${totalPages})">${totalPages}</button>`;
        }
        html += `</div>`;
    }
    
    container.innerHTML = html;
}

// ==================== RENDER REKAP PENCACAH ====================
function renderRekapPencacah() {
    const container = document.getElementById('rekapPencacahContainer');
    if (!container) return;
    
    let filteredData = [...rekapByPencacah];
    if (currentPencacahSearch) {
        filteredData = filteredData.filter(item => 
            item.namaPencacah.toLowerCase().includes(currentPencacahSearch.toLowerCase())
        );
    }
    
    const totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / itemsPencacahPerPage);
    const startIndex = (currentPencacahPage - 1) * itemsPencacahPerPage;
    const endIndex = startIndex + itemsPencacahPerPage;
    const pageData = filteredData.slice(startIndex, endIndex);
    
    const totalUsaha = filteredData.reduce((sum, item) => sum + item.totalUsaha, 0);
    const totalPenc = filteredData.length;
    const avgUsaha = totalPenc > 0 ? (totalUsaha / totalPenc).toFixed(1) : 0;
    const totalUsahaGeoJSON = filteredData.reduce((sum, item) => sum + (item.totalUsahaGeoJSON || 0), 0);
    const totalMuatanGeoJSON = filteredData.reduce((sum, item) => sum + (item.totalMuatanGeoJSON || 0), 0);
    
    document.getElementById('totalPencacah').textContent = totalPenc;
    document.getElementById('totalUsahaPencacah').textContent = totalUsaha;
    document.getElementById('avgUsahaPencacah').textContent = avgUsaha;
    
    let html = `
        <div class="rekap-info">
            <strong>${totalPenc}</strong> Pencacah | 
            <strong>${totalUsaha}</strong> Total Usaha (Real) | 
            <strong>${totalUsahaGeoJSON}</strong> Perkiraan Usaha | 
            <strong>${totalMuatanGeoJSON}</strong> Muatan |
            Halaman <strong>${currentPencacahPage}</strong> dari <strong>${totalPages || 1}</strong>
        </div>
        <div class="rekap-table-wrapper">
            <table class="rekap-table">
                <thead>
                    <tr>
                        <th>No</th>
                        <th>Nama Pencacah</th>
                        <th>Jumlah SUB SLS</th>
                        <th>Total Usaha (Real)</th>
                        <th>Perkiraan Usaha</th>
                        <th>Muatan</th>
                        <th>Kecamatan</th>
                        <th>Desa</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    if (pageData.length === 0) {
        html += `
            <tr>
                <td colspan="8" class="rekap-no-data">
                    <i class="fas fa-database"></i> Tidak ada data pencacah ditemukan
                </td>
            </tr>
        `;
    } else {
        pageData.forEach((item, index) => {
            const isDifferent = item.totalUsaha !== item.totalUsahaGeoJSON;
            const diffClass = isDifferent ? 'style="background-color: #fff3cd;"' : '';
            
            html += `
                <tr ${diffClass}>
                    <td>${startIndex + index + 1}</td>
                    <td><strong>${item.namaPencacah}</strong></td>
                    <td style="text-align:center;">${item.jumlahSUB}</td>
                    <td style="text-align:center; font-weight: bold; color: #8e44ad;">${item.totalUsaha}</td>
                    <td style="text-align:center; color: #8e44ad;">${item.totalUsahaGeoJSON || 0}</td>
                    <td style="text-align:center; color: #dc3545;">${item.totalMuatanGeoJSON || 0}</td>
                    <td style="font-size: 10px; color: #666;">${item.kecamatan.join(', ')}</td>
                    <td style="font-size: 10px; color: #666;">${item.desa.join(', ')}</td>
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
            html += `<button class="${i === currentPencacahPage ? 'active' : ''}" onclick="goToPencacahPage(${i})">${i}</button>`;
        }
        if (totalPages > 10) {
            html += `<span style="padding: 6px;">...</span>`;
            html += `<button onclick="goToPencacahPage(${totalPages})">${totalPages}</button>`;
        }
        html += `</div>`;
    }
    
    container.innerHTML = html;
}

// ==================== NAVIGASI HALAMAN ====================
window.goToKecamatanPage = function(page) {
    currentKecamatanPage = page;
    renderRekapKecamatan();
};

window.goToSubslsPage = function(page) {
    currentRekapPage = page;
    renderRekapSubsls();
};

window.goToPengawasPage = function(page) {
    currentPengawasPage = page;
    renderRekapPengawas();
};

window.goToPencacahPage = function(page) {
    currentPencacahPage = page;
    renderRekapPencacah();
};

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

// ==================== RENDER DISPLAY PETA ====================
function renderDisplay(filterValue) {
    dataList.innerHTML = "";
    markerCluster.clearLayers();

    const filteredData = filterValue === "Semua" 
        ? allBusinessData 
        : allBusinessData.filter(data => (data.kategoriUsaha || "Lainnya") === filterValue);

    const markers = [];
    const items = [];

    filteredData.forEach(data => {
        const displayName = getDisplayName(data);
        const kategori = data.kategoriUsaha || "Lainnya";
        const internetStatus = data.isMenggunakanInternet === true ? '✅ Ya' : '❌ Tidak';
        
        const marker = L.marker([data.latitude, data.longitude]);
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
        
        markers.push(marker);
        
        const div = document.createElement('div');
        div.className = 'item';
        div.innerHTML = `
            <h4>${displayName}</h4>
            <p>Kategori: ${kategori}</p>
            <p>🌐 Internet: ${internetStatus}</p>
        `;
        div.onclick = () => {
            if (currentlySelectedMarker) currentlySelectedMarker.setIcon(defaultIcon);
            marker.setIcon(redIcon);
            currentlySelectedMarker = marker;
            map.flyTo([data.latitude, data.longitude], 17);
            marker.openPopup();
        };
        items.push(div);
    });

    // Tambahkan marker sekaligus
    if (markers.length > 0) {
        markerCluster.addLayers(markers);
    }
    
    // Tambahkan item sekaligus
    const fragment = document.createDocumentFragment();
    items.forEach(item => fragment.appendChild(item));
    dataList.appendChild(fragment);
    
    const totalCount = document.getElementById('totalUsahaCount');
    const totalCount2 = document.getElementById('totalUsahaCount2');
    if (totalCount) totalCount.textContent = allBusinessData.length;
    if (totalCount2) totalCount2.textContent = allBusinessData.length;
}

// ==================== STATISTIK WILAYAH ====================
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

// ==================== UPDATE POPUP WILAYAH ====================
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
                const usahaDiWilayah = [];
                for (const usaha of allBusinessData) {
                    const point = turf.point([parseFloat(usaha.longitude), parseFloat(usaha.latitude)]);
                    if (turf.booleanPointInPolygon(point, layer.feature)) {
                        usahaDiWilayah.push(usaha);
                        if (usahaDiWilayah.length >= 5) break;
                    }
                }
                
                if (usahaDiWilayah.length > 0) {
                    daftarUsahaHtml = '<div style="margin-top:8px"><strong>📋 Daftar Usaha:</strong><br>';
                    usahaDiWilayah.forEach(usaha => {
                        daftarUsahaHtml += `• ${getDisplayName(usaha)}<br>`;
                    });
                    if (total > 5) {
                        daftarUsahaHtml += `<small>dan ${total - 5} usaha lainnya...</small>`;
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

// ==================== TOGGLE STATS ====================
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

// ==================== INIT RESIZABLE STATS ====================
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

// ==================== EVENT LISTENERS ====================
// Search Kecamatan
document.getElementById('searchKecamatan')?.addEventListener('input', (e) => {
    currentKecamatanSearch = e.target.value;
    currentKecamatanPage = 1;
    renderRekapKecamatan();
});

// Search Subsls
document.getElementById('searchSubsls')?.addEventListener('input', (e) => {
    currentRekapSearch = e.target.value;
    currentRekapPage = 1;
    renderRekapSubsls();
});

// Search Pengawas
document.getElementById('searchPengawas')?.addEventListener('input', (e) => {
    currentPengawasSearch = e.target.value;
    currentPengawasPage = 1;
    renderRekapPengawas();
});

// Search Pencacah
document.getElementById('searchPencacah')?.addEventListener('input', (e) => {
    currentPencacahSearch = e.target.value;
    currentPencacahPage = 1;
    renderRekapPencacah();
});

// Filter Kategori
filterKategori.addEventListener('change', (e) => renderDisplay(e.target.value));

// Search Usaha
searchInput.addEventListener('input', (e) => {
    const filter = e.target.value.toLowerCase();
    document.querySelectorAll('.item').forEach(item => {
        const itemText = item.innerText.toLowerCase();
        item.style.display = itemText.includes(filter) ? "" : "none";
    });
});

// Search IDSLS
searchIdsls.addEventListener('input', (e) => {
    const value = e.target.value;
    if (regionLayers[value]) {
        map.fitBounds(regionLayers[value].getBounds());
        regionLayers[value].openPopup();
    }
});

// ==================== EXPORT FUNCTIONS ====================
function exportCSV(data, filename) {
    if (!data || data.length === 0) {
        alert('Tidak ada data untuk diexport!');
        return;
    }
    
    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(header => `"${row[header]}"`).join(','))
    ].join('\n');
    
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    alert('Export Excel berhasil!');
}

function exportPDF(type, data, search, keyField) {
    let filteredData = [...data];
    if (search) {
        filteredData = filteredData.filter(item => 
            String(item[keyField] || '').toLowerCase().includes(search.toLowerCase())
        );
    }
    
    if (!filteredData || filteredData.length === 0) {
        alert('Tidak ada data untuk diexport!');
        return;
    }
    
    let htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Rekap Total Usaha per ${type}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h2 { color: #1a1a2e; text-align: center; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 10px; }
                th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
                th { background-color: #667eea; color: white; }
                .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #666; }
                .highlight { background-color: #fff3cd; }
            </style>
        </head>
        <body>
            <h2>Rekap Total Usaha per ${type}</h2>
            <p>Tanggal: ${new Date().toLocaleString('id-ID')}</p>
            <p>Total Data: ${filteredData.length}</p>
            <table>
                <thead>
                    <tr>
    `;
    
    const headers = Object.keys(filteredData[0]);
    headers.forEach(h => {
        htmlContent += `<th>${h}</th>`;
    });
    htmlContent += `</tr></thead><tbody>`;
    
    filteredData.forEach((item) => {
        htmlContent += `<tr>`;
        headers.forEach(h => {
            const val = item[h] !== undefined && item[h] !== null ? item[h] : '-';
            htmlContent += `<td>${typeof val === 'object' ? JSON.stringify(val) : val}</td>`;
        });
        htmlContent += `</tr>`;
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
}

// Export Excel Kecamatan
document.getElementById('exportExcelKecamatan')?.addEventListener('click', () => {
    let dataToExport = [...rekapByKecamatan];
    if (currentKecamatanSearch) {
        dataToExport = dataToExport.filter(item => 
            item.nmkec.toLowerCase().includes(currentKecamatanSearch.toLowerCase())
        );
    }
    
    const excelData = dataToExport.map((item, index) => ({
        'No': index + 1,
        'Kecamatan': item.nmkec,
        'Jumlah SUB SLS': item.jumlahSUB,
        'Total Usaha (Real)': item.totalUsaha,
        'Perkiraan Usaha': item.totalUsahaGeoJSON || 0,
        'Muatan': item.totalMuatanGeoJSON || 0,
        'Desa': item.desa.join(', ')
    }));
    
    exportCSV(excelData, `rekap_usaha_per_kecamatan_${new Date().toISOString().split('T')[0]}.csv`);
});

// Export Excel Subsls
document.getElementById('exportExcelSubsls')?.addEventListener('click', () => {
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
    
    exportCSV(excelData, `rekap_usaha_per_subsls_${new Date().toISOString().split('T')[0]}.csv`);
});

// Export Excel Pengawas
document.getElementById('exportExcelPengawas')?.addEventListener('click', () => {
    let dataToExport = [...rekapByPengawas];
    if (currentPengawasSearch) {
        dataToExport = dataToExport.filter(item => 
            item.namaPengawas.toLowerCase().includes(currentPengawasSearch.toLowerCase())
        );
    }
    
    const excelData = dataToExport.map((item, index) => ({
        'No': index + 1,
        'Nama Pengawas': item.namaPengawas,
        'Jumlah SUB SLS': item.jumlahSUB,
        'Total Usaha (Real)': item.totalUsaha,
        'Perkiraan Usaha': item.totalUsahaGeoJSON || 0,
        'Muatan': item.totalMuatanGeoJSON || 0,
        'Kecamatan': item.kecamatan.join(', '),
        'Desa': item.desa.join(', ')
    }));
    
    exportCSV(excelData, `rekap_usaha_per_pengawas_${new Date().toISOString().split('T')[0]}.csv`);
});

// Export Excel Pencacah
document.getElementById('exportExcelPencacah')?.addEventListener('click', () => {
    let dataToExport = [...rekapByPencacah];
    if (currentPencacahSearch) {
        dataToExport = dataToExport.filter(item => 
            item.namaPencacah.toLowerCase().includes(currentPencacahSearch.toLowerCase())
        );
    }
    
    const excelData = dataToExport.map((item, index) => ({
        'No': index + 1,
        'Nama Pencacah': item.namaPencacah,
        'Jumlah SUB SLS': item.jumlahSUB,
        'Total Usaha (Real)': item.totalUsaha,
        'Perkiraan Usaha': item.totalUsahaGeoJSON || 0,
        'Muatan': item.totalMuatanGeoJSON || 0,
        'Kecamatan': item.kecamatan.join(', '),
        'Desa': item.desa.join(', ')
    }));
    
    exportCSV(excelData, `rekap_usaha_per_pencacah_${new Date().toISOString().split('T')[0]}.csv`);
});

// Export PDF
document.getElementById('exportPDFKecamatan')?.addEventListener('click', () => {
    exportPDF('Kecamatan', rekapByKecamatan, currentKecamatanSearch, 'nmkec');
});

document.getElementById('exportPDFSubsls')?.addEventListener('click', () => {
    exportPDF('SUB SLS', rekapData, currentRekapSearch, 'idsubsls');
});

document.getElementById('exportPDFPengawas')?.addEventListener('click', () => {
    exportPDF('Pengawas', rekapByPengawas, currentPengawasSearch, 'namaPengawas');
});

document.getElementById('exportPDFPencacah')?.addEventListener('click', () => {
    exportPDF('Pencacah', rekapByPencacah, currentPencacahSearch, 'namaPencacah');
});

// ==================== TOGGLE NAV ====================
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

// Keyboard shortcut
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        toggleNav();
    }
});

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
            console.log('✅ GeoJSON loaded');
        }

        Object.keys(regionLayers).sort().forEach(id => {
            const option = document.createElement('option');
            option.value = id;
            idslsList.appendChild(option);
        });
        
        if (allBusinessData.length > 0) {
            hitungStatistikWilayah();
        } else {
            hideLoading();
        }
    })
    .catch(error => {
        console.error('❌ Error loading GeoJSON:', error);
        hideLoading();
    });

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

    console.log(`✅ Loaded ${allBusinessData.length} businesses from Firebase`);

    updateFilterOptions(kategoriSet);
    renderDisplay("Semua");
    
    if (geojsonData) {
        hitungStatistikWilayah();
    } else {
        hideLoading();
    }
}, (error) => {
    console.error('❌ Error loading Firebase:', error);
    hideLoading();
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

// ==================== INIT ====================
initNavigation();

console.log('🚀 Dashboard siap!');
console.log('💡 Tips: Tekan Ctrl+B untuk toggle navigasi');
console.log('📊 Menu Rekap: Kecamatan, SUB SLS, Pengawas, Pencacah');
