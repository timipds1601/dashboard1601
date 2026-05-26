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
    
    console.log("Menghitung statistik untuk", allBusinessData.length, "usaha");
    
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
        // Perhatikan: field adalah isMenggunakanInternet (dengan huruf besar I)
        const menggunakanInternet = usaha.isMenggunakanInternet === true || 
                                     usaha.isMenggunakanInternet === "true" || 
                                     usaha.isMenggunakanInternet === 1;
        
        console.log("Usaha:", usaha.namaUsaha, "Internet:", menggunakanInternet);
        
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
    
    console.log("Statistik selesai dihitung");
    
    // Tampilkan statistik
    tampilkanStatistik();
    
    // Update popup wilayah
    updatePopupWilayah();
}

function tampilkanStatistik() {
    // Cari atau buat container statistik
    let statsContainer = document.getElementById('statsWilayahContainer');
    
    if (!statsContainer) {
        // Buat container untuk statistik
        statsContainer = document.createElement('div');
        statsContainer.id = 'statsWilayahContainer';
        statsContainer.className = 'stats-wilayah-container';
        
        // Sisipkan setelah filterKategori
        const filterDiv = document.querySelector('.control-group');
        filterDiv.parentNode.insertBefore(statsContainer, filterDiv.nextSibling);
        
        // Tambahkan input filter IDSLS
        const filterInput = document.createElement('input');
        filterInput.id = 'filterStatIdsls';
        filterInput.placeholder = '🔍 Cari IDSLS, Desa, atau Kecamatan...';
        filterInput.className = 'stats-filter-input';
        filterInput.addEventListener('input', () => {
            tampilkanStatistik();
        });
        statsContainer.appendChild(filterInput);
        
        // Buat wrapper untuk resize
        const resizeWrapper = document.createElement('div');
        resizeWrapper.className = 'stats-resizable-wrapper';
        statsContainer.appendChild(resizeWrapper);
        
        // Buat handle resize
        const handle = document.createElement('div');
        handle.className = 'stats-resize-handle';
        const indicator = document.createElement('div');
        indicator.className = 'resize-indicator';
        handle.appendChild(indicator);
        resizeWrapper.appendChild(handle);
        
        // Buat stats div
        const statsDiv = document.createElement('div');
        statsDiv.id = 'statsWilayah';
        statsDiv.className = 'stats-wilayah';
        resizeWrapper.appendChild(statsDiv);
        
        // Inisialisasi resize
        initResizableStats();
    }
    
    const statsDiv = document.getElementById('statsWilayah');
    if (!statsDiv) return;
    
    // Ambil nilai filter
    const filterText = document.getElementById('filterStatIdsls')?.value.toLowerCase() || '';
    
    let html = `
        <div class="stats-header" onclick="toggleStats()">
            <span>📊 STATISTIK PER WILAYAH (${Object.keys(statistikData).length} Wilayah)</span>
            <span id="statsToggleIcon">▼</span>
        </div>
        <div id="statsContent" class="stats-content">
    `;
    
    // Filter data
    let filteredData = Object.values(statistikData);
    if (filterText) {
        filteredData = filteredData.filter(wilayah => 
            (wilayah.idsls || "").toLowerCase().includes(filterText) ||
            (wilayah.nmsls || "").toLowerCase().includes(filterText) ||
            (wilayah.nmkec || "").toLowerCase().includes(filterText) ||
            (wilayah.nmdesa || "").toLowerCase().includes(filterText)
        );
        html += `<div class="stats-filter-info">Menampilkan ${filteredData.length} dari ${Object.keys(statistikData).length} wilayah</div>`;
    }
    
    // Urutkan berdasarkan IDSLS
    filteredData.sort((a, b) => (a.idsls || "").localeCompare(b.idsls || ""));
    
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
            `;
            
            // Tampilkan info internet (SELALU ditampilkan)
            html += `
                    <div class="stat-internet">
                        <div class="internet-row">
                            <span class="internet-icon">🌐</span>
                            <span class="internet-label">Menggunakan Internet:</span>
                            <span class="internet-value yes">${menggunakanInternet} usaha</span>
                        </div>
                        <div class="internet-row">
                            <span class="internet-icon">📡</span>
                            <span class="internet-label">Tidak menggunakan:</span>
                            <span class="internet-value no">${tidakPakaiInternet} usaha</span>
                        </div>
            `;
            
            if (total > 0) {
                html += `
                        <div class="internet-bar-container">
                            <div class="internet-bar" style="width: ${persenInternet}%"></div>
                        </div>
                        <div class="internet-percent-text">${persenInternet}% menggunakan internet</div>
                `;
            } else {
                html += `<div class="internet-percent-text">Belum ada data usaha</div>`;
            }
            
            html += `
                    </div>
                    <div class="stat-kategori">
            `;
            
            // Tampilkan kategori
            const kategoriList = Object.entries(wilayah.kategori || {}).sort((a,b) => b[1] - a[1]);
            if (kategoriList.length > 0) {
                kategoriList.slice(0, 4).forEach(([kat, jml]) => {
                    let shortKat = kat.length > 30 ? kat.substring(0, 27) + '...' : kat;
                    html += `<span class="stat-badge" title="${kat}">${shortKat}: ${jml}</span>`;
                });
                if (kategoriList.length > 4) {
                    html += `<span class="stat-more">+${kategoriList.length - 4} lainnya</span>`;
                }
            } else {
                html += `<span class="stat-badge stat-empty">Belum ada data</span>`;
            }
            
            html += `
                    </div>
                </div>
            `;
        });
    }
    
    html += `</div>`;
    statsDiv.innerHTML = html;
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
            } else {
                kategoriHtml = '<div style="margin-top:8px"><em>Belum ada usaha</em></div>';
            }
            
            layer.bindPopup(`
                <div style="min-width:300px; max-width:350px;">
                    <div style="margin-bottom:8px;">
                        <b>🏢 ${data.nmsls || '-'}</b><br>
                        <small>IDSLS: ${data.idsls || '-'}</small><br>
                        <small>📍 ${data.nmkec || '-'} | ${data.nmdesa || '-'}</small>
                    </div>
                    <hr style="margin:5px 0;">
                    <div style="margin-top:8px;">
                        <b>📊 TOTAL USAHA: ${total}</b>
                    </div>
                    <div style="margin-top:8px; padding:8px; background: #f0f9ff; border-radius:6px; border-left: 3px solid #2196f3;">
                        <div style="font-weight:bold; margin-bottom:5px;">🌐 PENGGUNAAN INTERNET:</div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                            <span>✅ Menggunakan Internet:</span>
                            <span style="font-weight:bold; color:#2e7d32;">${menggunakanInternet} usaha</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                            <span>❌ Tidak menggunakan:</span>
                            <span style="font-weight:bold; color:#c62828;">${tidakMenggunakanInternet} usaha</span>
                        </div>
                        ${total > 0 ? `
                            <div style="margin-top:5px;">
                                <div style="height:8px; background:#e0e0e0; border-radius:4px; overflow:hidden;">
                                    <div style="width:${persenInternet}%; height:100%; background:#4caf50;"></div>
                                </div>
                                <div style="text-align:center; margin-top:5px; font-size:11px; font-weight:bold;">
                                    ${persenInternet}% menggunakan internet
                                </div>
                            </div>
                        ` : '<div style="text-align:center; font-size:11px;">Belum ada data usaha</div>'}
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
        if (content.style.display === 'none' || content.style.display === '') {
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
        const layer = regionLayers[idsls];
        map.fitBounds(layer.getBounds());
        layer.openPopup();
        
        // Highlight item yang dipilih
        document.querySelectorAll('.stat-item').forEach(item => {
            item.style.background = '';
        });
        if (event && event.currentTarget) {
            event.currentTarget.style.background = '#e3f2fd';
        }
    }
};

