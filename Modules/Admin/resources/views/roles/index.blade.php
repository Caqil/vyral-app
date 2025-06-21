<?php
// ==================================================
// 3. MISSING VIEW: roles/index.blade.php
// ==================================================
?>
{{-- File: Modules/Admin/resources/views/roles/index.blade.php --}}
@extends('admin::layouts.app')

@section('title', 'Roles & Permissions')
@section('page-title', 'Roles & Permissions')
@section('page-description', 'Manage user roles and their permissions')

@section('content')
    <div class="space-y-6">
        <!-- Header Actions -->
        <div class="flex items-center justify-between">
            <div class="flex items-center space-x-4">
                <div class="text-sm text-muted-foreground">
                    Total: {{ $roles->count() }} roles
                </div>
            </div>

            <a href="{{ route('admin.roles.create') }}" class="btn-primary">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                </svg>
                Create Role
            </a>
        </div>

        <!-- Roles Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            @forelse($roles as $role)
                <div class="card">
                    <div class="card-body">
                        <div class="flex items-start justify-between mb-4">
                            <div>
                                <h3 class="text-lg font-semibold capitalize">{{ $role->name }}</h3>
                                <p class="text-sm text-muted-foreground">
                                    {{ $role->users_count }} {{ Str::plural('user', $role->users_count) }}
                                </p>
                            </div>

                            <!-- Role Badge -->
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                           {{ $role->name === 'admin' ? 'bg-red-100 text-red-800' :
                ($role->name === 'moderator' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800') }}">
                                {{ ucfirst($role->name) }}
                            </span>
                        </div>

                        <!-- Permissions Preview -->
                        <div class="mb-4">
                            <h4 class="text-sm font-medium mb-2">Permissions ({{ $role->permissions->count() }})</h4>
                            <div class="flex flex-wrap gap-1">
                                @foreach($role->permissions->take(3) as $permission)
                                    <span
                                        class="inline-flex items-center px-2 py-1 rounded text-xs bg-accent text-accent-foreground">
                                        {{ $permission->name }}
                                    </span>
                                @endforeach
                                @if($role->permissions->count() > 3)
                                    <span class="inline-flex items-center px-2 py-1 rounded text-xs bg-muted text-muted-foreground">
                                        +{{ $role->permissions->count() - 3 }} more
                                    </span>
                                @endif
                            </div>
                        </div>

                        <!-- Actions -->
                        <div class="flex items-center justify-between pt-4 border-t border-border">
                            <div class="flex space-x-2">
                                <a href="{{ route('admin.roles.show', $role) }}" class="btn-ghost btn-sm">
                                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z">
                                        </path>
                                    </svg>
                                    View
                                </a>

                                <a href="{{ route('admin.roles.edit', $role) }}" class="btn-ghost btn-sm">
                                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z">
                                        </path>
                                    </svg>
                                    Edit
                                </a>
                            </div>

                            @if($role->name !== 'admin')
                                <form method="POST" action="{{ route('admin.roles.destroy', $role) }}"
                                    onsubmit="return confirm('Are you sure you want to delete this role?')">
                                    @csrf
                                    @method('DELETE')
                                    <button type="submit" class="btn-ghost btn-sm text-destructive">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16">
                                            </path>
                                        </svg>
                                    </button>
                                </form>
                            @endif
                        </div>
                    </div>
                </div>
            @empty
                <div class="col-span-full">
                    <div class="text-center py-12">
                        <svg class="mx-auto h-12 w-12 text-muted-foreground" fill="none" stroke="currentColor"
                            viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z">
                            </path>
                        </svg>
                        <h3 class="mt-2 text-sm font-medium">No roles found</h3>
                        <p class="mt-1 text-sm text-muted-foreground">Get started by creating a new role.</p>
                        <div class="mt-6">
                            <a href="{{ route('admin.roles.create') }}" class="btn-primary">
                                Create Role
                            </a>
                        </div>
                    </div>
                </div>
            @endforelse
        </div>
    </div>
@endsection