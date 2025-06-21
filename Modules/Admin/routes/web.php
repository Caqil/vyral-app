<?php

use Illuminate\Support\Facades\Route;
use Modules\Admin\app\Http\Controllers\DashboardController;
use Modules\Admin\app\Http\Controllers\UserController;
use Modules\Admin\app\Http\Controllers\AnalyticsController;
use Modules\Admin\app\Http\Controllers\RoleController;
use Modules\Admin\app\Http\Controllers\ModuleController;
use Modules\Admin\app\Http\Controllers\SettingsController;

Route::prefix('admin')->name('admin.')->middleware(['auth', 'permission:access admin panel'])->group(function () {
    Route::get('/', [DashboardController::class, 'index'])->name('dashboard');
    Route::get('/analytics', [AnalyticsController::class, 'index'])->name('analytics');

    // User Management
    Route::resource('users', UserController::class);

    // Roles & Permissions
    Route::resource('roles', RoleController::class);

    // Modules
    Route::resource('modules', ModuleController::class);

    // Settings
    Route::get('/settings', [SettingsController::class, 'index'])->name('settings.index');
    Route::post('/settings', [SettingsController::class, 'update'])->name('settings.update');

    // Profile
    Route::get('/profile', [SettingsController::class, 'profile'])->name('profile');
    Route::post('/profile', [SettingsController::class, 'updateProfile'])->name('profile.update');
});