// --- FUNGSI RESIZEABLE ---
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
            statsContent.style.height = saved + 'px';
            statsContent.style.maxHeight = saved + 'px';
        } else {
            statsContent.style.height = '300px';
            statsContent.style.maxHeight = '300px';
        }
    }
    
    const onMouseDown = function(e) {
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        startY = e.clientY;
        startHeight = statsContent.offsetHeight;
        
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        
        let overlay = document.getElementById('resize-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'resize-overlay';
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.zIndex = '9999';
            overlay.style.cursor = 'ns-resize';
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'block';
    };
    
    const onMouseMove = function(e) {
        if (!isResizing) return;
        
        e.preventDefault();
        const deltaY = e.clientY - startY;
        let newHeight = startHeight + deltaY;
        
        const minHeight = 150;
        const maxHeight = window.innerHeight - 350;
        
        newHeight = Math.min(maxHeight, Math.max(minHeight, newHeight));
        
        statsContent.style.height = newHeight + 'px';
        statsContent.style.maxHeight = newHeight + 'px';
    };
    
    const onMouseUp = function(e) {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            const overlay = document.getElementById('resize-overlay');
            if (overlay) overlay.style.display = 'none';
            
            if (statsContent && statsContent.offsetHeight) {
                saveHeight(statsContent.offsetHeight);
            }
        }
    };
    
    handle.removeEventListener('mousedown', onMouseDown);
    handle.addEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    
    handle.addEventListener('click', function(e) {
        e.stopPropagation();
    });
    
    loadHeight();
    statsContent.style.overflowY = 'auto';
}

