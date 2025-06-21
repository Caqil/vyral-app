<?php

namespace Modules\Admin\app\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\View\View;
use Illuminate\Support\Facades\DB;

class ActivityLogsController extends Controller
{
    public function index(Request $request): View
    {
        // In a real application, you'd have an activity_logs table
        // This is sample data for demonstration
        $activities = collect([
            (object) [
                'id' => 1,
                'user_name' => 'John Doe',
                'action' => 'created',
                'subject' => 'User',
                'subject_id' => 5,
                'description' => 'Created new user: Jane Smith',
                'ip_address' => '192.168.1.1',
                'created_at' => now()->subMinutes(5),
            ],
            (object) [
                'id' => 2,
                'user_name' => 'Admin User',
                'action' => 'updated',
                'subject' => 'Role',
                'subject_id' => 2,
                'description' => 'Updated role permissions for moderator',
                'ip_address' => '192.168.1.2',
                'created_at' => now()->subMinutes(15),
            ],
            (object) [
                'id' => 3,
                'user_name' => 'Jane Smith',
                'action' => 'login',
                'subject' => 'Auth',
                'subject_id' => null,
                'description' => 'User logged in',
                'ip_address' => '192.168.1.3',
                'created_at' => now()->subHour(),
            ],
        ]);

        return view('admin::activity-logs.index', compact('activities'));
    }
}
