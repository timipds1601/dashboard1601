// Data contoh dengan koordinat - GANTI dengan data real Anda
const sampleData = {
    usaha: [
        { 
            id: 1, 
            nama_usaha: "Toko Sembako", 
            sls_code: "SLS001", 
            sls_name: "Dusun Sukamakmur", 
            jenis_usaha: "Perdagangan",
            latitude: -6.200000,
            longitude: 106.816666,
            alamat: "Jl. Raya No. 123",
            pemilik: "Budi Santoso"
        },
        { 
            id: 2, 
            nama_usaha: "Warung Makan", 
            sls_code: "SLS001", 
            sls_name: "Dusun Sukamakmur", 
            jenis_usaha: "Kuliner",
            latitude: -6.201000,
            longitude: 106.817000,
            alamat: "Jl. Makan Enak No. 45",
            pemilik: "Siti Aminah"
        },
        { 
            id: 3, 
            nama_usaha: "Bengkel Motor", 
            sls_code: "SLS002", 
            sls_name: "Dusun Mekarjaya", 
            jenis_usaha: "Jasa",
            latitude: -6.202000,
            longitude: 106.818000,
            alamat: "Jl. Motor No. 78",
            pemilik: "Agus Setiawan"
        },
        { 
            id: 4, 
            nama_usaha: "Salon Kecantikan", 
            sls_code: "SLS002", 
            sls_name: "Dusun Mekarjaya", 
            jenis_usaha: "Jasa",
            latitude: -6.203000,
            longitude: 106.819000,
            alamat: "Jl. Cantik No. 12",
            pemilik: "Dewi Lestari"
        },
        { 
            id: 5, 
            nama_usaha: "Toko Elektronik", 
            sls_code: "SLS003", 
            sls_name: "Dusun Cipta Karya", 
            jenis_usaha: "Perdagangan",
            latitude: -6.204000,
            longitude: 106.820000,
            alamat: "Jl. Elektronik No. 34",
            pemilik: "Hendra Wijaya"
        },
        { 
            id: 6, 
            nama_usaha: "Laundry", 
            sls_code: "SLS001", 
            sls_name: "Dusun Sukamakmur", 
            jenis_usaha: "Jasa",
            latitude: -6.205000,
            longitude: 106.821000,
            alamat: "Jl. Bersih No. 56",
            pemilik: "Rina Wati"
        },
        { 
            id: 7, 
            nama_usaha: "Kios Pulsa", 
            sls_code: "SLS003", 
            sls_name: "Dusun Cipta Karya", 
            jenis_usaha: "Perdagangan",
            latitude: -6.206000,
            longitude: 106.822000,
            alamat: "Jl. Komunikasi No. 89",
            pemilik: "Joko Supriyanto"
        },
        { 
            id: 8, 
            nama_usaha: "Foto Copy", 
            sls_code: "SLS002", 
            sls_name: "Dusun Mekarjaya", 
            jenis_usaha: "Jasa",
            latitude: -6.207000,
            longitude: 106.823000,
            alamat: "Jl. Dokumen No. 67",
            pemilik: "Sri Mulyani"
        }
    ]
};

// Global variables
let map;
let markers = [];
let currentPage = 1;
let itemsPerPage = 10;
let currentSearch = '';
let rekapData = [];

// Fungsi untuk mengambil data real (GANTI dengan data Anda)
async function fetchData() {
    try {
        // Coba ambil dari file JSON jika ada
        try {
            const response = await fetch('data/usaha_data.json');
            if (response.ok) {
                const data = await response.json();
                return data;
            }
        } catch (e) {
            console.log('File JSON tidak ditemukan, menggunakan sample data');
        }
        
        // Jika tidak ada file, gunakan sample data
        return sampleData;
        
    } catch (error) {
        console.error('Error fetching data:', error);
        throw error;
    }
}

// ==================== FUNGSI PETA ====================

