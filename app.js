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
                // Refresh map size
                setTimeout(() => {
                    map.invalidateSize();
                }, 100);
            } else if (menuType === 'rekap') {
                petaContent.style.display = 'none';
                rekapContent.style.display = 'flex';
                // Render rekap dashboard
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
    
    // Update rekapData untuk dashboard
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

// Render Rekap Dashboard
function renderRekapDashboard() {
    if (!rekapTableContainer) return;
    
    // Filter data
    let filteredData = [...rekapData];
    if (currentRekapSearch) {
        filteredData = filteredData.filter(item => 
            item.idsls.toLowerCase().includes(currentRekapSearch.toLowerCase()) ||
            item.nmsls.toLowerCase().includes(currentRekapSearch.toLowerCase()) ||
            item.nmkec.toLowerCase().includes(currentRekapSearch.toLowerCase()) ||
            item.nmdesa.toLowerCase().includes(currentRekapSearch.toLowerCase())
        );
    }
    
    // Pagination
    const totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentRekapPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = filteredData.slice(startIndex, endIndex);
    
    // Total keseluruhan
    const totalUsaha = filteredData.reduce((sum, item) => sum + item.totalUsaha, 0);
    const totalSLS = filteredData.length;
    
    // Generate HTML
    let html = `
        <div class="rekap-info">
            <strong>${totalSLS}</strong> SLS | 
            <strong>${totalUsaha}</strong> Total Usaha | 
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
                    <td style="text-align: center; font-weight: bold; color: #2980b9;">${item.totalUsaha}</td>
                </tr>
            `;
        });
    }
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    // Pagination controls
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
    // Switch ke tab peta
    const petaNav = document.querySelector('.nav-item[data-menu="peta"]');
    if (petaNav) {
        petaNav.click();
    }
    
    // Zoom ke wilayah
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

// Event listener untuk search rekap
if (searchRekap) {
    searchRekap.addEventListener('input', (e) => {
        currentRekapSearch = e.target.value;
        currentRekapPage = 1;
        renderRekapDashboard();
    });
}

// Export ke Excel
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

// Export ke PDF
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
                    h2 { color: #2c3e50; text-align: center; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 11px; }
                    th { background-color: #2c3e50; color: white; }
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

// ==================== FUNGSI YANG SUDAH ADA ====================
function tampilkanStatistik() {
    let statsDiv = document.getElementById('statsWilayah');
    if (!statsDiv) {
        const filterDiv = document.querySelector('.control-group');
        statsDiv = document.createElement('div');
        statsDiv.id = 'statsWilayah';
        statsDiv.className = 'stats-wilayah';
        filterDiv.parentNode.insertBefore(statsDiv, filterDiv.nextSibling);
        
        const filterInput = document.createElement('input');
        filterInput.id = 'filterStatIdsls';
        filterInput.placeholder = '🔍 Cari IDSLS, Desa, atau Kecamatan...';
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
            (wilayah.nmsls || "").toLowerCase().includes(filterText) ||
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
            const menggunakanInternet = wilayah.menggunakanInternet || 0;
            const tidakPakaiInternet = total - menggunakanInternet;
            const persenInternet = total > 0 ? ((menggunakanInternet / total) * 100).toFixed(1) : 0;
            
            html += `
                <div class="stat-item" onclick="zoomKeWilayah('${wilayah.idsls}')">
                    <div class="stat-header-row">
                        <div class="stat-idsls">${wilayah.idsls || '-'}</div>
                        <div class="stat-total-badge">${total} usaha</div>
                    </div>
                    <div class="stat-nmsls">${wilayah.nmsls || '-'}</div>
                    <div class="stat-location">
                        <span>📍 ${wilayah.nmkec || '-'}</span>
                        <span> | ${wilayah.nmdesa || '-'}</span>
                    </div>
                    <div class="stat-internet">
                        <div class="internet-row">
                            <span class="internet-icon">🌐</span>
                            <span class="internet-label">Menggunakan Internet:</span>
                            <span class="internet-value yes">${menggunakanInternet}</span>
                        </div>
                        <div class="internet-row">
                            <span class="internet-icon">📡</span>
                            <span class="internet-label">Tidak menggunakan:</span>
                            <span class="internet-value no">${tidakPakaiInternet}</span>
                        </div>
                        ${total > 0 ? `
                            <div class="internet-bar-container">
                                <div class="internet-bar" style="width: ${persenInternet}%"></div>
                            </div>
                            <div class="internet-percent-text">${persenInternet}% menggunakan internet</div>
                        ` : '<div class="internet-percent-text">Belum ada data usaha</div>'}
                    </div>
                    <div class="stat-kategori">
            `;
            
            const kategoriList = Object.entries(wilayah.kategori || {}).sort((a,b) => b[1] - a[1]);
            if (kategoriList.length > 0) {
                kategoriList.slice(0, 4).forEach(([kat, jml]) => {
                    let shortKat = kat.length > 25 ? kat.substring(0, 22) + '...' : kat;
                    html += `<span class="stat-badge" title="${kat}">${shortKat}: ${jml}</span>`;
                });
                if (kategoriList.length > 4) {
                    html += `<span class="stat-more">+${kategoriList.length - 4} lainnya</span>`;
                }
            } else {
                html += `<span class="stat-badge stat-empty">Belum ada data</span>`;
            }
            
            html += `</div></div>`;
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
            
            let kategoriHtml = '';
            if (Object.keys(data.kategori || {}).length > 0) {
                kategoriHtml = '<div style="margin-top:8px"><strong>📋 Kategori:</strong><br>';
                for (const [kat, jml] of Object.entries(data.kategori)) {
                    kategoriHtml += `• ${kat}: ${jml}<br>`;
                }
                kategoriHtml += '</div>';
            }
            
            layer.bindPopup(`
                <div style="min-width:280px; max-width:350px;">
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
                    ${kategoriHtml}
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
    .catch(error => console.error('Error:', error));

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

function renderDisplay(filterValue) {
    dataList.innerHTML = "";
    allMarkers.clearLayers();

    allBusinessData.forEach(data => {
        const kategori = data.kategoriUsaha || "Lainnya";
        
        if (filterValue === "Semua" || kategori === filterValue) {
            const marker = L.marker([data.latitude, data.longitude]);
            const internetStatus = data.isMenggunakanInternet === true ? '✅ Ya' : '❌ Tidak';
            marker.bindPopup(`<b>${data.namaUsaha || '-'}</b><br>Kategori: ${kategori}<br>🌐 Internet: ${internetStatus}`);
            allMarkers.addLayer(marker);

            const div = document.createElement('div');
            div.className = 'item';
            div.innerHTML = `<h4>${data.namaUsaha || '-'}</h4><p>Kategori: ${kategori}</p><p>🌐 Internet: ${internetStatus}</p>`;
            
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
}

// EVENT LISTENERS
filterKategori.addEventListener('change', (e) => renderDisplay(e.target.value));
searchInput.addEventListener('input', (e) => {
    const filter = e.target.value.toLowerCase();
    document.querySelectorAll('.item').forEach(item => {
        item.style.display = item.innerText.toLowerCase().includes(filter) ? "" : "none";
    });
});
searchIdsls.addEventListener('input', (e) => {
    if (regionLayers[e.target.value]) {
        map.fitBounds(regionLayers[e.target.value].getBounds());
        regionLayers[e.target.value].openPopup();
    }
});

// Inisialisasi navigasi
initNavigation();
