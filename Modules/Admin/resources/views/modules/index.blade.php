@extends('admin::layouts.app')

@section('title', 'Modules')
@section('page-title', 'Module Management')
@section('page-description', 'Install, manage, and configure application modules')

@section('content')
    <div class="space-y-6">
        <!-- Header Actions -->
        <div class="flex items-center justify-between">
            <div class="flex items-center space-x-4">
                <div class="text-sm text-muted-foreground">
                    Total: {{ $installedModules->count() }} modules
                    ({{ $installedModules->where('is_enabled', true)->count() }} enabled)
                </div>
            </div>

            <a href="{{ route('admin.modules.create') }}" class="btn-default">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                </svg>
                Upload Module
            </a>
        </div>

        <!-- Modules Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            @forelse($installedModules as $module)
                <div class="bg-card border border-border rounded-lg p-6 hover:shadow-lg transition-shadow">
                    <!-- Module Header -->
                    <div class="flex items-start justify-between mb-4">
                        <div class="flex items-center space-x-3">
                            <div class="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                                <svg class="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M19 11H5m14-7l-7 7m0 0l-7-7m7 7v11"></path>
                                </svg>
                            </div>
                            <div>
                                <h3 class="text-lg font-semibold text-card-foreground">{{ $module->name }}</h3>
                                <p class="text-sm text-muted-foreground">v{{ $module->version }}</p>
                            </div>
                        </div>

                        <!-- Status Badge -->
                        @if($module->is_enabled)
                            <span
                                class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                <div class="w-1.5 h-1.5 bg-green-500 rounded-full mr-1"></div>
                                Enabled
                            </span>
                        @else
                            <span
                                class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                                <div class="w-1.5 h-1.5 bg-gray-500 rounded-full mr-1"></div>
                                Disabled
                            </span>
                        @endif
                    </div>

                    <!-- Module Description -->
                    <p class="text-sm text-muted-foreground mb-4 line-clamp-3">
                        {{ $module->description }}
                    </p>

                    <!-- Module Info -->
                    <div class="space-y-2 mb-4">
                        @if($module->author)
                            <div class="flex items-center text-xs text-muted-foreground">
                                <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                                </svg>
                                {{ $module->author }}
                            </div>
                        @endif

                        <div class="flex items-center text-xs text-muted-foreground">
                            <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M8 7V3a4 4 0 118 0v4m-4 9v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z">
                                </path>
                            </svg>
                            Installed {{ $module->installation_date }}
                        </div>

                        @if($module->is_core)
                            <div class="flex items-center text-xs text-muted-foreground">
                                <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z">
                                    </path>
                                </svg>
                                Core Module
                            </div>
                        @endif
                    </div>

                    <!-- Actions -->
                    <div class="flex items-center justify-between pt-4 border-t border-border">
                        <div class="flex space-x-2">
                            <a href="{{ route('admin.modules.show', $module) }}" class="btn-ghost btn-sm">
                                <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z">
                                    </path>
                                </svg>
                                View
                            </a>

                            @if($module->canBeDeleted())
                                <form method="POST" action="{{ route('admin.modules.destroy', $module) }}"
                                    onsubmit="return confirm('Are you sure you want to uninstall this module?')">
                                    @csrf
                                    @method('DELETE')
                                    <button type="submit" class="btn-ghost btn-sm text-destructive">
                                        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16">
                                            </path>
                                        </svg>
                                        Delete
                                    </button>
                                </form>
                            @endif
                        </div>

                        <!-- Enable/Disable Toggle -->
                        @if($module->canBeDisabled() || !$module->is_enabled)
                            <form method="POST" action="{{ route('admin.modules.update', $module) }}">
                                @csrf
                                @method('PATCH')
                                @if($module->is_enabled)
                                    <input type="hidden" name="action" value="disable">
                                    <button type="submit" class="btn-outline btn-sm">
                                        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                        </svg>
                                        Disable
                                    </button>
                                @else
                                    <input type="hidden" name="action" value="enable">
                                    <button type="submit" class="btn-default btn-sm">
                                        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                        </svg>
                                        Enable
                                    </button>
                                @endif
                            </form>
                        @endif
                    </div>
                </div>
            @empty
                <div class="col-span-full">
                    <div class="text-center py-12">
                        <svg class="w-12 h-12 text-muted-foreground mx-auto mb-4" fill="none" stroke="currentColor"
                            viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M19 11H5m14-7l-7 7m0 0l-7-7m7 7v11"></path>
                        </svg>
                        <h3 class="text-lg font-medium text-card-foreground mb-2">No modules installed</h3>
                        <p class="text-muted-foreground mb-4">Get started by uploading your first module.</p>
                        <a href="{{ route('admin.modules.create') }}" class="btn-default">Upload Module</a>
                    </div>
                </div>
            @endforelse
        </div>
    </div>
@endsection