// Inisialisasi peta
function initMap(data) {
    // Hapus peta lama jika ada
    if (map) {
        map.remove();
    }
    
    // Koordinat default (Indonesia)
    const defaultCenter = [-6.200000, 106.816666];
    
    // Inisialisasi peta baru
    map = L.map('map').setView(defaultCenter, 13);
    
    // Tambahkan tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CartoDB',
        subdomains: 'abcd',
        maxZoom: 19,
        minZoom: 8
    }).addTo(map);
    
    // Tambahkan marker untuk setiap usaha
    const bounds = [];
    const markersBySLS = {};
    
    data.usaha.forEach(usaha => {
        if (usaha.latitude && usaha.longitude) {
            const position = [usaha.latitude, usaha.longitude];
            bounds.push(position);
            
            // Warna marker berdasarkan jenis usaha
            let markerColor = 'blue';
            switch(usaha.jenis_usaha) {
                case 'Perdagangan':
                    markerColor = 'red';
                    break;
                case 'Kuliner':
                    markerColor = 'orange';
                    break;
                case 'Jasa':
                    markerColor = 'green';
                    break;
                default:
                    markerColor = 'blue';
            }
            
            // Buat custom icon
            const icon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="background-color: ${markerColor}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 3px rgba(0,0,0,0.3);"></div>`,
                iconSize: [12, 12],
                popupAnchor: [0, -6]
            });
            
            // Tambah marker
            const marker = L.marker(position, { icon: icon }).addTo(map);
            
            // Buat popup
            const popupContent = `
                <div class="custom-info-window">
                    <h4>${usaha.nama_usaha}</h4>
                    <p><strong>SLS:</strong> ${usaha.sls_code} - ${usaha.sls_name}</p>
                    <p><strong>Jenis:</strong> ${usaha.jenis_usaha}</p>
                    <p><strong>Alamat:</strong> ${usaha.alamat || '-'}</p>
                    <p><strong>Pemilik:</strong> ${usaha.pemilik || '-'}</p>
                </div>
            `;
            marker.bindPopup(popupContent);
            
            // Kelompokkan marker per SLS untuk clustering (opsional)
            if (!markersBySLS[usaha.sls_code]) {
                markersBySLS[usaha.sls_code] = [];
            }
            markersBySLS[usaha.sls_code].push(marker);
            
            markers.push(marker);
        }
    });
    
    // Fit bounds jika ada marker
    if (bounds.length > 0) {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.1));
    }
    
    // Tambahkan legend
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function() {
        const div = L.DomUtil.create('div', 'legend');
        div.innerHTML = `
            <h4>Jenis Usaha</h4>
            <div><div style="background: red;" class="color"></div> Perdagangan</div>
            <div><div style="background: orange;" class="color"></div> Kuliner</div>
            <div><div style="background: green;" class="color"></div> Jasa</div>
        `;
        return div;
    };
    legend.addTo(map);
}

// Fungsi untuk menampilkan peta usaha
async function showPetaUsaha() {
    const container = document.getElementById('content-area');
    container.innerHTML = `
        <div class="map-container">
            <div id="map" style="height: 600px;"></div>
            <div class="map-controls">
                <button onclick="resetMapView()"><i class="fas fa-home"></i> Reset View</button>
                <button onclick="showAllMarkers()"><i class="fas fa-eye"></i> Tampilkan Semua</button>
            </div>
        </div>
        <div style="margin-top: 20px; padding: 15px; background: #f9f9f9; border-radius: 8px;">
            <h3><i class="fas fa-info-circle"></i> Informasi Peta</h3>
            <p>Total titik usaha: <strong>${markers.length}</strong> | Klik marker untuk melihat detail usaha</p>
        </div>
    `;
    
    try {
        const data = await fetchData();
        initMap(data);
    } catch (error) {
        console.error('Error loading map:', error);
        container.innerHTML += '<div class="error-message">Gagal memuat peta. Silakan coba lagi.</div>';
    }
}

// Reset view peta
function resetMapView() {
    if (map) {
        map.setView([-6.200000, 106.816666], 13);
    }
}

// Tampilkan semua marker
function showAllMarkers() {
    if (markers.length > 0) {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

// ==================== FUNGSI REKAP DASHBOARD ====================

// Fungsi untuk mengelompokkan data per SLS
function groupBySLS(data) {
    const grouped = new Map();
    
    data.usaha.forEach(item => {
        const slsCode = item.sls_code;
        if (!grouped.has(slsCode)) {
            grouped.set(slsCode, {
                kode_sls: slsCode,
                nama_sls: item.sls_name,
                total_usaha: 0,
                jenis_usaha: {}
            });
        }
        
        const slsData = grouped.get(slsCode);
        slsData.total_usaha++;
        
        // Hitung per jenis usaha
        if (item.jenis_usaha) {
            if (!slsData.jenis_usaha[item.jenis_usaha]) {
                slsData.jenis_usaha[item.jenis_usaha] = 0;
            }
            slsData.jenis_usaha[item.jenis_usaha]++;
        }
    });
    
    return Array.from(grouped.values()).sort((a, b) => b.total_usaha - a.total_usaha);
}

// Render tabel rekap dashboard
function renderRekapTable(data, page = 1, search = '') {
    const container = document.getElementById('content-area');
    if (!container) return;
    
    // Filter data berdasarkan search
    let filteredData = [...data];
    if (search) {
        filteredData = filteredData.filter(item => 
            item.kode_sls.toLowerCase().includes(search.toLowerCase()) ||
            item.nama_sls.toLowerCase().includes(search.toLowerCase())
        );
    }
    
    // Hitung pagination
    const totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = filteredData.slice(startIndex, endIndex);
    
    // Total usaha keseluruhan
    const totalUsaha = filteredData.reduce((sum, item) => sum + item.total_usaha, 0);
    
    // HTML untuk rekap dashboard
    const html = `
        <div class="rekap-container">
            <div class="rekap-header">
                <h2><i class="fas fa-chart-bar"></i> Total Usaha per SLS</h2>
                <div class="rekap-stats">
                    Total Seluruh Usaha: <strong>${totalUsaha}</strong> | Total SLS: <strong>${filteredData.length}</strong>
                </div>
            </div>
            
            <div class="export-buttons">
                <button class="btn-export btn-excel" onclick="exportToExcel()">
                    <i class="fas fa-file-excel"></i> Export ke Excel
                </button>
                <button class="btn-export btn-pdf" onclick="exportToPDF()">
                    <i class="fas fa-file-pdf"></i> Export ke PDF
                </button>
            </div>
            
            <div class="search-filter">
                <div class="search-box">
                    <i class="fas fa-search"></i>
                    <input type="text" id="searchInput" placeholder="Cari kode SLS atau nama SLS..." value="${search}">
                </div>
            </div>
            
            <div class="table-wrapper">
                <table class="rekap-table">
                    <thead>
                        <tr>
                            <th>No</th>
                            <th>Kode SLS</th>
                            <th>Nama SLS</th>
                            <th>Total Usaha</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pageData.map((item, index) => `
                            <tr>
                                <td>${startIndex + index + 1}</td>
                                <td><strong>${item.kode_sls}</strong></td>
                                <td>${item.nama_sls}</td>
                                <td>${item.total_usaha}</td>
                            </tr>
                        `).join('')}
                        ${pageData.length === 0 ? '<tr><td colspan="4" class="no-data">Tidak ada data ditemukan</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
            
            ${totalPages > 1 ? `
                <div class="pagination" id="pagination">
                    ${Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => `
                        <button class="${pageNum === page ? 'active' : ''}" onclick="changePage(${pageNum})">
                            ${pageNum}
                        </button>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;
    
    container.innerHTML = html;
    
    // Event listener untuk search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearch = e.target.value;
            currentPage = 1;
            renderRekapTable(rekapData, currentPage, currentSearch);
        });
    }
}

