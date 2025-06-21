<?php
// ==================================================
// 2. MISSING VIEW: settings/index.blade.php
// ==================================================
?>
{{-- File: Modules/Admin/resources/views/settings/index.blade.php --}}
@extends('admin::layouts.app')

@section('title', 'Settings')
@section('page-title', 'System Settings')
@section('page-description', 'Configure application settings and preferences')

@section('content')
<div class="max-w-6xl mx-auto space-y-6">
    
    <!-- General Settings -->
    <div class="card">
        <div class="card-header">
            <h3 class="text-lg font-semibold">General Settings</h3>
        </div>
        
        <form method="POST" action="{{ route('admin.settings.update') }}" class="card-body">
            @csrf
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Application Name -->
                <div>
                    <label for="app_name" class="block text-sm font-medium text-foreground mb-2">
                        Application Name
                    </label>
                    <input type="text" id="app_name" name="app_name" 
                           value="{{ old('app_name', $settings['app_name']) }}" 
                           class="input">
                </div>

                <!-- Application URL -->
                <div>
                    <label for="app_url" class="block text-sm font-medium text-foreground mb-2">
                        Application URL
                    </label>
                    <input type="url" id="app_url" name="app_url" 
                           value="{{ old('app_url', $settings['app_url']) }}" 
                           class="input">
                </div>

                <!-- Timezone -->
                <div>
                    <label for="timezone" class="block text-sm font-medium text-foreground mb-2">
                        Default Timezone
                    </label>
                    <select id="timezone" name="timezone" class="select">
                        <option value="UTC" {{ $settings['timezone'] === 'UTC' ? 'selected' : '' }}>UTC</option>
                        <option value="America/New_York" {{ $settings['timezone'] === 'America/New_York' ? 'selected' : '' }}>Eastern Time</option>
                        <option value="America/Chicago" {{ $settings['timezone'] === 'America/Chicago' ? 'selected' : '' }}>Central Time</option>
                        <option value="America/Denver" {{ $settings['timezone'] === 'America/Denver' ? 'selected' : '' }}>Mountain Time</option>
                        <option value="America/Los_Angeles" {{ $settings['timezone'] === 'America/Los_Angeles' ? 'selected' : '' }}>Pacific Time</option>
                    </select>
                </div>

                <!-- Maintenance Mode -->
                <div>
                    <label class="block text-sm font-medium text-foreground mb-2">
                        Maintenance Mode
                    </label>
                    <div class="flex items-center space-x-2">
                        <input type="checkbox" id="maintenance_mode" name="maintenance_mode" value="1" 
                               {{ $settings['maintenance_mode'] ? 'checked' : '' }} 
                               class="checkbox">
                        <label for="maintenance_mode" class="text-sm">Enable maintenance mode</label>
                    </div>
                </div>
            </div>

            <div class="pt-6 border-t border-border">
                <button type="submit" class="btn-primary">
                    Save Settings
                </button>
            </div>
        </form>
    </div>

    <!-- Security Settings -->
    <div class="card">
        <div class="card-header">
            <h3 class="text-lg font-semibold">Security Settings</h3>
        </div>
        
        <div class="card-body space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <h4 class="font-medium mb-2">Session Timeout</h4>
                    <select class="select">
                        <option value="30">30 minutes</option>
                        <option value="60" selected>1 hour</option>
                        <option value="120">2 hours</option>
                        <option value="240">4 hours</option>
                    </select>
                </div>

                <div>
                    <h4 class="font-medium mb-2">Two-Factor Authentication</h4>
                    <div class="flex items-center space-x-2">
                        <input type="checkbox" id="require_2fa" class="checkbox">
                        <label for="require_2fa" class="text-sm">Require for all users</label>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Email Settings -->
    <div class="card">
        <div class="card-header">
            <h3 class="text-lg font-semibold">Email Configuration</h3>
        </div>
        
        <div class="card-body">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label class="block text-sm font-medium text-foreground mb-2">SMTP Host</label>
                    <input type="text" class="input" placeholder="smtp.gmail.com">
                </div>

                <div>
                    <label class="block text-sm font-medium text-foreground mb-2">SMTP Port</label>
                    <input type="number" class="input" placeholder="587">
                </div>

                <div>
                    <label class="block text-sm font-medium text-foreground mb-2">Username</label>
                    <input type="email" class="input" placeholder="your-email@gmail.com">
                </div>

                <div>
                    <label class="block text-sm font-medium text-foreground mb-2">From Email</label>
                    <input type="email" class="input" placeholder="noreply@yourapp.com">
                </div>
            </div>
        </div>
    </div>

</div>
@endsection