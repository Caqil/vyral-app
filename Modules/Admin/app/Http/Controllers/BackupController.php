<?php

namespace Modules\Admin\app\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\View\View;
use Illuminate\Http\RedirectResponse;

class BackupController extends Controller
{
    public function index(): View
    {
        // Sample backup data
        $backups = collect([
            (object) [
                'id' => 1,
                'filename' => 'backup_2025_06_21_14_30.zip',
                'size' => '45.2 MB',
                'type' => 'full',
                'created_at' => now(),
            ],
            (object) [
                'id' => 2,
                'filename' => 'backup_2025_06_20_02_00.zip',
                'size' => '42.8 MB',
                'type' => 'scheduled',
                'created_at' => now()->subDay(),
            ],
        ]);

        return view('admin::backups.index', compact('backups'));
    }

    public function create(): RedirectResponse
    {
        // Handle backup creation
        return redirect()->route('admin.backups.index')
            ->with('success', 'Backup created successfully.');
    }

    public function destroy($id): RedirectResponse
    {
        // Handle backup deletion
        return redirect()->route('admin.backups.index')
            ->with('success', 'Backup deleted successfully.');
    }
}