// Fungsi untuk menampilkan rekap dashboard
async function showRekapDashboard() {
    const container = document.getElementById('content-area');
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Memuat data...</div>';
    
    try {
        const data = await fetchData();
        rekapData = groupBySLS(data);
        currentPage = 1;
        currentSearch = '';
        renderRekapTable(rekapData, currentPage, currentSearch);
    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = '<div class="error-message">Gagal memuat data. Silakan coba lagi nanti.</div>';
    }
}

// ==================== FUNGSI STATISTIK ====================

async function showStatistik() {
    const container = document.getElementById('content-area');
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Memuat statistik...</div>';
    
    try {
        const data = await fetchData();
        
        // Hitung statistik
        const totalUsaha = data.usaha.length;
        const totalSLS = new Set(data.usaha.map(u => u.sls_code)).size;
        const jenisUsahaCount = {};
        
        data.usaha.forEach(u => {
            jenisUsahaCount[u.jenis_usaha] = (jenisUsahaCount[u.jenis_usaha] || 0) + 1;
        });
        
        // Data untuk chart
        const chartData = {
            labels: Object.keys(jenisUsahaCount),
            datasets: [{
                label: 'Jumlah Usaha',
                data: Object.values(jenisUsahaCount),
                backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'],
                borderWidth: 1
            }]
        };
        
        container.innerHTML = `
            <div class="stats-container">
                <div class="stat-card">
                    <i class="fas fa-store"></i>
                    <h3>Total Usaha</h3>
                    <div class="number">${totalUsaha}</div>
                </div>
                <div class="stat-card">
                    <i class="fas fa-map-marker-alt"></i>
                    <h3>Total SLS</h3>
                    <div class="number">${totalSLS}</div>
                </div>
                <div class="stat-card">
                    <i class="fas fa-chart-pie"></i>
                    <h3>Jenis Usaha</h3>
                    <div class="number">${Object.keys(jenisUsahaCount).length}</div>
                </div>
            </div>
            <div class="chart-container">
                <canvas id="statsChart"></canvas>
            </div>
        `;
        
        // Render chart
        const ctx = document.getElementById('statsChart').getContext('2d');
        new Chart(ctx, {
            type: 'pie',
            data: chartData,
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    },
                    title: {
                        display: true,
                        text: 'Distribusi Usaha Berdasarkan Jenis'
                    }
                }
            }
        });
        
    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = '<div class="error-message">Gagal memuat statistik.</div>';
    }
}

