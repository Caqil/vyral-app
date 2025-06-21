<?php
// ==================================================
// 4. MISSING VIEW: modules/show.blade.php
// ==================================================
?>
{{-- File: Modules/Admin/resources/views/modules/show.blade.php --}}
@extends('admin::layouts.app')

@section('title', 'Module Details')
@section('page-title', 'Module: ' . $module->name)
@section('page-description', 'View module information and configuration')

@section('content')
    <div class="max-w-4xl mx-auto space-y-6">

        <!-- Module Header -->
        <div class="card">
            <div class="card-body">
                <div class="flex items-start justify-between">
                    <div class="flex items-center space-x-4">
                        <!-- Module Icon -->
                        <div class="w-16 h-16 bg-primary rounded-lg flex items-center justify-center">
                            <svg class="w-8 h-8 text-primary-foreground" fill="none" stroke="currentColor"
                                viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M19 11H5m14-7l-7 7m0 0l-7-7m7 7v11"></path>
                            </svg>
                        </div>

                        <div>
                            <h1 class="text-2xl font-bold">{{ $module->name }}</h1>
                            <p class="text-muted-foreground">{{ $module->description }}</p>
                            <div class="flex items-center space-x-4 mt-2">
                                <span class="text-sm">Version: {{ $module->version ?? '1.0.0' }}</span>
                                <span class="text-sm">Author: {{ $module->author ?? 'Unknown' }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Status Badge -->
                    <div class="flex flex-col items-end space-y-2">
                        <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium
                                   {{ $module->is_enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800' }}">
                            {{ $module->is_enabled ? 'Enabled' : 'Disabled' }}
                        </span>

                        @if($module->is_core)
                            <span class="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                                Core Module
                            </span>
                        @endif
                    </div>
                </div>
            </div>
        </div>

        <!-- Module Information -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

            <!-- Basic Information -->
            <div class="card">
                <div class="card-header">
                    <h3 class="text-lg font-semibold">Module Information</h3>
                </div>
                <div class="card-body space-y-4">
                    <div>
                        <label class="text-sm font-medium text-muted-foreground">Name</label>
                        <p class="text-sm">{{ $module->name }}</p>
                    </div>

                    <div>
                        <label class="text-sm font-medium text-muted-foreground">Description</label>
                        <p class="text-sm">{{ $module->description ?? 'No description available' }}</p>
                    </div>

                    <div>
                        <label class="text-sm font-medium text-muted-foreground">Version</label>
                        <p class="text-sm">{{ $module->version ?? '1.0.0' }}</p>
                    </div>

                    <div>
                        <label class="text-sm font-medium text-muted-foreground">Path</label>
                        <p class="text-sm font-mono text-xs bg-muted p-2 rounded">
                            {{ $module->path ?? 'Modules/' . $module->name }}</p>
                    </div>
                </div>
            </div>

            <!-- Configuration -->
            <div class="card">
                <div class="card-header">
                    <h3 class="text-lg font-semibold">Configuration</h3>
                </div>
                <div class="card-body space-y-4">
                    <div>
                        <label class="text-sm font-medium text-muted-foreground">Status</label>
                        <p class="text-sm">
                            <span
                                class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
                                       {{ $module->is_enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800' }}">
                                {{ $module->is_enabled ? 'Enabled' : 'Disabled' }}
                            </span>
                        </p>
                    </div>

                    <div>
                        <label class="text-sm font-medium text-muted-foreground">Type</label>
                        <p class="text-sm">{{ $module->is_core ? 'Core Module' : 'Custom Module' }}</p>
                    </div>

                    <div>
                        <label class="text-sm font-medium text-muted-foreground">Created</label>
                        <p class="text-sm">{{ $module->created_at ? $module->created_at->format('M d, Y') : 'Unknown' }}</p>
                    </div>

                    <div>
                        <label class="text-sm font-medium text-muted-foreground">Last Updated</label>
                        <p class="text-sm">{{ $module->updated_at ? $module->updated_at->format('M d, Y') : 'Unknown' }}</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Module Files -->
        <div class="card">
            <div class="card-header">
                <h3 class="text-lg font-semibold">Module Structure</h3>
            </div>
            <div class="card-body">
                <div class="bg-muted p-4 rounded font-mono text-sm">
                    <div class="space-y-1">
                        <div>📁 {{ $module->name }}/</div>
                        <div class="ml-4">📁 app/</div>
                        <div class="ml-8">📁 Http/Controllers/</div>
                        <div class="ml-8">📁 Models/</div>
                        <div class="ml-8">📁 Providers/</div>
                        <div class="ml-4">📁 config/</div>
                        <div class="ml-4">📁 database/</div>
                        <div class="ml-8">📁 migrations/</div>
                        <div class="ml-8">📁 seeders/</div>
                        <div class="ml-4">📁 resources/</div>
                        <div class="ml-8">📁 views/</div>
                        <div class="ml-4">📁 routes/</div>
                        <div class="ml-8">📄 web.php</div>
                        <div class="ml-8">📄 api.php</div>
                        <div class="ml-4">📄 module.json</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-between">
            <a href="{{ route('admin.modules.index') }}" class="btn-outline">
                ← Back to Modules
            </a>

            <div class="flex space-x-3">
                @if($module->canBeDisabled() || !$module->is_enabled)
                    <form method="POST" action="{{ route('admin.modules.update', $module) }}">
                        @csrf
                        @method('PATCH')
                        <input type="hidden" name="is_enabled" value="{{ $module->is_enabled ? '0' : '1' }}">
                        <button type="submit" class="btn-outline">
                            {{ $module->is_enabled ? 'Disable' : 'Enable' }} Module
                        </button>
                    </form>
                @endif

                <a href="{{ route('admin.modules.edit', $module) }}" class="btn-primary">
                    Edit Module
                </a>
            </div>
        </div>
    </div>
@endsection