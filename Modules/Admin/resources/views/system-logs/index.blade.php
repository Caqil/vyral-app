<?php
// ==================================================
// 7. ADDITIONAL VIEW: system-logs/index.blade.php
// ==================================================
?>
{{-- File: Modules/Admin/resources/views/system-logs/index.blade.php --}}
@extends('admin::layouts.app')

@section('title', 'System Logs')
@section('page-title', 'System Logs')
@section('page-description', 'View application logs and error reports')

@section('content')
    <div class="space-y-6">

        <!-- Log Level Stats -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="card">
                <div class="card-body text-center">
                    <div class="text-2xl font-bold text-red-600">23</div>
                    <div class="text-sm text-muted-foreground">Errors</div>
                </div>
            </div>

            <div class="card">
                <div class="card-body text-center">
                    <div class="text-2xl font-bold text-yellow-600">45</div>
                    <div class="text-sm text-muted-foreground">Warnings</div>
                </div>
            </div>

            <div class="card">
                <div class="card-body text-center">
                    <div class="text-2xl font-bold text-blue-600">156</div>
                    <div class="text-sm text-muted-foreground">Info</div>
                </div>
            </div>

            <div class="card">
                <div class="card-body text-center">
                    <div class="text-2xl font-bold text-gray-600">89</div>
                    <div class="text-sm text-muted-foreground">Debug</div>
                </div>
            </div>
        </div>

        <!-- Log Filters -->
        <div class="card">
            <div class="card-body">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-foreground mb-2">Log Level</label>
                        <select class="select">
                            <option value="">All Levels</option>
                            <option value="error">Error</option>
                            <option value="warning">Warning</option>
                            <option value="info">Info</option>
                            <option value="debug">Debug</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-foreground mb-2">Date</label>
                        <input type="date" class="input" value="{{ date('Y-m-d') }}">
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-foreground mb-2">Search</label>
                        <input type="text" class="input" placeholder="Search in logs...">
                    </div>
                </div>
            </div>
        </div>

        <!-- Log Entries -->
        <div class="card">
            <div class="card-header flex items-center justify-between">
                <h3 class="text-lg font-semibold">Log Entries</h3>
                <div class="flex space-x-2">
                    <button class="btn-outline btn-sm">Refresh</button>
                    <button class="btn-outline btn-sm">Download</button>
                    <button class="btn-outline btn-sm text-destructive">Clear Logs</button>
                </div>
            </div>

            <div class="divide-y divide-border">
                <!-- Sample Log Entries -->
                <div class="p-4">
                    <div class="flex items-start space-x-3">
                        <span
                            class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
                            ERROR
                        </span>
                        <div class="flex-1">
                            <div class="flex items-center justify-between">
                                <p class="text-sm font-medium">Database connection failed</p>
                                <span class="text-xs text-muted-foreground">2 minutes ago</span>
                            </div>
                            <p class="text-sm text-muted-foreground mt-1">
                                SQLSTATE[HY000] [2002] Connection refused
                            </p>
                            <div class="mt-2 bg-muted p-2 rounded text-xs font-mono">
                                at
                                /var/www/html/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:70
                            </div>
                        </div>
                    </div>
                </div>

                <div class="p-4">
                    <div class="flex items-start space-x-3">
                        <span
                            class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                            WARNING
                        </span>
                        <div class="flex-1">
                            <div class="flex items-center justify-between">
                                <p class="text-sm font-medium">High memory usage detected</p>
                                <span class="text-xs text-muted-foreground">5 minutes ago</span>
                            </div>
                            <p class="text-sm text-muted-foreground mt-1">
                                Memory usage: 512MB (80% of limit)
                            </p>
                        </div>
                    </div>
                </div>

                <div class="p-4">
                    <div class="flex items-start space-x-3">
                        <span
                            class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            INFO
                        </span>
                        <div class="flex-1">
                            <div class="flex items-center justify-between">
                                <p class="text-sm font-medium">User authentication successful</p>
                                <span class="text-xs text-muted-foreground">10 minutes ago</span>
                            </div>
                            <p class="text-sm text-muted-foreground mt-1">
                                User ID: 42, IP: 192.168.1.100
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection