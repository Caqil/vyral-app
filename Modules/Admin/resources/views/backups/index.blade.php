@extends('admin::layouts.app')

@section('title', 'Backups')
@section('page-title', 'Backup Management')
@section('page-description', 'Create and manage system backups')

@section('content')
    <div class="space-y-6">

        <!-- Backup Stats -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="card">
                <div class="card-body text-center">
                    <div class="text-2xl font-bold text-blue-600">{{ $backups->count() }}</div>
                    <div class="text-sm text-muted-foreground">Total Backups</div>
                </div>
            </div>

            <div class="card">
                <div class="card-body text-center">
                    <div class="text-2xl font-bold text-green-600">
                        {{ $backups->sum(fn($backup) => (float) str_replace(' MB', '', $backup->size)) }} MB
                    </div>
                    <div class="text-sm text-muted-foreground">Total Size</div>
                </div>
            </div>

            <div class="card">
                <div class="card-body text-center">
                    <div class="text-2xl font-bold text-purple-600">
                        {{ $backups->first() ? $backups->first()->created_at->diffForHumans() : 'Never' }}
                    </div>
                    <div class="text-sm text-muted-foreground">Last Backup</div>
                </div>
            </div>
        </div>

        <!-- Backup Actions -->
        <div class="card">
            <div class="card-body">
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="text-lg font-semibold mb-1">Create New Backup</h3>
                        <p class="text-sm text-muted-foreground">Generate a full system backup including database and files
                        </p>
                    </div>

                    <form method="POST" action="{{ route('admin.backups.create') }}">
                        @csrf
                        <button type="submit" class="btn-primary">
                            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4">
                                </path>
                            </svg>
                            Create Backup
                        </button>
                    </form>
                </div>
            </div>
        </div>

        <!-- Backup List -->
        <div class="card">
            <div class="card-header">
                <h3 class="text-lg font-semibold">Backup History</h3>
            </div>

            <div class="divide-y divide-border">
                @forelse($backups as $backup)
                    <div class="p-4 flex items-center justify-between">
                        <div class="flex items-center space-x-4">
                            <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4">
                                    </path>
                                </svg>
                            </div>

                            <div>
                                <div class="font-medium">{{ $backup->filename }}</div>
                                <div class="text-sm text-muted-foreground">
                                    {{ $backup->created_at->format('M d, Y H:i:s') }} • {{ $backup->size }}
                                </div>
                            </div>
                        </div>

                        <div class="flex items-center space-x-2">
                            <span
                                class="inline-flex items-center px-2 py-1 rounded text-xs font-medium
                                           {{ $backup->type === 'full' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800' }}">
                                {{ ucfirst($backup->type) }}
                            </span>

                            <div class="flex space-x-1">
                                <button class="btn-ghost btn-sm">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                                    </svg>
                                </button>

                                <form method="POST" action="{{ route('admin.backups.destroy', $backup->id) }}" class="inline">
                                    @csrf
                                    @method('DELETE')
                                    <button type="submit" class="btn-ghost btn-sm text-destructive"
                                        onclick="return confirm('Are you sure you want to delete this backup?')">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16">
                                            </path>
                                        </svg>
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                @empty
                    <div class="p-8 text-center">
                        <svg class="mx-auto h-12 w-12 text-muted-foreground" fill="none" stroke="currentColor"
                            viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4">
                            </path>
                        </svg>
                        <h3 class="mt-2 text-sm font-medium">No backups found</h3>
                        <p class="mt-1 text-sm text-muted-foreground">Get started by creating your first backup.</p>
                    </div>
                @endforelse
            </div>
        </div>

        <!-- Backup Settings -->
        <div class="card">
            <div class="card-header">
                <h3 class="text-lg font-semibold">Backup Settings</h3>
            </div>

            <div class="card-body space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-sm font-medium text-foreground mb-2">Automatic Backups</label>
                        <div class="flex items-center space-x-2">
                            <input type="checkbox" id="auto_backup" class="checkbox" checked>
                            <label for="auto_backup" class="text-sm">Enable scheduled backups</label>
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-foreground mb-2">Backup Frequency</label>
                        <select class="select">
                            <option value="daily" selected>Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-foreground mb-2">Retention Period</label>
                        <select class="select">
                            <option value="7">7 days</option>
                            <option value="30" selected>30 days</option>
                            <option value="90">90 days</option>
                            <option value="365">1 year</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-foreground mb-2">Storage Location</label>
                        <select class="select">
                            <option value="local" selected>Local Storage</option>
                            <option value="s3">Amazon S3</option>
                            <option value="dropbox">Dropbox</option>
                        </select>
                    </div>
                </div>

                <div class="pt-4 border-t border-border">
                    <button class="btn-primary">Save Settings</button>
                </div>
            </div>
        </div>
    </div>
@endsection