@extends('admin::layouts.app')

@section('title', 'Users')
@section('page-title', 'Users')
@section('page-description', 'Manage system users and their permissions')

@section('content')
    <div class="space-y-6">
        <!-- Header Actions -->
        <div class="flex items-center justify-between">
            <div class="flex items-center space-x-4">
                <!-- Search -->
                <div class="relative">
                    <svg class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground"
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                    <input type="text" placeholder="Search users..." class="input pl-10 w-64"
                        value="{{ request('search') }}" onchange="updateFilters('search', this.value)">
                </div>

                <!-- Role Filter -->
                <select class="select w-40" onchange="updateFilters('role', this.value)">
                    <option value="">All Roles</option>
                    @foreach($roles as $role)
                        <option value="{{ $role->name }}" {{ request('role') === $role->name ? 'selected' : '' }}>
                            {{ ucfirst($role->name) }}
                        </option>
                    @endforeach
                </select>

                <!-- Status Filter -->
                <select class="select w-32" onchange="updateFilters('status', this.value)">
                    <option value="">All Status</option>
                    <option value="active" {{ request('status') === 'active' ? 'selected' : '' }}>Active</option>
                    <option value="inactive" {{ request('status') === 'inactive' ? 'selected' : '' }}>Inactive</option>
                </select>
            </div>

            <a href="{{ route('admin.users.create') }}" class="btn-default">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6">
                    </path>
                </svg>
                Add User
            </a>
        </div>

        <!-- Users Table -->
        <div class="bg-card border border-border rounded-lg overflow-hidden">
            <div class="overflow-x-auto">
                <table class="table">
                    <thead class="table-header">
                        <tr>
                            <th class="table-header-cell">User</th>
                            <th class="table-header-cell">Email</th>
                            <th class="table-header-cell">Roles</th>
                            <th class="table-header-cell">Status</th>
                            <th class="table-header-cell">Joined</th>
                            <th class="table-header-cell">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse($users as $user)
                            <tr class="table-row">
                                <td class="table-cell">
                                    <div class="flex items-center">
                                        <img src="{{ $user->avatar_url }}" alt="{{ $user->name }}"
                                            class="w-10 h-10 rounded-full mr-3">
                                        <div>
                                            <div class="font-medium text-card-foreground">{{ $user->full_name }}</div>
                                            <div class="text-sm text-muted-foreground">{{ $user->name }}</div>
                                        </div>
                                    </div>
                                </td>
                                <td class="table-cell">
                                    <div class="text-sm text-card-foreground">{{ $user->email }}</div>
                                </td>
                                <td class="table-cell">
                                    <div class="flex flex-wrap gap-1">
                                        @forelse($user->roles as $role)
                                            <span class="badge badge-secondary">{{ $role->name }}</span>
                                        @empty
                                            <span class="text-muted-foreground text-sm">No roles</span>
                                        @endforelse
                                    </div>
                                </td>
                                <td class="table-cell">
                                    @if($user->is_active)
                                        <span
                                            class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                            <div class="w-1.5 h-1.5 bg-green-500 rounded-full mr-1"></div>
                                            Active
                                        </span>
                                    @else
                                        <span
                                            class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                                            <div class="w-1.5 h-1.5 bg-red-500 rounded-full mr-1"></div>
                                            Inactive
                                        </span>
                                    @endif
                                </td>
                                <td class="table-cell">
                                    <div class="text-sm text-card-foreground">{{ $user->created_at->format('M d, Y') }}</div>
                                    <div class="text-xs text-muted-foreground">{{ $user->created_at->diffForHumans() }}</div>
                                </td>
                                <td class="table-cell">
                                    <div class="flex items-center space-x-2">
                                        <a href="{{ route('admin.users.show', $user) }}" class="btn-ghost btn-sm">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z">
                                                </path>
                                            </svg>
                                        </a>
                                        <a href="{{ route('admin.users.edit', $user) }}" class="btn-ghost btn-sm">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z">
                                                </path>
                                            </svg>
                                        </a>
                                        @if($user->id !== auth()->id())
                                            <form method="POST" action="{{ route('admin.users.destroy', $user) }}"
                                                onsubmit="return confirm('Are you sure you want to delete this user?')">
                                                @csrf
                                                @method('DELETE')
                                                <button type="submit"
                                                    class="btn-ghost btn-sm text-destructive hover:text-destructive">
                                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16">
                                                        </path>
                                                    </svg>
                                                </button>
                                            </form>
                                        @endif
                                    </div>
                                </td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="6" class="table-cell text-center py-12">
                                    <div class="flex flex-col items-center">
                                        <svg class="w-12 h-12 text-muted-foreground mb-4" fill="none" stroke="currentColor"
                                            viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z">
                                            </path>
                                        </svg>
                                        <h3 class="text-lg font-medium text-card-foreground mb-2">No users found</h3>
                                        <p class="text-muted-foreground mb-4">Get started by creating your first user.</p>
                                        <a href="{{ route('admin.users.create') }}" class="btn-default">Add User</a>
                                    </div>
                                </td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Pagination -->
        @if($users->hasPages())
            <div class="flex items-center justify-between">
                <div class="text-sm text-muted-foreground">
                    Showing {{ $users->firstItem() }} to {{ $users->lastItem() }} of {{ $users->total() }} results
                </div>
                {{ $users->links() }}
            </div>
        @endif
    </div>

    @push('scripts')
        <script>
            function updateFilters(param, value) {
                const url = new URL(window.location);
                if (value) {
                    url.searchParams.set(param, value);
                } else {
                    url.searchParams.delete(param);
                }
                window.location.href = url.toString();
            }
        </script>
    @endpush
@endsection