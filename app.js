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
let statistikData = {}; // Menyimpan data statistik untuk filter

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
            kategori: {}
        };
    });
    
    // Hitung setiap titik usaha berada di wilayah mana
    allBusinessData.forEach(usaha => {
        const kategori = usaha.kategoriUsaha || "Lainnya";
        const point = turf.point([parseFloat(usaha.longitude), parseFloat(usaha.latitude)]);
        
        geojsonData.features.forEach(feature => {
            const idsls = feature.properties.idsls;
            if (idsls && turf.booleanPointInPolygon(point, feature)) {
                statistikData[idsls].total++;
                if (!statistikData[idsls].kategori[kategori]) {
                    statistikData[idsls].kategori[kategori] = 0;
                }
                statistikData[idsls].kategori[kategori]++;
            }
        });
    });
    
    // Tampilkan statistik (tanpa filter)
    tampilkanStatistik();
    
    // Update popup wilayah
    updatePopupWilayah();
}

function tampilkanStatistik() {
    // Cari atau buat container statistik
    let statsDiv = document.getElementById('statsWilayah');
    if (!statsDiv) {
        // Sisipkan setelah filterKategori
        const filterDiv = document.querySelector('.control-group');
        statsDiv = document.createElement('div');
        statsDiv.id = 'statsWilayah';
        statsDiv.className = 'stats-wilayah';
        filterDiv.parentNode.insertBefore(statsDiv, filterDiv.nextSibling);
        
        // Tambahkan input filter IDSLS di dalam stats
        const filterInput = document.createElement('input');
        filterInput.id = 'filterStatIdsls';
        filterInput.placeholder = '🔍 Cari IDSLS, Desa, atau Kecamatan...';
        filterInput.className = 'stats-filter-input';
        filterInput.addEventListener('input', (e) => {
            filterStatistik(e.target.value);
        });
        statsDiv.parentNode.insertBefore(filterInput, statsDiv);
    }
    
    // Ambil nilai filter
    const filterText = document.getElementById('filterStatIdsls')?.value.toLowerCase() || '';
    
    let html = `
        <div class="stats-header" onclick="toggleStats()">
            <span>📊 STATISTIK PER WILAYAH (${Object.keys(statistikData).length} Wilayah)</span>
            <span id="statsToggleIcon">▼</span>
        </div>
        <div id="statsContent" class="stats-content">
    `;
    
    // Filter data berdasarkan IDSLS, nmsls, nmkec, atau nmdesa
    let filteredData = Object.values(statistikData);
    if (filterText) {
        filteredData = filteredData.filter(wilayah => 
            wilayah.idsls.toLowerCase().includes(filterText) ||
            wilayah.nmsls.toLowerCase().includes(filterText) ||
            wilayah.nmkec.toLowerCase().includes(filterText) ||
            wilayah.nmdesa.toLowerCase().includes(filterText)
        );
        html += `<div class="stats-filter-info">Menampilkan ${filteredData.length} dari ${Object.keys(statistikData).length} wilayah</div>`;
    }
    
    // Urutkan berdasarkan IDSLS
    filteredData.sort((a, b) => a.idsls.localeCompare(b.idsls));
    
    if (filteredData.length === 0) {
        html += `<div class="stats-no-data">Tidak ada wilayah yang ditemukan</div>`;
    } else {
        filteredData.forEach(wilayah => {
            html += `
                <div class="stat-item" onclick="zoomKeWilayah('${wilayah.idsls}')">
                    <div class="stat-header-row">
                        <div class="stat-idsls">${wilayah.idsls}</div>
                        <div class="stat-total-badge">${wilayah.total} usaha</div>
                    </div>
                    <div class="stat-nmsls">${wilayah.nmsls}</div>
                    <div class="stat-location">
                        <span>📍 ${wilayah.nmkec}</span>
                        <span> | ${wilayah.nmdesa}</span>
                    </div>
                    <div class="stat-kategori">
            `;
            
            // Tampilkan kategori (max 4 dulu)
            const kategoriList = Object.entries(wilayah.kategori).sort((a,b) => b[1] - a[1]);
            if (kategoriList.length > 0) {
                kategoriList.slice(0, 4).forEach(([kat, jml]) => {
                    html += `<span class="stat-badge">${kat}: ${jml}</span>`;
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

function filterStatistik(searchText) {
    tampilkanStatistik();
}

function updatePopupWilayah() {
    Object.keys(regionLayers).forEach(idsls => {
        const layer = regionLayers[idsls];
        if (layer && statistikData[idsls]) {
            const data = statistikData[idsls];
            let kategoriHtml = '';
            
            if (Object.keys(data.kategori).length > 0) {
                kategoriHtml = '<div style="margin-top:8px"><strong>📋 Kategori:</strong><br>';
                for (const [kat, jml] of Object.entries(data.kategori)) {
                    kategoriHtml += `• ${kat}: ${jml}<br>`;
                }
                kategoriHtml += '</div>';
            } else {
                kategoriHtml = '<div style="margin-top:8px"><em>Belum ada usaha</em></div>';
            }
            
            layer.bindPopup(`
                <div style="min-width:200px">
                    <b>🏢 ${data.nmsls}</b><br>
                    <small>IDSLS: ${data.idsls}</small><br>
                    <small>📍 Kec: ${data.nmkec} | Desa: ${data.nmdesa}</small><br>
                    <hr style="margin:5px 0">
                    <b>📊 Total Usaha: ${data.total}</b>
                    ${kategoriHtml}
                </div>
            `);
        }
    });
}

// Fungsi global untuk toggle statistik
window.toggleStats = function() {
    const content = document.getElementById('statsContent');
    const icon = document.getElementById('statsToggleIcon');
    if (content) {
        if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.textContent = '▼';
        } else {
            content.style.display = 'none';
            icon.textContent = '▶';
        }
    }
};

// Fungsi global untuk zoom ke wilayah
window.zoomKeWilayah = function(idsls) {
    if (regionLayers[idsls]) {
        const layer = regionLayers[idsls];
        map.fitBounds(layer.getBounds());
        layer.openPopup();
        
        // Highlight item yang dipilih
        document.querySelectorAll('.stat-item').forEach(item => {
            item.style.background = '';
        });
        event?.currentTarget?.style.setProperty('background', '#e3f2fd');
    }
};

// 1. LOAD GEOJSON
fetch('data/wilayah.geojson')
    .then(res => res.json())
    .then(data => {
        geojsonData = data;
        
        L.geoJSON(data, {
            style: { color: "#ff7800", weight: 2, fillOpacity: 0.1 },
            onEachFeature: (feature, layer) => {
                const idsls = feature.properties.idsls || "Tanpa ID";
                const nmsls = feature.properties.nmsls || "Tanpa Nama";
                const nmkec = feature.properties.nmkec || "-";
                const nmdesa = feature.properties.nmdesa || "-";
                regionLayers[idsls] = layer;
                layer.bindPopup(`
                    <strong>${nmsls}</strong><br>
                    ID: ${idsls}<br>
                    Kec: ${nmkec} | Desa: ${nmdesa}
                `);
            }
        }).addTo(map);

        Object.keys(regionLayers).sort().forEach(id => {
            const option = document.createElement('option');
            option.value = id;
            idslsList.appendChild(option);
        });
        
        // Hitung statistik setelah data siap
        if (allBusinessData.length > 0) {
            hitungStatistikWilayah();
        }
    });

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
        }
    });

    updateFilterOptions(kategoriSet);
    renderDisplay("Semua");
    
    // Hitung ulang statistik setelah data berubah
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
            marker.bindPopup(`<b>${data.namaUsaha}</b><br>Kategori: ${kategori}`);
            allMarkers.addLayer(marker);

            const div = document.createElement('div');
            div.className = 'item';
            div.innerHTML = `<h4>${data.namaUsaha}</h4><p>Kategori: ${kategori}</p>`;
            
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
