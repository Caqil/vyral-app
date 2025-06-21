<?php

namespace Modules\Admin\app\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\View\View;
use Illuminate\Http\RedirectResponse;

class EmailTemplateController extends Controller
{
    public function index(): View
    {
        // Sample data - in real app, fetch from database
        $templates = collect([
            (object) [
                'id' => 1,
                'name' => 'Welcome Email',
                'subject' => 'Welcome to Our Platform!',
                'type' => 'user_registration',
                'status' => 'active',
                'updated_at' => now(),
            ],
            (object) [
                'id' => 2,
                'name' => 'Password Reset',
                'subject' => 'Reset Your Password',
                'type' => 'password_reset',
                'status' => 'active',
                'updated_at' => now()->subDays(2),
            ],
        ]);

        return view('admin::email-templates.index', compact('templates'));
    }

    public function create(): View
    {
        return view('admin::email-templates.create');
    }

    public function store(Request $request): RedirectResponse
    {
        // Handle template creation
        return redirect()->route('admin.email-templates.index')
            ->with('success', 'Email template created successfully.');
    }

    public function edit($id): View
    {
        // Sample template data
        $template = (object) [
            'id' => $id,
            'name' => 'Welcome Email',
            'subject' => 'Welcome to Our Platform!',
            'body' => '<h1>Welcome {{name}}!</h1><p>Thank you for joining us.</p>',
            'type' => 'user_registration',
            'status' => 'active',
        ];

        return view('admin::email-templates.edit', compact('template'));
    }
}