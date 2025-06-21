<?php?>
@extends('admin::layouts.app')

@section('title', 'Edit User')
@section('page-title', 'Edit User')
@section('page-description', 'Update user information and permissions')

@section('content')
<div class="max-w-4xl mx-auto">
    <div class="card">
        <div class="card-header">
            <h3 class="text-lg font-semibold">Edit User: {{ $user->name }}</h3>
        </div>
        
        <form method="POST" action="{{ route('admin.users.update', $user) }}" class="card-body space-y-6">
            @csrf
            @method('PATCH')
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- First Name -->
                <div>
                    <label for="first_name" class="block text-sm font-medium text-foreground mb-2">
                        First Name <span class="text-destructive">*</span>
                    </label>
                    <input type="text" id="first_name" name="first_name" 
                           value="{{ old('first_name', $user->first_name) }}" 
                           class="input @error('first_name') border-destructive @enderror" required>
                    @error('first_name')
                        <p class="text-sm text-destructive mt-1">{{ $message }}</p>
                    @enderror
                </div>

                <!-- Last Name -->
                <div>
                    <label for="last_name" class="block text-sm font-medium text-foreground mb-2">
                        Last Name <span class="text-destructive">*</span>
                    </label>
                    <input type="text" id="last_name" name="last_name" 
                           value="{{ old('last_name', $user->last_name) }}" 
                           class="input @error('last_name') border-destructive @enderror" required>
                    @error('last_name')
                        <p class="text-sm text-destructive mt-1">{{ $message }}</p>
                    @enderror
                </div>

                <!-- Email -->
                <div>
                    <label for="email" class="block text-sm font-medium text-foreground mb-2">
                        Email <span class="text-destructive">*</span>
                    </label>
                    <input type="email" id="email" name="email" 
                           value="{{ old('email', $user->email) }}" 
                           class="input @error('email') border-destructive @enderror" required>
                    @error('email')
                        <p class="text-sm text-destructive mt-1">{{ $message }}</p>
                    @enderror
                </div>

                <!-- Status -->
                <div>
                    <label for="is_active" class="block text-sm font-medium text-foreground mb-2">
                        Status
                    </label>
                    <div class="flex items-center space-x-2">
                        <input type="checkbox" id="is_active" name="is_active" value="1" 
                               {{ old('is_active', $user->is_active) ? 'checked' : '' }} 
                               class="checkbox">
                        <label for="is_active" class="text-sm">Active</label>
                    </div>
                </div>
            </div>

            <!-- Roles -->
            <div>
                <label class="block text-sm font-medium text-foreground mb-3">Roles</label>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                    @foreach($roles as $role)
                        <div class="flex items-center space-x-2">
                            <input type="checkbox" id="role_{{ $role->id }}" name="roles[]" 
                                   value="{{ $role->name }}" 
                                   {{ $user->hasRole($role->name) ? 'checked' : '' }} 
                                   class="checkbox">
                            <label for="role_{{ $role->id }}" class="text-sm">
                                {{ ucfirst($role->name) }}
                            </label>
                        </div>
                    @endforeach
                </div>
            </div>

            <!-- Password Update -->
            <div class="border-t border-border pt-6">
                <h4 class="text-md font-semibold mb-4">Change Password (Optional)</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label for="password" class="block text-sm font-medium text-foreground mb-2">
                            New Password
                        </label>
                        <input type="password" id="password" name="password" 
                               class="input @error('password') border-destructive @enderror">
                        @error('password')
                            <p class="text-sm text-destructive mt-1">{{ $message }}</p>
                        @enderror
                    </div>

                    <div>
                        <label for="password_confirmation" class="block text-sm font-medium text-foreground mb-2">
                            Confirm Password
                        </label>
                        <input type="password" id="password_confirmation" name="password_confirmation" 
                               class="input">
                    </div>
                </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center justify-between pt-6 border-t border-border">
                <a href="{{ route('admin.users.index') }}" class="btn-outline">
                    Cancel
                </a>
                <button type="submit" class="btn-primary">
                    Update User
                </button>
            </div>
        </form>
    </div>
</div>
@endsection