// 1. LOAD GEOJSON
fetch('data/wilayah.geojson')
    .then(res => res.json())
    .then(data => {
        geojsonData = data;
        console.log("GeoJSON loaded, jumlah fitur:", geojsonData.features.length);
        
        L.geoJSON(data, {
            style: { color: "#ff7800", weight: 2, fillOpacity: 0.1 },
            onEachFeature: (feature, layer) => {
                const idsls = feature.properties.idsls || "Tanpa ID";
                const nmsls = feature.properties.nmsls || "Tanpa Nama";
                const nmkec = feature.properties.nmkec || "-";
                const nmdesa = feature.properties.nmdesa || "-";
                regionLayers[idsls] = layer;
            }
        }).addTo(map);

        Object.keys(regionLayers).sort().forEach(id => {
            const option = document.createElement('option');
            option.value = id;
            idslsList.appendChild(option);
        });
        
        if (allBusinessData.length > 0) {
            hitungStatistikWilayah();
        }
    })
    .catch(error => console.error('Error loading GeoJSON:', error));

// 2. LOAD FIREBASE
const dbRef = ref(db, 'tagging_usaha');
onValue(dbRef, (snapshot) => {
    allBusinessData = [];
    const kategoriSet = new Set();

    snapshot.forEach((child) => {
        const data = child.val();
        if (data.latitude && data.longitude) {
            allBusinessData.push(data);
            kategoriSet.add(data.kategoriUsaha || "Lainnya");
            console.log("Data usaha:", data.namaUsaha, "isMenggunakanInternet:", data.isMenggunakanInternet);
        }
    });

    console.log("Total data dari Firebase:", allBusinessData.length);
    
    updateFilterOptions(kategoriSet);
    renderDisplay("Semua");
    
    if (geojsonData) {
        hitungStatistikWilayah();
    }
});

// --- FUNGSI PEMBANTU ---
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
            marker.bindPopup(`
                <b>${data.namaUsaha || '-'}</b><br>
                Kategori: ${kategori}<br>
                🌐 Internet: ${internetStatus}
            `);
            allMarkers.addLayer(marker);

            const div = document.createElement('div');
            div.className = 'item';
            div.innerHTML = `
                <h4>${data.namaUsaha || '-'}</h4>
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
}

// 3. EVENT LISTENERS
filterKategori.addEventListener('change', (e) => {
    renderDisplay(e.target.value);
});

searchInput.addEventListener('input', (e) => {
    const filter = e.target.value.toLowerCase();
    document.querySelectorAll('.item').forEach(item => {
        item.style.display = item.innerText.toLowerCase().includes(filter) ? "" : "none";
    });
});

searchIdsls.addEventListener('input', (e) => {
    const selected = e.target.value;
    if (regionLayers[selected]) {
        const layer = regionLayers[selected];
        map.fitBounds(layer.getBounds());
        layer.openPopup();
    }
});
