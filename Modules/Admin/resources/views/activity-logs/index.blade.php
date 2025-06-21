<?php
// ==================================================
// 6. ADDITIONAL VIEW: activity-logs/index.blade.php
// ==================================================
?>
{{-- File: Modules/Admin/resources/views/activity-logs/index.blade.php --}}
@extends('admin::layouts.app')

@section('title', 'Activity Logs')
@section('page-title', 'Activity Logs')
@section('page-description', 'Monitor system activities and user actions')

@section('content')
    <div class="space-y-6">

        <!-- Filters -->
        <div class="card">
            <div class="card-body">
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-foreground mb-2">User</label>
                        <select class="select">
                            <option value="">All Users</option>
                            <option value="1">John Doe</option>
                            <option value="2">Jane Smith</option>
                            <option value="3">Admin User</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-foreground mb-2">Action</label>
                        <select class="select">
                            <option value="">All Actions</option>
                            <option value="created">Created</option>
                            <option value="updated">Updated</option>
                            <option value="deleted">Deleted</option>
                            <option value="login">Login</option>
                            <option value="logout">Logout</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-foreground mb-2">Date From</label>
                        <input type="date" class="input">
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-foreground mb-2">Date To</label>
                        <input type="date" class="input">
                    </div>
                </div>

                <div class="mt-4 flex space-x-3">
                    <button class="btn-primary">Apply Filters</button>
                    <button class="btn-outline">Clear</button>
                    <button class="btn-outline ml-auto">Export</button>
                </div>
            </div>
        </div>

        <!-- Activity List -->
        <div class="card">
            <div class="card-header">
                <h3 class="text-lg font-semibold">Recent Activities</h3>
            </div>

            <div class="divide-y divide-border">
                @foreach($activities as $activity)
                        <div class="p-4 flex items-start space-x-4">
                            <!-- Action Icon -->
                            <div class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
                                                      {{ $activity->action === 'created' ? 'bg-green-100 text-green-600' :
                    ($activity->action === 'updated' ? 'bg-blue-100 text-blue-600' :
                        ($activity->action === 'deleted' ? 'bg-red-100 text-red-600' :
                            'bg-gray-100 text-gray-600')) }}">
                                @if($activity->action === 'created')
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                                    </svg>
                                @elseif($activity->action === 'updated')
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z">
                                        </path>
                                    </svg>
                                @elseif($activity->action === 'deleted')
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16">
                                        </path>
                                    </svg>
                                @else
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                                    </svg>
                                @endif
                            </div>

                            <!-- Activity Details -->
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center justify-between">
                                    <div>
                                        <p class="text-sm font-medium text-foreground">
                                            {{ $activity->user_name }}
                                            <span class="font-normal text-muted-foreground">{{ $activity->action }}</span>
                                            {{ strtolower($activity->subject) }}
                                        </p>
                                        <p class="text-sm text-muted-foreground">{{ $activity->description }}</p>
                                    </div>

                                    <div class="text-right text-sm text-muted-foreground">
                                        <div>{{ $activity->created_at->format('M d, Y') }}</div>
                                        <div>{{ $activity->created_at->format('H:i:s') }}</div>
                                    </div>
                                </div>

                                <div class="mt-2 flex items-center space-x-4 text-xs text-muted-foreground">
                                    <span>IP: {{ $activity->ip_address }}</span>
                                    @if($activity->subject_id)
                                        <span>ID: {{ $activity->subject_id }}</span>
                                    @endif
                                </div>
                            </div>
                        </div>
                @endforeach
            </div>

            <!-- Pagination -->
            <div class="p-4 border-t border-border">
                <div class="flex items-center justify-between">
                    <div class="text-sm text-muted-foreground">
                        Showing 1 to 3 of 150 activities
                    </div>
                    <div class="flex space-x-2">
                        <button class="btn-outline btn-sm" disabled>Previous</button>
                        <button class="btn-outline btn-sm">Next</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection