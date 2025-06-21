import './bootstrap';
import Alpine from 'alpinejs';
import Chart from 'chart.js/auto';

// Make Alpine and Chart available globally
window.Alpine = Alpine;
window.Chart = Chart;

// Start Alpine
Alpine.start();

// Dark mode toggle functionality
window.toggleDarkMode = function() {
    if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    }
    
    // Update charts if they exist
    if (window.charts) {
        Object.values(window.charts).forEach(chart => {
            if (chart && typeof chart.update === 'function') {
                chart.update();
            }
        });
    }
};

// Initialize theme from localStorage
document.addEventListener('DOMContentLoaded', function() {
    const theme = localStorage.getItem('theme');
    if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }
});

// Chart utilities
window.charts = {};

window.createChart = function(elementId, config) {
    const ctx = document.getElementById(elementId);
    if (ctx) {
        if (window.charts[elementId]) {
            window.charts[elementId].destroy();
        }
        window.charts[elementId] = new Chart(ctx, config);
    }
};

// Table utilities
window.sortTable = function(table, column) {
    // Table sorting logic
    console.log('Sorting table by column:', column);
};

window.filterTable = function(table, query) {
    // Table filtering logic
    console.log('Filtering table with query:', query);
};