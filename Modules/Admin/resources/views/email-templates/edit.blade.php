@extends('admin::layouts.app')

@section('title', 'Edit Email Template')
@section('page-title', 'Edit Email Template')
@section('page-description', 'Modify email template content and settings')

@section('content')
    <div class="max-w-4xl mx-auto">
        <div class="card">
            <div class="card-header">
                <h3 class="text-lg font-semibold">Edit Template: {{ $template->name }}</h3>
            </div>

            <form class="card-body space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-sm font-medium text-foreground mb-2">Template Name</label>
                        <input type="text" value="{{ $template->name }}" class="input">
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-foreground mb-2">Type</label>
                        <select class="select">
                            <option value="user_registration" {{ $template->type === 'user_registration' ? 'selected' : '' }}>
                                User Registration</option>
                            <option value="password_reset" {{ $template->type === 'password_reset' ? 'selected' : '' }}>
                                Password Reset</option>
                            <option value="notification" {{ $template->type === 'notification' ? 'selected' : '' }}>
                                Notification</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-foreground mb-2">Subject Line</label>
                    <input type="text" value="{{ $template->subject }}" class="input">
                </div>

                <div>
                    <label class="block text-sm font-medium text-foreground mb-2">Email Body</label>
                    <textarea rows="12" class="input">{{ $template->body }}</textarea>
                    <p class="text-xs text-muted-foreground mt-1">Available variables: {{name}}, {{email}}, {{date}}</p>
                </div>

                <div class="flex items-center justify-between pt-6 border-t border-border">
                    <a href="{{ route('admin.email-templates.index') }}" class="btn-outline">Cancel</a>
                    <div class="flex space-x-3">
                        <button type="button" class="btn-outline">Send Test</button>
                        <button type="submit" class="btn-primary">Save Template</button>
                    </div>
                </div>
            </form>
        </div>
    </div>
@endsection