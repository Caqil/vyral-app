@extends('admin::layouts.app')

@section('title', 'Dashboard')
@section('page-title', 'Dashboard')
@section('page-description', 'Welcome back! Here\'s what\'s happening with your application today.')

@section('content')
    <div class="space-y-6">
        <!-- Stats Overview -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <!-- Total Users -->
            <div class="bg-card border border-border rounded-lg p-6">
                <div class="flex items-center">
                    <div class="p-2 bg-blue-500/10 rounded-lg">
                        <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z">
                            </path>
                        </svg>
                    </div>
                    <div class="ml-4 flex-1">
                        <p class="text-sm font-medium text-muted-foreground">Total Users</p>
                        <div class="flex items-baseline">
                            <p class="text-2xl font-bold text-card-foreground">{{ $stats['total_users'] ?? 0 }}</p>
                            <p class="ml-2 text-xs font-medium text-green-600">+20.1%</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Active Users -->
            <div class="bg-card border border-border rounded-lg p-6">
                <div class="flex items-center">
                    <div class="p-2 bg-green-500/10 rounded-lg">
                        <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </div>
                    <div class="ml-4 flex-1">
                        <p class="text-sm font-medium text-muted-foreground">Active Users</p>
                        <div class="flex items-baseline">
                            <p class="text-2xl font-bold text-card-foreground">{{ $stats['active_users'] ?? 0 }}</p>
                            <p class="ml-2 text-xs font-medium text-green-600">+180.1%</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Revenue -->
            <div class="bg-card border border-border rounded-lg p-6">
                <div class="flex items-center">
                    <div class="p-2 bg-yellow-500/10 rounded-lg">
                        <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1">
                            </path>
                        </svg>
                    </div>
                    <div class="ml-4 flex-1">
                        <p class="text-sm font-medium text-muted-foreground">Total Revenue</p>
                        <div class="flex items-baseline">
                            <p class="text-2xl font-bold text-card-foreground">$15,231.89</p>
                            <p class="ml-2 text-xs font-medium text-green-600">+20.1%</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modules -->
            <div class="bg-card border border-border rounded-lg p-6">
                <div class="flex items-center">
                    <div class="p-2 bg-purple-500/10 rounded-lg">
                        <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M19 11H5m14-7l-7 7m0 0l-7-7m7 7v11"></path>
                        </svg>
                    </div>
                    <div class="ml-4 flex-1">
                        <p class="text-sm font-medium text-muted-foreground">Active Modules</p>
                        <div class="flex items-baseline">
                            <p class="text-2xl font-bold text-card-foreground">3</p>
                            <p class="ml-2 text-xs font-medium text-blue-600">+2 new</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Charts Section -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Revenue Chart -->
            <div class="bg-card border border-border rounded-lg p-6">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-semibold text-card-foreground">Revenue Overview</h3>
                    <div class="tabs">
                        <div class="tabs-list">
                            <button class="tabs-trigger" data-state="active">7 days</button>
                            <button class="tabs-trigger">30 days</button>
                            <button class="tabs-trigger">90 days</button>
                        </div>
                    </div>
                </div>
                <div class="h-64">
                    <canvas id="revenueChart"></canvas>
                </div>
            </div>

            <!-- User Growth -->
            <div class="bg-card border border-border rounded-lg p-6">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-semibold text-card-foreground">User Growth</h3>
                    <div class="flex space-x-2">
                        <span
                            class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            <div class="w-2 h-2 bg-blue-500 rounded-full mr-1"></div>
                            This month
                        </span>
                        <span
                            class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                            <div class="w-2 h-2 bg-gray-500 rounded-full mr-1"></div>
                            Last month
                        </span>
                    </div>
                </div>
                <div class="h-64">
                    <canvas id="userGrowthChart"></canvas>
                </div>
            </div>
        </div>

        <!-- Recent Activity & Quick Actions -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Recent Activity -->
            <div class="lg:col-span-2 bg-card border border-border rounded-lg p-6">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-semibold text-card-foreground">Recent Activity</h3>
                    <a href="#" class="text-sm text-primary hover:underline">View all</a>
                </div>
                <div class="space-y-4">
                    <div class="flex items-start space-x-3">
                        <div
                            class="flex-shrink-0 w-8 h-8 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                            <svg class="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                    clip-rule="evenodd"></path>
                            </svg>
                        </div>
                        <div class="flex-1">
                            <p class="text-sm font-medium text-card-foreground">New user registration</p>
                            <p class="text-xs text-muted-foreground">john.doe@example.com joined the platform</p>
                            <p class="text-xs text-muted-foreground">2 minutes ago</p>
                        </div>
                    </div>

                    <div class="flex items-start space-x-3">
                        <div
                            class="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                            <svg class="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"></path>
                                <path fill-rule="evenodd"
                                    d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"
                                    clip-rule="evenodd"></path>
                            </svg>
                        </div>
                        <div class="flex-1">
                            <p class="text-sm font-medium text-card-foreground">Payment received</p>
                            <p class="text-xs text-muted-foreground">$299.00 from subscription renewal</p>
                            <p class="text-xs text-muted-foreground">1 hour ago</p>
                        </div>
                    </div>

                    <div class="flex items-start space-x-3">
                        <div
                            class="flex-shrink-0 w-8 h-8 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center">
                            <svg class="w-4 h-4 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd"
                                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                    clip-rule="evenodd"></path>
                            </svg>
                        </div>
                        <div class="flex-1">
                            <p class="text-sm font-medium text-card-foreground">System backup completed</p>
                            <p class="text-xs text-muted-foreground">All data backed up successfully</p>
                            <p class="text-xs text-muted-foreground">3 hours ago</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Quick Actions -->
            <div class="bg-card border border-border rounded-lg p-6">
                <h3 class="text-lg font-semibold text-card-foreground mb-4">Quick Actions</h3>
                <div class="space-y-3">
                    <button class="btn-default w-full justify-start">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                        </svg>
                        Add New User
                    </button>
                    <button class="btn-outline w-full justify-start">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z">
                            </path>
                        </svg>
                        Generate Report
                    </button>
                    <button class="btn-secondary w-full justify-start">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z">
                            </path>
                        </svg>
                        Backup System
                    </button>
                    <button class="btn-ghost w-full justify-start">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z">
                            </path>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                        </svg>
                        System Settings
                    </button>
                </div>
            </div>
        </div>
    </div>

    @push('scripts')
        <script>
            document.addEventListener('DOMContentLoaded', function () {
                // Revenue Chart
                const revenueCtx = document.getElementById('revenueChart');
                if (revenueCtx) {
                    window.createChart('revenueChart', {
                        type: 'line',
                        data: {
                            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                            datasets: [{
                                label: 'Revenue',
                                data: [12000, 19000, 15000, 25000, 22000, 30000],
                                borderColor: 'hsl(var(--primary))',
                                backgroundColor: 'hsl(var(--primary) / 0.1)',
                                tension: 0.4,
                                fill: true
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: {
                                    display: false
                                }
                            },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    grid: {
                                        color: 'hsl(var(--border))'
                                    }
                                },
                                x: {
                                    grid: {
                                        color: 'hsl(var(--border))'
                                    }
                                }
                            }
                        }
                    });
                }

                // User Growth Chart
                const userGrowthCtx = document.getElementById('userGrowthChart');
                if (userGrowthCtx) {
                    window.createChart('userGrowthChart', {
                        type: 'bar',
                        data: {
                            labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                            datasets: [{
                                label: 'This Month',
                                data: [65, 78, 90, 81],
                                backgroundColor: 'hsl(var(--primary) / 0.8)',
                            }, {
                                label: 'Last Month',
                                data: [45, 56, 67, 58],
                                backgroundColor: 'hsl(var(--muted-foreground) / 0.3)',
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: {
                                    display: false
                                }
                            },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    grid: {
                                        color: 'hsl(var(--border))'
                                    }
                                },
                                x: {
                                    grid: {
                                        color: 'hsl(var(--border))'
                                    }
                                }
                            }
                        }
                    });
                }
            });
        </script>
    @endpush
@endsection