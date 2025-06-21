@extends('admin::layouts.app')

@section('title', 'Email Templates')
@section('page-title', 'Email Templates')
@section('page-description', 'Manage email templates and notifications')

@section('content')
    <div class="space-y-6">

        <!-- Header Actions -->
        <div class="flex items-center justify-between">
            <div class="text-sm text-muted-foreground">
                {{ $templates->count() }} templates
            </div>

            <a href="{{ route('admin.email-templates.create') }}" class="btn-primary">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                </svg>
                Create Template
            </a>
        </div>

        <!-- Templates Table -->
        <div class="card">
            <div class="card-header">
                <h3 class="text-lg font-semibold">Email Templates</h3>
            </div>

            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="border-b border-border">
                        <tr class="text-left">
                            <th class="px-4 py-3 font-medium">Name</th>
                            <th class="px-4 py-3 font-medium">Subject</th>
                            <th class="px-4 py-3 font-medium">Type</th>
                            <th class="px-4 py-3 font-medium">Status</th>
                            <th class="px-4 py-3 font-medium">Last Updated</th>
                            <th class="px-4 py-3 font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-border">
                        @foreach($templates as $template)
                            <tr>
                                <td class="px-4 py-3">
                                    <div class="font-medium">{{ $template->name }}</div>
                                </td>
                                <td class="px-4 py-3 text-sm text-muted-foreground">
                                    {{ $template->subject }}
                                </td>
                                <td class="px-4 py-3">
                                    <span
                                        class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                        {{ str_replace('_', ' ', $template->type) }}
                                    </span>
                                </td>
                                <td class="px-4 py-3">
                                    <span
                                        class="inline-flex items-center px-2 py-1 rounded text-xs font-medium
                                                   {{ $template->status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800' }}">
                                        {{ ucfirst($template->status) }}
                                    </span>
                                </td>
                                <td class="px-4 py-3 text-sm text-muted-foreground">
                                    {{ $template->updated_at->format('M d, Y') }}
                                </td>
                                <td class="px-4 py-3">
                                    <div class="flex space-x-2">
                                        <a href="{{ route('admin.email-templates.edit', $template->id) }}"
                                            class="btn-ghost btn-sm">
                                            Edit
                                        </a>
                                        <button class="btn-ghost btn-sm text-blue-600">Preview</button>
                                    </div>
                                </td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>
        </div>
    </div>
@endsection