// ==================== FUNGSI EXPORT ====================

function exportToExcel() {
    if (!rekapData || rekapData.length === 0) {
        alert('Tidak ada data untuk diexport');
        return;
    }
    
    let dataToExport = [...rekapData];
    if (currentSearch) {
        dataToExport = dataToExport.filter(item => 
            item.kode_sls.toLowerCase().includes(currentSearch.toLowerCase()) ||
            item.nama_sls.toLowerCase().includes(currentSearch.toLowerCase())
        );
    }
    
    const excelData = dataToExport.map((item, index) => ({
        'No': index + 1,
        'Kode SLS': item.kode_sls,
        'Nama SLS': item.nama_sls,
        'Total Usaha': item.total_usaha
    }));
    
    const headers = Object.keys(excelData[0]);
    const csvContent = [
        headers.join(','),
        ...excelData.map(row => headers.map(header => `"${row[header]}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', `rekap_usaha_per_sls_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    alert('Export Excel berhasil!');
}

function exportToPDF() {
    const printContent = document.querySelector('.rekap-container');
    if (!printContent) {
        alert('Tidak ada data untuk diexport');
        return;
    }
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Total Usaha per SLS</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #1e3c72; color: white; }
                    .rekap-header { margin-bottom: 20px; }
                    h2 { color: #1e3c72; }
                </style>
            </head>
            <body>
                ${printContent.outerHTML}
            </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
    printWindow.close();
}

function changePage(page) {
    currentPage = page;
    renderRekapTable(rekapData, currentPage, currentSearch);
}

// ==================== NAVIGASI ====================

function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const pageTitle = document.getElementById('page-title');
    
    navItems.forEach(item => {
        item.addEventListener('click', async function() {
            navItems.forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');
            
            const menuType = this.getAttribute('data-menu');
            
            if (menuType === 'peta-usaha') {
                pageTitle.textContent = 'Peta Sebaran Usaha';
                await showPetaUsaha();
            } else if (menuType === 'rekap-dashboard') {
                pageTitle.textContent = 'Rekap Dashboard - Total Usaha per SLS';
                await showRekapDashboard();
            } else if (menuType === 'statistik') {
                pageTitle.textContent = 'Statistik Usaha';
                await showStatistik();
            }
        });
    });
}

// Export ke global scope
window.resetMapView = resetMapView;
window.showAllMarkers = showAllMarkers;
window.changePage = changePage;
window.exportToExcel = exportToExcel;
window.exportToPDF = exportToPDF;

// Inisialisasi saat halaman load
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    showPetaUsaha(); // Tampilkan peta sebagai default
});
