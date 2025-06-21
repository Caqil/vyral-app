<?php

use Illuminate\Support\Facades\Route;
use Modules\Admin\app\Http\Controllers\DashboardController;
use Modules\Admin\app\Http\Controllers\UserController;
use Modules\Admin\app\Http\Controllers\AnalyticsController;
use Modules\Admin\app\Http\Controllers\RoleController;
use Modules\Admin\app\Http\Controllers\ModuleController;
use Modules\Admin\app\Http\Controllers\SettingsController;
use Modules\Admin\app\Http\Controllers\ActivityLogsController;
use Modules\Admin\app\Http\Controllers\SystemLogsController;
use Modules\Admin\app\Http\Controllers\EmailTemplateController;
use Modules\Admin\app\Http\Controllers\FileManagerController;
use Modules\Admin\app\Http\Controllers\BackupController;
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
    // Activity Logs
    Route::get('/activity-logs', [ActivityLogsController::class, 'index'])->name('activity-logs.index');
    Route::get('/system-logs', [SystemLogsController::class, 'index'])->name('system-logs.index');
    Route::resource('email-templates', EmailTemplateController::class);
    Route::get('/file-manager', [FileManagerController::class, 'index'])->name('file-manager.index');
    Route::get('/backups', [BackupController::class, 'index'])->name('backups.index');
    Route::post('/backups/create', [BackupController::class, 'create'])->name('backups.create');
    Route::delete('/backups/{backup}', [BackupController::class, 'destroy'])->name('backups.destroy');
});