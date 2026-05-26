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

// DOM Elements
const filterKategori = document.getElementById('filterKategori');
const dataList = document.getElementById('dataList');
const searchInput = document.getElementById('searchInput');
const searchIdsls = document.getElementById('searchIdsls');
const idslsList = document.getElementById('idsls-list');

// --- FUNGSI MENGHITUNG TAGGING PER WILAYAH ---
function hitungStatistikWilayah() {
    if (!geojsonData || allBusinessData.length === 0) return;
    
    statistikData = {};
    
    // Inisialisasi statistik untuk setiap wilayah
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
    
    // Hitung setiap titik usaha berada di wilayah mana
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
    
    tampilkanStatistik();
    updatePopupWilayah();
}

function tampilkanStatistik() {
    // Cari atau buat container statistik
    let statsDiv = document.getElementById('statsWilayah');
    if (!statsDiv) {
        const filterDiv = document.querySelector('.control-group');
        statsDiv = document.createElement('div');
        statsDiv.id = 'statsWilayah';
        statsDiv.className = 'stats-wilayah';
        filterDiv.parentNode.insertBefore(statsDiv, filterDiv.nextSibling);
        
        // Tambahkan input filter
        const filterInput = document.createElement('input');
        filterInput.id = 'filterStatIdsls';
        filterInput.placeholder = '🔍 Cari IDSLS, Desa, atau Kecamatan...';
        filterInput.className = 'stats-filter-input';
        filterInput.addEventListener('input', () => tampilkanStatistik());
        statsDiv.parentNode.insertBefore(filterInput, statsDiv);
        
        // Buat header dan content
        statsDiv.innerHTML = `
            <div class="stats-header" onclick="toggleStats()">
                <span>📊 STATISTIK PER WILAYAH</span>
                <span id="statsToggleIcon">▼</span>
            </div>
            <div id="statsContent" class="stats-content"></div>
        `;
        
        // Tambahkan handle resize setelah statsDiv
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
    
    // Update header
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

// Fungsi resize
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
