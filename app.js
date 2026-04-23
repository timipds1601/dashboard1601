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
let allBusinessData = []; // Menyimpan semua data dari Firebase
let currentlySelectedMarker = null;
const regionLayers = {}; 

// DOM Elements
const filterKategori = document.getElementById('filterKategori');
const dataList = document.getElementById('dataList');
const searchInput = document.getElementById('searchInput');
const searchIdsls = document.getElementById('searchIdsls');
const idslsList = document.getElementById('idsls-list');

// 1. LOAD GEOJSON
fetch('data/wilayah.geojson')
    .then(res => res.json())
    .then(data => {
        L.geoJSON(data, {
            style: { color: "#ff7800", weight: 2, fillOpacity: 0.1 },
            onEachFeature: (feature, layer) => {
                const idsls = feature.properties.idsls || "Tanpa ID";
                const nmsls = feature.properties.nmsls || "Tanpa Nama";
                layer.bindPopup(`<strong>Wilayah:</strong> ${nmsls}<br><strong>IDSLS:</strong> ${idsls}`);
                regionLayers[idsls] = layer;
            }
        }).addTo(map);

        Object.keys(regionLayers).sort().forEach(id => {
            const option = document.createElement('option');
            option.value = id;
            idslsList.appendChild(option);
        });
    });

// 2. LOAD FIREBASE
const dbRef = ref(db, 'tagging_usaha');
onValue(dbRef, (snapshot) => {
    allBusinessData = []; // Kosongkan array setiap ada update database
    const kategoriSet = new Set(); // Set otomatis menghilangkan duplikat

    snapshot.forEach((child) => {
        const data = child.val();
        if (data.latitude && data.longitude) {
            allBusinessData.push(data);
            kategoriSet.add(data.kategoriUsaha || "Lainnya");
        }
    });

    // Update opsi dropdown
    updateFilterOptions(kategoriSet);
    
    // Tampilkan semua data saat load pertama
    renderDisplay("Semua"); 
});

// --- FUNGSI PEMBANTU ---

// Mengisi dropdown filter
function updateFilterOptions(kategoriSet) {
    filterKategori.innerHTML = '<option value="Semua">-- Semua Kategori --</option>';
    Array.from(kategoriSet).sort().forEach(kat => {
        const option = document.createElement('option');
        option.value = kat;
        option.textContent = kat;
        filterKategori.appendChild(option);
    });
}

// Fungsi utama untuk menampilkan marker dan list berdasarkan filter
function renderDisplay(filterValue) {
    dataList.innerHTML = "";
    allMarkers.clearLayers();

    allBusinessData.forEach(data => {
        const kategori = data.kategoriUsaha || "Lainnya";
        
        // Logika Filter
        if (filterValue === "Semua" || kategori === filterValue) {
            
            // Tambah Marker
            const marker = L.marker([data.latitude, data.longitude]);
            marker.bindPopup(`<b>${data.namaUsaha}</b><br>Kategori: ${kategori}`);
            allMarkers.addLayer(marker);

            // Tambah List Sidebar
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